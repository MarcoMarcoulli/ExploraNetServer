// src/Layout.tsx
import React, { useRef, useState } from "react";
import type { LatLngExpression, LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import Controls from "./components/Controls";
import ResultsPanel from "./components/ResultsPanel";
import MapView from "./components/MapView";
import ErrorMessage from "./components/ErroreMessage";
import { useAreaProcessing } from "./hooks/useAreaProcessing";
import { useSearchSuggestions } from "./hooks/useSearchSuggestions";
import { useAreaInputHandling } from "./hooks/useAreaInputHandling";

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
  const [errorMessage, setErrorMessage] = useState("");

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
    (msg) => setErrorMessage(msg)
  );

  const {
    searchTerm,
    suggestions,
    handleInputChange,
    handleSelectSuggestion,
    suggestController,
    clearSearch,
  } = useSearchSuggestions(
    setPoints,
    setClosedArea,
    processPolygon,
    mapRef,
    (msg) => setErrorMessage(msg)
  );

  const { handleStart, handleClear, handleClose } = useAreaInputHandling(
    setPoints,
    setRoads,
    setTrails,
    setTotalLengthRoads,
    setTotalLengthTrails,
    setArea,
    setDensityRoads,
    setDensityTrails,
    setClosedArea,
    setInsertingPoints,
    overpassController,
    suggestController,
    processPolygon,
    clearSearch,
    (msg) => setErrorMessage(msg)
  );

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
        handleClose={() => handleClose(points)}
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

      <ErrorMessage
        message={errorMessage}
        onClose={() => setErrorMessage("")}
      />
    </div>
  );
};

export default Layout;
