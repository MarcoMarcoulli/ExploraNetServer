// === useAreaProcessing.ts (Frontend) ===
import axios, { AxiosError } from "axios";
import type { LatLngTuple } from "leaflet";

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
  const processArea = async (polygonPoints: LatLngTuple[]) => {
    setIsLoading(true);

    const coords = polygonPoints.map((p) => [p[1], p[0]] as [number, number]);
    if (
      coords[0][0] !== coords[coords.length - 1][0] ||
      coords[0][1] !== coords[coords.length - 1][1]
    ) {
      coords.push(coords[0]);
    }

    try {
      const response = await axios.post("http://localhost:3001/process-area", {
        polygon: coords.map((c) => [c[1], c[0]]),
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
      if ((err as AxiosError).name !== "CanceledError") {
        showError("Errore recupero dati dal server.");
      }
    }
    setIsLoading(false);
  };

  return processArea;
};
