// src/Layout.tsx
import React, { useRef, useState } from "react";
import type {
  LatLngExpression,
  LatLngTuple,
  LatLngBoundsExpression,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import axios, { AxiosError } from "axios";
import * as turf from "@turf/turf";
import type { Polygon as GeoJSONPolygon, MultiPolygon } from "geojson";

import type { Suggestion } from "./components/SearchBar";
import Controls from "./components/Controls";
import ResultsPanel from "./components/ResultsPanel";
import MapView from "./components/MapView";

interface OverpassElement {
  geometry: { lat: number; lon: number }[];
}
interface OverpassResponse {
  elements: OverpassElement[];
}

interface NominatimResult {
  geojson: GeoJSONPolygon | MultiPolygon;
}

const Layout: React.FC = () => {
  const center: LatLngExpression = [45.71, 9.7];
  const [points, setPoints] = useState<LatLngTuple[]>([]);
  const [insertingPoints, setInsertingPoints] = useState(false);
  const [closedArea, setClosedArea] = useState(false);
  const [roads, setRoads] = useState<LatLngTuple[][]>([]);
  const [trails, setTrails] = useState<LatLngTuple[][]>([]);
  const [totalLengthRoads, setTotalLengthRoads] = useState(0);
  const [totalLengthTrails, setTotalLengthTrails] = useState(0);
  const [area, setArea] = useState(0);
  const [densityRoads, setDensityRoads] = useState(0);
  const [densityTrails, setDensityTrails] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const debounceRef = useRef<number | null>(null);

  const mapRef = useRef<any>(null);
  const overpassController = useRef<AbortController | null>(null);
  const suggestController = useRef<AbortController | null>(null);

  const processPolygon = async (polygonPoints: LatLngTuple[]) => {
    // abort any previous
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
    const queryRoads = `[out:json][timeout:25];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"](poly:"${polyString}");out body geom;`;
    const queryTrails = `[out:json][timeout:25];way["highway"~"^(pedestrian|track|path|footway|bridleway|steps|via_ferrata)$"](poly:"${polyString}");out body geom;`;

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

      respRoads.data.elements.forEach((el) => {
        const line = el.geometry.map((g) => [g.lat, g.lon] as LatLngTuple);
        for (let i = 0; i < line.length - 1; i++) {
          const seg: LatLngTuple[] = [line[i], line[i + 1]];
          const mid: [number, number] = [
            (seg[0][1] + seg[1][1]) / 2,
            (seg[0][0] + seg[1][0]) / 2,
          ];
          if (turf.booleanPointInPolygon(turf.point(mid), feature)) {
            clippedRoads.push(seg);
          }
        }
      });

      respTrails.data.elements.forEach((el) => {
        const line = el.geometry.map((g) => [g.lat, g.lon] as LatLngTuple);
        for (let i = 0; i < line.length - 1; i++) {
          const seg: LatLngTuple[] = [line[i], line[i + 1]];
          const mid: [number, number] = [
            (seg[0][1] + seg[1][1]) / 2,
            (seg[0][0] + seg[1][0]) / 2,
          ];
          if (turf.booleanPointInPolygon(turf.point(mid), feature)) {
            clippedTrails.push(seg);
          }
        }
      });

      setRoads(clippedRoads);
      const sumKmRoads = clippedRoads.reduce(
        (acc, seg) =>
          acc +
          turf.length(turf.lineString(seg.map((c) => [c[1], c[0]])), {
            units: "kilometers",
          }),
        0
      );

      setTrails(clippedTrails);
      const sumKmTrails = clippedTrails.reduce(
        (acc, seg) =>
          acc +
          turf.length(turf.lineString(seg.map((c) => [c[1], c[0]])), {
            units: "kilometers",
          }),
        0
      );

      setTotalLengthRoads(sumKmRoads);
      setDensityRoads(sumKmRoads / areaKm2);
      setTotalLengthTrails(sumKmTrails);
      setDensityTrails(sumKmTrails / areaKm2);
    } catch (err) {
      if ((err as AxiosError).name !== "CanceledError") {
        alert("Errore recupero vie da Overpass API.");
      }
    } finally {
      setIsLoading(false);
      overpassController.current = null;
    }
  };

  const handleStart = () => {
    overpassController.current?.abort();
    suggestController.current?.abort();
    setPoints([]);
    setRoads([]);
    setTrails([]);
    setTotalLengthRoads(0);
    setTotalLengthTrails(0);
    setArea(0);
    setDensityRoads(0);
    setDensityTrails(0);
    setClosedArea(false);
    setInsertingPoints(true);
  };

  const handleClose = () => {
    if (points.length < 3) {
      alert("Inserisci almeno 3 punti.");
      return;
    }
    setInsertingPoints(false);
    setClosedArea(true);
    processPolygon(points);
  };

  const fetchSuggestions = async (value: string) => {
    suggestController.current?.abort();
    if (value.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    suggestController.current = controller;
    try {
      const res = await axios.get<any[]>(
        "https://nominatim.openstreetmap.org/search",
        {
          signal: controller.signal,
          params: {
            q: value,
            format: "jsonv2",
            addressdetails: 1,
            polygon_geojson: 1,
            limit: 50,
          },
        }
      );
      const withGeojson = res.data.filter(
        (s) => s.geojson && Array.isArray(s.geojson.coordinates)
      );
      const list: Suggestion[] = withGeojson.map((s) => {
        const addr = s.address || {};
        const comune = addr.city || addr.town || addr.village || "";
        const provincia = addr.county || "";
        const regione = addr.state || "";
        const stato = addr.country || "";
        return {
          label: [comune, provincia, regione, stato].filter(Boolean).join(", "),
          lat: s.lat,
          lon: s.lon,
        };
      });
      setSuggestions(
        list
          .filter((item) =>
            item.label.toLowerCase().startsWith(value.toLowerCase())
          )
          .slice(0, 5)
      );
    } catch (err) {
      if ((err as AxiosError).name !== "CanceledError") {
        setSuggestions([]);
      }
    } finally {
      suggestController.current = null;
    }
  };

  const handleInputChange = (value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      fetchSuggestions(value);
    }, 200);
  };

  const handleSelectSuggestion = async (s: Suggestion) => {
    overpassController.current?.abort();
    setSearchTerm(s.label);
    setSuggestions([]);
    try {
      const res = await axios.get<NominatimResult[]>(
        "https://nominatim.openstreetmap.org/search",
        {
          params: { q: s.label, format: "json", polygon_geojson: 1, limit: 1 },
        }
      );
      if (!res.data.length) {
        alert("Nessun poligono trovato.");
        return;
      }
      const geo = res.data[0].geojson;
      const coords: [number, number][] =
        geo.type === "Polygon"
          ? (geo.coordinates as [number, number][][])[0]
          : (geo.coordinates as [number, number][][][])[0][0];
      const polyPoints = coords.map((c) => [c[1], c[0]] as LatLngTuple);
      setPoints(polyPoints);
      setClosedArea(true);
      const bounds: LatLngBoundsExpression = polyPoints;
      if (mapRef.current) {
        mapRef.current.once("moveend", () => processPolygon(polyPoints));
        mapRef.current.flyToBounds(bounds, { padding: [20, 20] });
      } else {
        processPolygon(polyPoints);
      }
    } catch {
      alert("Errore recupero confini.");
    }
  };

  const handleClear = () => {
    overpassController.current?.abort();
    suggestController.current?.abort();
    setPoints([]);
    setRoads([]);
    setTrails([]);
    setTotalLengthRoads(0);
    setTotalLengthTrails(0);
    setArea(0);
    setDensityRoads(0);
    setDensityTrails(0);
    setClosedArea(false);
    setInsertingPoints(false);
    setSearchTerm("");
    setSuggestions([]);
  };

  return (
    <div className="relative w-screen h-screen">
      <Controls
        insertingPoints={insertingPoints}
        ClosedArea={closedArea}
        isLoadingTrails={isLoading}
        searchTerm={searchTerm}
        suggestions={suggestions}
        handleInputChange={handleInputChange}
        handleSelectSuggestion={handleSelectSuggestion}
        handleStart={handleStart}
        handleClose={handleClose}
        handleClear={handleClear}
      />

      <MapView
        center={center}
        polygonPoints={points}
        isDrawing={insertingPoints}
        roads={roads}
        trails={trails}
        isLoading={isLoading}
        closedArea={closedArea}
        onMapClick={(ll) => setPoints((p) => [...p, ll])}
      />

      {closedArea && (
        <ResultsPanel
          area={area}
          totalLengthTrails={totalLengthTrails}
          totalLengthRoads={totalLengthRoads}
          densityRoads={densityRoads}
          densityTrails={densityTrails}
        />
      )}
    </div>
  );
};

export default Layout;
