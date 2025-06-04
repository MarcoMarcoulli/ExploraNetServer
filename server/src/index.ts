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
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(query, retries - 1, backoff * 2);
    }
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
 * Aggiunge al target i segmenti il cui midpoint ricade dentro turfPolygon.
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

    if (!turf.booleanPointInPolygon(midPoint, bboxPolygon)) continue;
    if (!turf.booleanPointInPolygon(midPoint, turfPolygon)) continue;

    target.push(seg);
  }
};

/**
 * Somma in km la lunghezza di tutti i segmenti passati.
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
    // 1. Converti [lat, lng] → [lng, lat]
    const coords: [number, number][] = (polygon as number[][]).map((p) => {
      if (!Array.isArray(p) || p.length < 2) {
        throw new Error("Invalid polygon coordinate: " + JSON.stringify(p));
      }
      return [p[1], p[0]];
    });
    // Chiudi il poligono
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([first[0], first[1]]);
    }

    // 2. Crea turfPolygon e calcola area
    const turfPolygon: Feature<Polygon | MultiPolygon, GeoJsonProperties> =
      turf.polygon([coords]);
    const areaKm2 = turf.area(turfPolygon) / 1_000_000;

    const clippedRoads: [number, number][][] = [];
    const clippedTrails: [number, number][][] = [];

    // 3. Ottieni bounding box
    const [minX, minY, maxX, maxY] = turf.bbox(turfPolygon);

    // Funzione per processare gli elementi Overpass
    const processElements = (
      elements: any[],
      bboxPol: Feature<Polygon | MultiPolygon, GeoJsonProperties>
    ) => {
      elements.forEach((el: any) => {
        const tag = el.tags?.highway;
        if (!tag) return;
        if (roadTags.has(tag)) {
          clipElements(el, turfPolygon, bboxPol, clippedRoads);
        } else {
          clipElements(el, turfPolygon, bboxPol, clippedTrails);
        }
      });
    };

    if (areaKm2 > 60) {
      // 4.a Area > 60 km²: suddividi in tile
      const step = 0.05;
      for (let x = minX; x < maxX; x += step) {
        for (let y = minY; y < maxY; y += step) {
          const tile: Feature<Polygon | MultiPolygon, GeoJsonProperties> =
            turf.bboxPolygon([x, y, x + step, y + step]);

          if (!turf.booleanIntersects(tile, turfPolygon)) continue;

          // Usa i vertici del tile per Overpass
          const ring = tile.geometry.coordinates[0] as [number, number][];
          const polyString = ring.map((p) => `${p[1]} ${p[0]}`).join(" ");
          const query = `
            [out:json][timeout:180];
            (
              way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|pedestrian|track|path|footway|bridleway|steps|via_ferrata|cycleway)$"](poly:"${polyString}");
            );
            out body geom;
          `.trim();

          try {
            const data = await fetchWithRetry(query);
            if (data.elements && Array.isArray(data.elements)) {
              processElements(data.elements, tile);
            }
          } catch {
            // errori già gestiti in fetchWithRetry
          }

          // pausa per evitare rate-limit
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    } else {
      // 4.b Area ≤ 60 km²: usa il poligono intero
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

      try {
        const data = await fetchWithRetry(query);
        if (data.elements && Array.isArray(data.elements)) {
          // Passa turfPolygon come bounding per il clipping
          processElements(data.elements, turfPolygon);
        }
      } catch {
        // errori già gestiti in fetchWithRetry
      }
    }

    // 5. Somma le lunghezze totali
    const totalKmRoads = sumKm(clippedRoads);
    const totalKmTrails = sumKm(clippedTrails);

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
    return res
      .status(500)
      .json({ error: "Internal server error: " + err.message });
  }
});

app.listen(3001, () => {
  console.log("✅ Server attivo su http://localhost:3001");
});
