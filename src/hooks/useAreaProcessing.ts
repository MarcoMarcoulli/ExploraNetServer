// src/hooks/useAreaProcessing.ts
import axios, { AxiosError } from "axios";
import * as turf from "@turf/turf";
import type { LatLngTuple } from "leaflet";

interface OverpassElement {
  geometry: { lat: number; lon: number }[];
}

interface OverpassResponse {
  elements: OverpassElement[];
}

export const useAreaProcessing = (
  setRoads: React.Dispatch<React.SetStateAction<LatLngTuple[][]>>,
  setTrails: React.Dispatch<React.SetStateAction<LatLngTuple[][]>>,
  setTotalLengthRoads: React.Dispatch<React.SetStateAction<number>>,
  setTotalLengthTrails: React.Dispatch<React.SetStateAction<number>>,
  setDensityRoads: React.Dispatch<React.SetStateAction<number>>,
  setDensityTrails: React.Dispatch<React.SetStateAction<number>>,
  setArea: React.Dispatch<React.SetStateAction<number>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  overpassController: React.MutableRefObject<AbortController | null>,
  showError: (message: string) => void
) => {
  const processArea = async (polygonPoints: LatLngTuple[]) => {
    overpassController.current?.abort();
    const controller = new AbortController();
    overpassController.current = controller;

    setIsLoading(true);

    const coords = polygonPoints.map((p) => [p[1], p[0]] as [number, number]);
    if (
      coords[0][0] !== coords[coords.length - 1][0] ||
      coords[0][1] !== coords[coords.length - 1][1]
    ) {
      coords.push(coords[0]);
    }
    const feature = turf.polygon([coords]);
    const areaKm2 = turf.area(feature) / 1_000_000;
    setArea(areaKm2);

    const polyString = polygonPoints.map((p) => `${p[0]} ${p[1]}`).join(" ");
    const queryRoads = `[out:json][timeout:25];way[\"highway\"~\"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$\"](poly:\"${polyString}\");out body geom;`;
    const queryTrails = `[out:json][timeout:25];way[\"highway\"~\"^(pedestrian|track|path|footway|bridleway|steps|via_ferrata|cycleway)$\"](poly:\"${polyString}\");out body geom;`;

    try {
      const respRoads = await axios.post<OverpassResponse>(
        "https://overpass-api.de/api/interpreter",
        queryRoads,
        { signal: controller.signal, headers: { "Content-Type": "text/plain" } }
      );

      const respTrails = await axios.post<OverpassResponse>(
        "https://overpass-api.de/api/interpreter",
        queryTrails,
        { signal: controller.signal, headers: { "Content-Type": "text/plain" } }
      );

      const clippedRoads: LatLngTuple[][] = [];
      const clippedTrails: LatLngTuple[][] = [];

      const clipElements = (
        elements: OverpassElement[],
        target: LatLngTuple[][]
      ) => {
        elements.forEach((el) => {
          const line = el.geometry.map((g) => [g.lat, g.lon] as LatLngTuple);
          for (let i = 0; i < line.length - 1; i++) {
            const seg: LatLngTuple[] = [line[i], line[i + 1]];
            const mid: [number, number] = [
              (seg[0][1] + seg[1][1]) / 2,
              (seg[0][0] + seg[1][0]) / 2,
            ];
            if (turf.booleanPointInPolygon(turf.point(mid), feature)) {
              target.push(seg);
            }
          }
        });
      };

      clipElements(respRoads.data.elements, clippedRoads);
      clipElements(respTrails.data.elements, clippedTrails);

      const sumKm = (segments: LatLngTuple[][]) =>
        segments.reduce(
          (acc, seg) =>
            acc +
            turf.length(turf.lineString(seg.map((c) => [c[1], c[0]])), {
              units: "kilometers",
            }),
          0
        );

      const sumKmRoads = sumKm(clippedRoads);
      const sumKmTrails = sumKm(clippedTrails);

      setRoads(clippedRoads);
      setTrails(clippedTrails);
      setTotalLengthRoads(sumKmRoads);
      setTotalLengthTrails(sumKmTrails);
      setDensityRoads(sumKmRoads / areaKm2);
      setDensityTrails(sumKmTrails / areaKm2);
    } catch (err) {
      if ((err as AxiosError).name !== "CanceledError") {
        showError("Errore recupero vie da Overpass API.");
      }
    } finally {
      setIsLoading(false);
      overpassController.current = null;
    }
  };

  return processArea;
};
