import express, { Request, Response } from "express";
import axios from "axios";
import * as turf from "@turf/turf";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/process-area", async (req: Request, res: Response) => {
  const { polygon } = req.body;

  if (!polygon || !Array.isArray(polygon)) {
    return res.status(400).json({ error: "Polygon not provided" });
  }

  try {
    const coords = polygon.map(
      (p: number[]) => [p[1], p[0]] as [number, number]
    );
    if (
      coords[0][0] !== coords.at(-1)?.[0] ||
      coords[0][1] !== coords.at(-1)?.[1]
    ) {
      coords.push(coords[0]);
    }

    const turfPolygon = turf.polygon([coords]);
    const areaKm2 = turf.area(turfPolygon) / 1_000_000;

    const polyString = polygon
      .map((p: number[]) => `${p[0]} ${p[1]}`)
      .join(" ");
    const queryRoads = `[out:json][timeout:25];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"](poly:"${polyString}");out body geom;`;
    const queryTrails = `[out:json][timeout:25];way["highway"~"^(pedestrian|track|path|footway|bridleway|steps|via_ferrata|cycleway)$"](poly:"${polyString}");out body geom;`;

    const [respRoads, respTrails] = await Promise.all([
      axios.post("https://overpass-api.de/api/interpreter", queryRoads, {
        headers: { "Content-Type": "text/plain" },
      }),
      axios.post("https://overpass-api.de/api/interpreter", queryTrails, {
        headers: { "Content-Type": "text/plain" },
      }),
    ]);

    const clipElements = (elements: any[], target: [number, number][][]) => {
      elements.forEach((el) => {
        const line = el.geometry.map(
          (g: any) => [g.lat, g.lon] as [number, number]
        );
        for (let i = 0; i < line.length - 1; i++) {
          const seg: [number, number][] = [line[i], line[i + 1]];
          const mid: [number, number] = [
            (seg[0][1] + seg[1][1]) / 2,
            (seg[0][0] + seg[1][0]) / 2,
          ];
          if (turf.booleanPointInPolygon(turf.point(mid), turfPolygon)) {
            target.push(seg);
          }
        }
      });
    };

    const clippedRoads: [number, number][][] = [];
    const clippedTrails: [number, number][][] = [];

    clipElements(respRoads.data.elements, clippedRoads);
    clipElements(respTrails.data.elements, clippedTrails);

    const sumKm = (segments: [number, number][][]) =>
      segments.reduce(
        (acc, seg) =>
          acc +
          turf.length(turf.lineString(seg.map((c) => [c[1], c[0]])), {
            units: "kilometers",
          }),
        0
      );

    const totalKmRoads = sumKm(clippedRoads);
    const totalKmTrails = sumKm(clippedTrails);

    return res.json({
      area: areaKm2,
      totalKmRoads,
      roads: clippedRoads,
      trails: clippedTrails,
      totalKmTrails,
      densityRoads: totalKmRoads / areaKm2,
      densityTrails: totalKmTrails / areaKm2,
    });
  } catch (err: any) {
    console.error("Errore server:", err.message);
    return res.status(500).json({ error: "Errore interno" });
  }
});

app.listen(3001, () => {
  console.log("✅ Server attivo su http://localhost:3001");
});
