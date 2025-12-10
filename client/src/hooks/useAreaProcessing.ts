import { useRef } from "react";
import axios, { AxiosError } from "axios";
import type { LatLngTuple } from "leaflet";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const useAreaProcessing = (
  setRoads: React.Dispatch<React.SetStateAction<LatLngTuple[][]>>,
  setTrails: React.Dispatch<React.SetStateAction<LatLngTuple[][]>>,
  setTotalLengthRoads: React.Dispatch<React.SetStateAction<number>>,
  setTotalLengthTrails: React.Dispatch<React.SetStateAction<number>>,
  setDensityRoads: React.Dispatch<React.SetStateAction<number>>,
  setDensityTrails: React.Dispatch<React.SetStateAction<number>>,
  setArea: React.Dispatch<React.SetStateAction<number>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  showError: (message: string) => void,
  onReady: () => void
) => {
  // Ref per gestire l'annullamento della richiesta
  const abortControllerRef = useRef<AbortController | null>(null);

  // 1. Funzione per fermare tutto (usata SOLO dal tasto Cancella)
  const stopProcessing = () => {
    if (abortControllerRef.current) {
      console.log(" Stop manuale richiesto dall'utente.");
      abortControllerRef.current.abort(); // Interrompe la rete
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  // 2. Funzione principale di calcolo
  const processArea = async (polygonPoints: LatLngTuple[]) => {
    
    setIsLoading(true);
    
    const controller = new AbortController();
    // Aggiorniamo il ref, ma non abortiamo quello vecchio se esisteva
    abortControllerRef.current = controller;

    // Conversione coordinate per il backend
    const coords = polygonPoints.map((p) => [p[1], p[0]] as [number, number]);
    
    // Chiudi il poligono se aperto
    if (
      coords.length > 0 &&
      (coords[0][0] !== coords[coords.length - 1][0] ||
       coords[0][1] !== coords[coords.length - 1][1])
    ) {
      coords.push(coords[0]);
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/process-area`, {
        polygon: coords.map((c) => [c[1], c[0]]),
      }, {
        signal: controller.signal // <--- Fondamentale per l'abort manuale
      });

      const {
        area,
        roads = [],
        trails = [],
        totalKmRoads,
        totalKmTrails,
        densityRoads,
        densityTrails,
      } = response.data;

      setArea(area);
      setTotalLengthRoads(totalKmRoads);
      setTotalLengthTrails(totalKmTrails);
      setDensityRoads(densityRoads);
      setDensityTrails(densityTrails);
      
      onReady();

      requestAnimationFrame(() => {
        setRoads(roads);
        setTrails(trails);
        setIsLoading(false);
      });

    } catch (err) {
      // Gestione errori
      if (axios.isCancel(err)) {
        console.log("Richiesta annullata manualmente.");
        // Non mostriamo errore visivo, è voluto dall'utente
      } else {
        if ((err as AxiosError).name !== "CanceledError") {
          console.error(err);
          showError("Errore durante l'analisi dell'area.");
        }
        setIsLoading(false);
      }
    }
  };

  // 3. Restituiamo un oggetto con entrambe le funzioni
  return { processArea, stopProcessing };
};