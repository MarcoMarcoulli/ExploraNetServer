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
app.use(express.json({ limit: "50mb" }));

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
        timeout: 5_000,
      }
    );
    return response.data;
  } catch (err: any) {
    if (retries > 0) {
      console.log(`[fetchWithRetry] Retry in ${backoff}ms (${retries} left)`);
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(query, retries - 1, backoff * 2);
    }
    console.error("[fetchWithRetry] Exhausted retries:", err.message);
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

/**
 * Helper per suddividere un array in chunk di dimensione n.
 */
function chunkArray<T>(arr: T[], n: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += n) {
    chunks.push(arr.slice(i, i + n));
  }
  return chunks;
}

app.post("/process-area", async (req: Request, res: Response) => {
  console.log("=== /process-area called ===");
  const { polygon } = req.body;
  if (!polygon || !Array.isArray(polygon)) {
    console.log("Invalid polygon payload");
    return res
      .status(400)
      .json({ error: "Polygon not provided or invalid format" });
  }

  try {
    console.log(`Received polygon with ${polygon.length} points`);

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
      console.log("Polygon was not closed; appended first point to close it");
    }

    // 2. Crea turfPolygon e calcola area
    const turfPolygon: Feature<Polygon | MultiPolygon, GeoJsonProperties> =
      turf.polygon([coords]);
    const areaKm2 = turf.area(turfPolygon) / 1_000_000;
    console.log(`Computed area: ${areaKm2.toFixed(2)} km²`);

    const clippedRoads: [number, number][][] = [];
    const clippedTrails: [number, number][][] = [];

    // 3. Ottieni bounding box
    const [minX, minY, maxX, maxY] = turf.bbox(turfPolygon);
    console.log(
      `Bounding box: [${minX.toFixed(4)}, ${minY.toFixed(4)}, ${maxX.toFixed(
        4
      )}, ${maxY.toFixed(4)}]`
    );

    // 4. Raccogliere tutti i tile che intersecano il poligono (ma non ancora processare)
    const step = 0.085;
    const tilesToProcess: Feature<Polygon | MultiPolygon, GeoJsonProperties>[] =
      [];
    for (let x = minX; x < maxX; x += step) {
      for (let y = minY; y < maxY; y += step) {
        const tile: Feature<Polygon | MultiPolygon, GeoJsonProperties> =
          turf.bboxPolygon([x, y, x + step, y + step]);
        if (turf.booleanIntersects(tile, turfPolygon)) {
          tilesToProcess.push(tile);
        }
      }
    }
    console.log(`Trovati ${tilesToProcess.length} tile da processare`);

    // 5. Funzione per processare gli elementi Overpass in base ai tag
    const processElements = (
      elements: any[],
      bboxPol: Feature<Polygon | MultiPolygon, GeoJsonProperties>
    ) => {
      console.log(`Processing ${elements.length} Overpass elements`);
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

    // 6. Funzione per inviare la query Overpass per un singolo tile e processare la risposta
    async function processOneTile(
      tile: Feature<Polygon | MultiPolygon, GeoJsonProperties>,
      index: number
    ) {
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

        // Se la risposta non contiene elements o è vuota, logghiamo un warning.
        if (
          !data.elements ||
          !Array.isArray(data.elements) ||
          data.elements.length === 0
        ) {
          console.warn(
            `[processOneTile] Tile #${index} ha restituito 0 elementi Overpass`
          );
        } else {
          processElements(data.elements, tile);
        }
      } catch (err: any) {
        console.error(
          `[processOneTile] Errore Overpass tile #${index}:`,
          err.message
        );
      }
    }

    // 7. Parallelizzare le richieste per batch di tile
    const CONCURRENCY = 500;
    const delayBetweenBatches = 5; // ms

    const tileBatches = chunkArray(tilesToProcess, CONCURRENCY);
    console.log(
      `Processo i tile in ${tileBatches.length} batch di max ${CONCURRENCY}`
    );

    let tileIndex = 0;
    for (let batchIndex = 0; batchIndex < tileBatches.length; batchIndex++) {
      const batch = tileBatches[batchIndex];
      // Lancia in parallelo tutte le promise per i tile nel batch
      const promises = batch.map((tile) => processOneTile(tile, tileIndex++));
      await Promise.all(promises);

      // Breve pausa tra un batch e l'altro
      if (batchIndex < tileBatches.length - 1) {
        await new Promise((r) => setTimeout(r, delayBetweenBatches));
      }
    }

    console.log(
      `Tutti i tile processati. Roads segments: ${clippedRoads.length}, Trails segments: ${clippedTrails.length}`
    );

    // 8. Somma le lunghezze totali
    const totalKmRoads = sumKm(clippedRoads);
    const totalKmTrails = sumKm(clippedTrails);
    console.log(
      `Computed lengths: roads=${totalKmRoads.toFixed(
        3
      )} km, trails=${totalKmTrails.toFixed(3)} km`
    );

    // 9. Risposta JSON
    if (totalKmRoads + totalKmTrails < 1500) {
      return res.json({
        area: areaKm2,
        totalKmRoads,
        totalKmTrails,
        roads: clippedRoads,
        trails: clippedTrails,
        densityRoads: totalKmRoads / areaKm2,
        densityTrails: totalKmTrails / areaKm2,
      });
    } else {
      return res.json({
        area: areaKm2,
        totalKmRoads,
        totalKmTrails,
        densityRoads: totalKmRoads / areaKm2,
        densityTrails: totalKmTrails / areaKm2,
      });
    }
  } catch (err: any) {
    console.error("Server error:", err.message);
    return res
      .status(500)
      .json({ error: "Internal server error: " + err.message });
  }
});

app.listen(3001, () => {
  console.log("✅ Server attivo su http://localhost:3001");
});
