import express, { Request, Response } from "express";
import axios from "axios";
import * as turf from "@turf/turf";
import cors from "cors";
import type {
  Feature,
  Polygon,
  MultiPolygon,
  GeoJsonProperties,
} from "geojson";

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Effettua una query Overpass con retry automatico.
 */
async function fetchWithRetry(
  query: string,
  retries = 3,
  backoff = 500
): Promise<any> {
  try {
    const response = await axios.post(
      "https://overpass.kumi.systems/api/interpreter",
      query,
      {
        headers: { "Content-Type": "text/plain" },
        timeout: 200_000,
      }
    );
    return response.data;
  } catch (err: any) {
    console.error("[fetchWithRetry] Overpass request failed:", err.message);
    if (retries > 0) {
      console.log(
        `[fetchWithRetry] Retrying in ${backoff}ms... (${retries} left)`
      );
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(query, retries - 1, backoff * 2);
    }
    console.error("[fetchWithRetry] Exhausted retries");
    throw err;
  }
}

const roadTags = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
]);

/**
 * Verifica ogni segmento: se il midpoint è dentro sia a bboxPolygon sia a turfPolygon,
 * lo aggiunge a `target`.
 */
const clipElements = (
  el: any,
  turfPolygon: Feature<Polygon | MultiPolygon, GeoJsonProperties>,
  bboxPolygon: Feature<Polygon | MultiPolygon, GeoJsonProperties>,
  target: [number, number][][]
) => {
  if (!el.geometry || !Array.isArray(el.geometry)) return;
  const line = el.geometry.map((g: any) => [g.lat, g.lon] as [number, number]);
  for (let i = 0; i < line.length - 1; i++) {
    const seg: [number, number][] = [line[i], line[i + 1]];
    const mid: [number, number] = [
      (seg[0][1] + seg[1][1]) / 2,
      (seg[0][0] + seg[1][0]) / 2,
    ];
    const midPoint = turf.point(mid);

    // Log del midpoint e dei controlli
    if (!turf.booleanPointInPolygon(midPoint, bboxPolygon)) {
      console.log("   → midpoint fuori bbox, scartato:", mid);
      continue;
    }
    if (!turf.booleanPointInPolygon(midPoint, turfPolygon)) {
      console.log("   → midpoint fuori polygon, scartato:", mid);
      continue;
    }
    // Se siamo qui, il segmento è valido
    target.push(seg);
    console.log("   → segmento aggiunto:", seg);
  }
};

/**
 * Somma in chilometri la lunghezza di tutti i segmenti.
 */
const sumKm = (segments: [number, number][][]) =>
  segments.reduce((acc, seg) => {
    const length = turf.length(turf.lineString(seg.map((c) => [c[1], c[0]])), {
      units: "kilometers",
    });
    return acc + length;
  }, 0);

