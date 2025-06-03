// src/Layout.tsx
import React, { useRef, useState } from "react";
import type { LatLngExpression, LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Suggestion } from "./components/SearchBar";
import Controls from "./components/Controls";
import ResultsPanel from "./components/ResultsPanel";
import MapView from "./components/MapView";
import { useAreaProcessing } from "./hooks/useAreaProcessing";
import { useSearchSuggestions } from "./hooks/useSearchSuggestions";

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

  const mapRef = useRef<any>(null);
  const overpassController = useRef<AbortController | null>(null);

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

  const {
    searchTerm,
    suggestions,
    handleInputChange,
    handleSelectSuggestion,
    suggestController,
  } = useSearchSuggestions(setPoints, setClosedArea, processPolygon, mapRef);

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
