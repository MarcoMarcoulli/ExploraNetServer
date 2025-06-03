import { useRef, useState } from "react";
import axios, { AxiosError } from "axios";
import type { LatLngTuple, LatLngBoundsExpression } from "leaflet";
import type { Suggestion } from "../components/SearchBar";
import type { Polygon as GeoJSONPolygon, MultiPolygon } from "geojson";

interface NominatimResult {
  geojson: GeoJSONPolygon | MultiPolygon;
}

export const useSearchSuggestions = (
  setPoints: React.Dispatch<React.SetStateAction<LatLngTuple[]>>,
  setClosedArea: React.Dispatch<React.SetStateAction<boolean>>,
  processPolygon: (points: LatLngTuple[]) => void,
  mapRef: React.RefObject<any>
) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const debounceRef = useRef<number | null>(null);
  const suggestController = useRef<AbortController | null>(null);

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
    setSearchTerm(s.label);
    setSuggestions([]);
    try {
      const res = await axios.get<NominatimResult[]>(
        "https://nominatim.openstreetmap.org/search",
        {
          params: {
            q: s.label,
            format: "json",
            polygon_geojson: 1,
            limit: 1,
          },
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
        mapRef.current.flyToBounds(bounds, { padding: [20, 20] });
        mapRef.current.once("moveend", () => processPolygon(polyPoints));
      } else {
        processPolygon(polyPoints);
      }
    } catch {
      alert("Errore recupero confini.");
    }
  };

  return {
    searchTerm,
    suggestions,
    handleInputChange,
    handleSelectSuggestion,
    suggestController,
  };
};
