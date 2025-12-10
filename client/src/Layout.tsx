import React, { useRef, useState } from "react";
import type { LatLngExpression, LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";

// Components
import Controls from "./components/Controls";
import ResultsPanel from "./components/ResultsPanel";
import MapView from "./components/MapView";
import ErrorMessage from "./components/ErroreMessage";

// Hooks
import { useAreaProcessing } from "./hooks/useAreaProcessing";
import { useSearchSuggestions } from "./hooks/useSearchSuggestions";
import { useAreaInputHandling } from "./hooks/useAreaInputHandling";

const Layout: React.FC = () => {
  const center: LatLngExpression = [45.71, 9.7]; 
  const [points, setPoints] = useState<LatLngTuple[]>([]);
  const [insertingPoints, setInsertingPoints] = useState(false);
  const [closedArea, setClosedArea] = useState(false);
  const mapRef = useRef<any>(null);

  const [roads, setRoads] = useState<LatLngTuple[][]>([]);
  const [trails, setTrails] = useState<LatLngTuple[][]>([]);
  const [totalLengthRoads, setTotalLengthRoads] = useState(0);
  const [totalLengthTrails, setTotalLengthTrails] = useState(0);
  const [area, setArea] = useState(0);
  const [densityRoads, setDensityRoads] = useState(0);
  const [densityTrails, setDensityTrails] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [resultsReady, setResultsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // DESTRUTTURAZIONE CORRETTA: Prendi sia processArea che stopProcessing
  const { processArea: processPolygon, stopProcessing } = useAreaProcessing(
    setRoads, setTrails, setTotalLengthRoads, setTotalLengthTrails,
    setDensityRoads, setDensityTrails, setArea, setIsLoading,
    (msg) => setErrorMessage(msg),
    () => setResultsReady(true)
  );

  const { searchTerm, suggestions, handleInputChange, handleSelectSuggestion, suggestController, clearSearch } = useSearchSuggestions(
    setPoints, setClosedArea,
    (pts) => { setResultsReady(false); processPolygon(pts); },
    mapRef,
    (msg) => setErrorMessage(msg)
  );

  const { handleStart, handleClear, handleClose } = useAreaInputHandling(
    setPoints, setRoads, setTrails, setTotalLengthRoads, setTotalLengthTrails,
    setArea, setDensityRoads, setDensityTrails, setClosedArea, setInsertingPoints,
    stopProcessing, suggestController, processPolygon, clearSearch,
    (msg) => setErrorMessage(msg)
  );

  const onClearAll = () => {
    stopProcessing(); 
    handleClear();    
    setResultsReady(false);
    setErrorMessage("");
    setIsLoading(false);
  };

  return (
    <div className="relative w-screen h-screen">
      <Controls
        insertingPoints={insertingPoints} ClosedArea={closedArea} isLoadingTrails={isLoading}
        searchTerm={searchTerm} suggestions={suggestions}
        handleInputChange={handleInputChange}
        handleSelectSuggestion={handleSelectSuggestion}
        handleStart={handleStart} 
        handleClose={() => { setResultsReady(false); handleClose(points); }}
        handleClear={onClearAll}
      />
      <MapView
        ref={mapRef} center={center} polygonPoints={points} isDrawing={insertingPoints}
        roads={roads} trails={trails} isLoading={isLoading} closedArea={closedArea}
        onMapClick={(ll) => { if (insertingPoints) setPoints((p) => [...p, ll]); }}
      />
      {closedArea && (
        isLoading ? (
          <div className="absolute top-20 right-4 z-[1000] bg-white p-3 rounded shadow border flex gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span>Analisi in corso...</span>
          </div>
        ) : (
          resultsReady && (
            <ResultsPanel area={area} totalLengthTrails={totalLengthTrails} totalLengthRoads={totalLengthRoads} densityRoads={densityRoads} densityTrails={densityTrails} />
          )
        )
      )}
      <ErrorMessage message={errorMessage} onClose={() => setErrorMessage("")} />
    </div>
  );
};

export default Layout;