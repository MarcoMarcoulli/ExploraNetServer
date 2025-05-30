// useAreaInputHandling.ts
import { useState, useCallback } from "react";
import type { LatLngTuple } from "leaflet";

export function useAreaInputHandling(
  processArea: (pts: LatLngTuple[]) => void,
  overpassCtrl: React.MutableRefObject<AbortController | null>
) {
  const [points, setPoints] = useState<LatLngTuple[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  const start = useCallback(() => {
    overpassCtrl.current?.abort();
    setPoints([]);
    setIsClosed(false);
    setIsDrawing(true);
  }, [overpassCtrl]);

  const addPoint = useCallback(
    (pt: LatLngTuple) => {
      if (isDrawing) setPoints((p) => [...p, pt]);
    },
    [isDrawing]
  );

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

  return { points, isDrawing, isClosed, start, addPoint, close, clear };
}
