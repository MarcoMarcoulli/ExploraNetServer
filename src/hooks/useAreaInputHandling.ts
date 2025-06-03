// src/hooks/useAreaInputHandling.ts
import { useState, useCallback } from "react";
import type { LatLngTuple } from "leaflet";

interface Params {
  processArea: (pts: LatLngTuple[]) => void;
  overpassCtrl: React.MutableRefObject<AbortController | null>;
}

export function useAreaInputHandling({ processArea, overpassCtrl }: Params) {
  const [points, setPoints] = useState<LatLngTuple[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  /** Inizia la modalità di disegno: reseta punti e flag */
  const start = useCallback(() => {
    overpassCtrl.current?.abort();
    setPoints([]);
    setIsClosed(false);
    setIsDrawing(true);
  }, [overpassCtrl]);

  const close = useCallback(
    (forcedPts?: LatLngTuple[]) => {
      const pts = forcedPts ?? points;
      if (!forcedPts && pts.length < 3) {
        alert("Inserisci almeno 3 punti.");
        return;
      }
      setIsDrawing(false);
      setIsClosed(true);
      setPoints(pts);
      processArea(pts);
    },
    [points, processArea]
  );

  const clear = useCallback(() => {
    overpassCtrl.current?.abort();
    setPoints([]);
    setIsDrawing(false);
    setIsClosed(false);
  }, [overpassCtrl]);

  /** Aggiunge un punto solo se siamo in disegno */
  const addPoint = useCallback(
    (pt: LatLngTuple) => {
      if (isDrawing) {
        setPoints((p) => [...p, pt]);
      }
    },
    [isDrawing]
  );

  return {
    points,
    isDrawing,
    isClosed,
    start,
    close,
    clear,
    addPoint,
  };
}
