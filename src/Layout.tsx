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
  const [totalLength, setTotalLength] = useState(0);
  const [area, setArea] = useState(0);
  const [density, setDensity] = useState(0);
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
    const query = `[out:json][timeout:25];way["highway"](poly:"${polyString}");out body geom;`;

    try {
      const resp = await axios.post<OverpassResponse>(
        "https://overpass-api.de/api/interpreter",
        query,
        { signal: controller.signal, headers: { "Content-Type": "text/plain" } }
      );
      const clipped: LatLngTuple[][] = [];
      resp.data.elements.forEach((el) => {
        const line = el.geometry.map((g) => [g.lat, g.lon] as LatLngTuple);
        for (let i = 0; i < line.length - 1; i++) {
          const seg: LatLngTuple[] = [line[i], line[i + 1]];
          const mid: [number, number] = [
            (seg[0][1] + seg[1][1]) / 2,
            (seg[0][0] + seg[1][0]) / 2,
          ];
          if (turf.booleanPointInPolygon(turf.point(mid), feature)) {
            clipped.push(seg);
          }
        }
      });
      setRoads(clipped);
      const sumKm = clipped.reduce(
        (acc, seg) =>
          acc +
          turf.length(turf.lineString(seg.map((c) => [c[1], c[0]])), {
            units: "kilometers",
          }),
        0
      );
      setTotalLength(sumKm);
      setDensity(sumKm / areaKm2);
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
    setTotalLength(0);
    setArea(0);
    setDensity(0);
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
    setTotalLength(0);
    setArea(0);
    setDensity(0);
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
        trails={roads}
        isLoading={isLoading}
        closedArea={closedArea}
        onMapClick={(ll) => setPoints((p) => [...p, ll])}
      />

      {closedArea && (
        <ResultsPanel totalLength={totalLength} area={area} density={density} />
      )}
    </div>
  );
};

export default Layout;
