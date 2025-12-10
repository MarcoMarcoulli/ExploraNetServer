import express, { Request, Response } from "express";
import axios from "axios";
import * as turf from "@turf/turf";
import cors from "cors";
import type { Feature, Polygon, MultiPolygon, GeoJsonProperties } from "geojson";

const app = express();
app.use(cors());
app.options("*", cors());
app.use(express.json({ limit: "50mb" }));

async function fetchWithRetry(query: string, retries = 3, backoff = 1000): Promise<any> {
  try {
    const response = await axios.post(
      "https://overpass.private.coffee/api/interpreter",
      query,
      { headers: { "Content-Type": "text/plain" }, timeout: 20_000 }
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
  "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", 
  "residential", "living_street", "service", "motorway_link", "trunk_link", 
  "primary_link", "secondary_link", "tertiary_link", "bus_guideway", "road"
]);

const trailTags = new Set([
  "path", "track", "footway", "bridleway", "steps", 
  "via_ferrata", "cycleway", "pedestrian"
]);

const getClippedSegments = (
  el: any,
  turfPolygon: Feature<Polygon | MultiPolygon, GeoJsonProperties>,
  bboxPolygon: Feature<Polygon | MultiPolygon, GeoJsonProperties>
): [number, number][][] => {
  const segments: [number, number][][] = [];
  if (!el.geometry || !Array.isArray(el.geometry)) return segments;

  const line = el.geometry.map((g: any) => [g.lon, g.lat] as [number, number]);

  for (let i = 0; i < line.length - 1; i++) {
    const seg: [number, number][] = [line[i], line[i + 1]];
    const mid = [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2];
    const midPoint = turf.point(mid);

    if (turf.booleanPointInPolygon(midPoint, bboxPolygon) &&
        turf.booleanPointInPolygon(midPoint, turfPolygon)) {
      segments.push(seg);
    }
  }
  return segments;
};

const sumKm = (segments: [number, number][][]) =>
  segments.reduce((acc, seg) => {
    const length = turf.length(turf.lineString(seg), { units: "kilometers" });
    return acc + length;
  }, 0);

app.post("/process-area", async (req: Request, res: Response) => {
  console.log("=== /process-area called ===");
  const { polygon } = req.body;

  if (!polygon || !Array.isArray(polygon)) {
    return res.status(400).json({ error: "Polygon invalid" });
  }

  try {
    const coords: [number, number][] = (polygon as number[][]).map((p) => [p[1], p[0]]);
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push([first[0], first[1]]);

    const turfPolygon = turf.polygon([coords]);
    const areaKm2 = turf.area(turfPolygon) / 1_000_000;
    
    // Log ID (solo per debug)
    const requestId = Date.now().toString().slice(-4); 
    console.log(`[Req ${requestId}] Area: ${areaKm2.toFixed(2)} km²`);

    const clippedRoads: [number, number][][] = [];
    const clippedTrails: [number, number][][] = [];
    let totalKmRoads = 0;
    let totalKmTrails = 0;

    const [minX, minY, maxX, maxY] = turf.bbox(turfPolygon);
    const step = 0.12; 
    let currentTile = 0;
    const stepsX = Math.ceil((maxX - minX) / step);
    const stepsY = Math.ceil((maxY - minY) / step);
    const totalTiles = stepsX * stepsY;

    const processBatch = (elements: any[], tilePoly: Feature<Polygon | MultiPolygon>) => {
        elements.forEach((el: any) => {
            const tag = el.tags?.highway;
            if (!tag) return;
            const segments = getClippedSegments(el, turfPolygon, tilePoly);
            if (segments.length === 0) return;
            const batchLen = sumKm(segments);

            if (roadTags.has(tag)) {
                totalKmRoads += batchLen;
                segments.forEach(s => clippedRoads.push(s));
            } else if (trailTags.has(tag)) {
                if (tag === 'corridor') return;
                totalKmTrails += batchLen;
                segments.forEach(s => clippedTrails.push(s));
            }
        });
    };

    // CICLO STANDARD (Senza break, senza check abort)
    for (let x = minX; x < maxX; x += step)
    {
      for (let y = minY; y < maxY; y += step)
      {
        currentTile++;
        const tile = turf.bboxPolygon([x, y, x + step, y + step]);
        if (!turf.booleanIntersects(tile, turfPolygon)) continue;
        
        console.log(`[Req ${requestId}] Processing Tile #${currentTile}/${totalTiles}...`);
        
        const ring = tile.geometry.coordinates[0] as [number, number][];
        const polyString = ring.map((p) => `${p[1]} ${p[0]}`).join(" ");
        const query = `[out:json][timeout:25];(way["highway"](poly:"${polyString}"););out geom;`;

        try {
          const data = await fetchWithRetry(query);
          if (data.elements) processBatch(data.elements, tile);
        } catch (err: any) {
          console.error(`Tile error:`, err.message);
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    console.log(`[Req ${requestId}] Done.`);
    
    // Controlliamo solo qui se possiamo rispondere (se la connessione è ancora viva)
    if (!res.headersSent) {
        const LIMIT_KM_FOR_GEOJSON = 1000; 
        const isTooBig = (totalKmRoads + totalKmTrails) > LIMIT_KM_FOR_GEOJSON;

        return res.json({
          area: areaKm2,
          totalKmRoads,
          totalKmTrails,
          densityRoads: totalKmRoads / areaKm2,
          densityTrails: totalKmTrails / areaKm2,
          roads: isTooBig ? [] : clippedRoads,
          trails: isTooBig ? [] : clippedTrails,
          message: isTooBig ? "Area too large for visual rendering, metrics only." : "OK"
        });
    }

  } catch (err: any) {
    console.error("Server error:", err.message);
    if (!res.headersSent) return res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("✅ Server attivo su http://localhost:3001");
});