app.post("/process-area", async (req: Request, res: Response) => {
  const { polygon } = req.body;
  if (!polygon || !Array.isArray(polygon)) {
    return res
      .status(400)
      .json({ error: "Polygon not provided or invalid format" });
  }

  try {
    // 1. Costruzione coords [lng, lat]
    const coords: [number, number][] = (polygon as number[][]).map((p) => {
      if (!Array.isArray(p) || p.length < 2) {
        throw new Error("Invalid polygon coordinate: " + JSON.stringify(p));
      }
      return [p[1], p[0]];
    });
    // Chiudo il poligono
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([first[0], first[1]]);
    }

    // 2. Creo il turfPolygon e calcolo area
    const turfPolygon: Feature<Polygon | MultiPolygon, GeoJsonProperties> =
      turf.polygon([coords]);
    const areaKm2 = turf.area(turfPolygon) / 1_000_000;
    console.log(`[DEBUG] Computed area: ${areaKm2.toFixed(2)} km²`);

    const clippedRoads: [number, number][][] = [];
    const clippedTrails: [number, number][][] = [];

    // 3. Calcolo il bounding box
    const [minX, minY, maxX, maxY] = turf.bbox(turfPolygon);
    console.log(`[DEBUG] BBOX: [${minX}, ${minY}, ${maxX}, ${maxY}]`);

    // Funzione interna per processare gli elementi di Overpass
    const processElements = (
      elements: any[],
      bboxPol: Feature<Polygon | MultiPolygon, GeoJsonProperties>
    ) => {
      console.log(`  → processElements called with ${elements.length} ways`);
      elements.forEach((el: any, idx: number) => {
        const tag = el.tags?.highway;
        if (!tag) return;
        console.log(`    - Way[${idx}] id=${el.id} highway=${tag}`);
        if (roadTags.has(tag)) {
          clipElements(el, turfPolygon, bboxPol, clippedRoads);
        } else {
          clipElements(el, turfPolygon, bboxPol, clippedTrails);
        }
      });
    };

    // 4. Branching per area > 60 km²
    if (areaKm2 > 60) {
      console.log("[DEBUG] Area > 60 km²: using tile subdivision");
      const step = 0.05; // valore intermedio per test
      let tileCount = 0;

      for (let x = minX; x < maxX; x += step) {
        for (let y = minY; y < maxY; y += step) {
          tileCount++;
          const tile: Feature<Polygon | MultiPolygon, GeoJsonProperties> =
            turf.bboxPolygon([x, y, x + step, y + step]);
          console.log(
            `Tile #${tileCount}: BBOX=[${x.toFixed(4)}, ${y.toFixed(4)}, ${(
              x + step
            ).toFixed(4)}, ${(y + step).toFixed(4)}]`
          );

          // 5. Controllo semplificato: se tile e poligono si intersecano
          if (!turf.booleanIntersects(tile, turfPolygon)) {
            console.log("  → tile non interseca poligono, skipping");
            continue;
          }
          console.log("  → tile interseca poligono, procedo");

          // 6. Uso i vertici del tile come polyString per Overpass
          const ring = tile.geometry.coordinates[0] as [number, number][];
          const polyString = ring.map((p) => `${p[1]} ${p[0]}`).join(" ");
          const query = `
            [out:json][timeout:180];
            (
              way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|pedestrian|track|path|footway|bridleway|steps|via_ferrata|cycleway)$"](poly:"${polyString}");
            );
            out body geom;
          `.trim();

          console.log(`    → Submitting Overpass query for tile #${tileCount}`);
          try {
            const data = await fetchWithRetry(query);
            const count = Array.isArray(data.elements)
              ? data.elements.length
              : 0;
            console.log(
              `    → Overpass returned ${count} ways for tile #${tileCount}`
            );
            if (data.elements && Array.isArray(data.elements)) {
              processElements(data.elements, tile);
            }
          } catch (err: any) {
            console.error("    [ERROR] Overpass tile:", err.message);
          }

          // Piccola pausa per evitare rate-limit
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      console.log(`[DEBUG] Total tiles processed: ${tileCount}`);
    } else {
      console.log("[DEBUG] Area ≤ 60 km²: single query mode");
      // 7. Costruisco la stringa "lat lon" dall'array originale [lat, lng]
      const polyString = (polygon as number[][])
        .map((p) => `${p[0]} ${p[1]}`)
        .join(" ");
      const query = `
        [out:json][timeout:180];
        (
          way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|pedestrian|track|path|footway|bridleway|steps|via_ferrata|cycleway)$"](poly:"${polyString}");
        );
        out body geom;
      `.trim();

      console.log("  → Submitting Overpass single query for entire polygon");
      try {
        const data = await fetchWithRetry(query);
        const count = Array.isArray(data.elements) ? data.elements.length : 0;
        console.log(`  → Overpass returned ${count} ways for single query`);
        if (data.elements && Array.isArray(data.elements)) {
          const bboxPolygon: Feature<
            Polygon | MultiPolygon,
            GeoJsonProperties
          > = turf.bboxPolygon([minX, minY, maxX, maxY]) as Feature<
            Polygon | MultiPolygon,
            GeoJsonProperties
          >;
          processElements(data.elements, bboxPolygon);
        }
      } catch (err: any) {
        console.error("  [ERROR] Overpass single query:", err.message);
      }
    }

    // 8. Stampo il conteggio di segmenti catturati
    console.log(`>>> clippedRoads segments: ${clippedRoads.length}`);
    console.log(`>>> clippedTrails segments: ${clippedTrails.length}`);

    // 9. Somma le lunghezze totali
    const totalKmRoads = sumKm(clippedRoads);
    const totalKmTrails = sumKm(clippedTrails);
    console.log(
      `[DEBUG] totalKmRoads=${totalKmRoads.toFixed(
        3
      )}, totalKmTrails=${totalKmTrails.toFixed(3)}`
    );

    return res.json({
      area: areaKm2,
      totalKmRoads,
      totalKmTrails,
      roads: clippedRoads,
      trails: clippedTrails,
      densityRoads: totalKmRoads / areaKm2,
      densityTrails: totalKmTrails / areaKm2,
    });
  } catch (err: any) {
    console.error("[SERVER ERROR]", err.stack || err.message || err);
    return res
      .status(500)
      .json({ error: "Internal server error: " + err.message });
  }
});

app.listen(3001, () => {
  console.log("✅ Server attivo su http://localhost:3001");
});
