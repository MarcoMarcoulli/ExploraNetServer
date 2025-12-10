import type { MutableRefObject } from "react";
import type { LatLngTuple } from "leaflet";

export const useAreaInputHandling = (
  setPoints: React.Dispatch<React.SetStateAction<LatLngTuple[]>>,
  setRoads: React.Dispatch<React.SetStateAction<LatLngTuple[][]>>,
  setTrails: React.Dispatch<React.SetStateAction<LatLngTuple[][]>>,
  setTotalLengthRoads: React.Dispatch<React.SetStateAction<number>>,
  setTotalLengthTrails: React.Dispatch<React.SetStateAction<number>>,
  setArea: React.Dispatch<React.SetStateAction<number>>,
  setDensityRoads: React.Dispatch<React.SetStateAction<number>>,
  setDensityTrails: React.Dispatch<React.SetStateAction<number>>,
  setClosedArea: React.Dispatch<React.SetStateAction<boolean>>,
  setInsertingPoints: React.Dispatch<React.SetStateAction<boolean>>,
  
  // MODIFICA QUI: Rimuovi overpassController e aggiungi stopProcessing
  stopProcessing: () => void,
  
  suggestController: MutableRefObject<AbortController | null>,
  processPolygon: (points: LatLngTuple[]) => void,
  clearSearch: () => void,
  showError: (message: string) => void
) => {
  
  const handleStart = () => {
    stopProcessing(); // Ferma il server correttamente
    suggestController.current?.abort(); // Ferma i suggerimenti
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

  const handleClear = () => {
    stopProcessing(); // Ferma il server correttamente
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
    clearSearch();
  };

  const handleClose = (points: LatLngTuple[]) => {
    if (points.length < 3) {
      showError("Inserisci almeno 3 punti.");
      return;
    }
    setInsertingPoints(false);
    setClosedArea(true);
    processPolygon(points);
  };

  return {
    handleStart,
    handleClear,
    handleClose,
  };
};