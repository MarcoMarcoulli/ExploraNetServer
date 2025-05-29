// src/Layout.tsx
import React, { useRef, useState } from "react";
import type {
  LatLngExpression,
  LatLngTuple,
  LatLngBoundsExpression,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import axios, { AxiosError } from "axios";
import type { Polygon as GeoJSONPolygon, MultiPolygon } from "geojson";

import type { Suggestion } from "./components/SearchBar";
import Controls from "./components/Controls";
import ResultsPanel from "./components/ResultsPanel";
import MapView from "./components/MapView";

import { useAreaProcessing } from "./hooks/useAreaProcessing";

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

  const processPolygon = useAreaProcessing(
    setRoads,
    setTrails,
    setTotalLengthRoads,
    setTotalLengthTrails,
    setDensityRoads,
    setDensityTrails,
    setArea,
    setIsLoading,
    overpassController
  );

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
