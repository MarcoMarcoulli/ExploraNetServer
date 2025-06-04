import { useRef, useState } from "react";
import axios, { AxiosError } from "axios";
import Fuse from "fuse.js";
import type { LatLngTuple, LatLngBoundsExpression } from "leaflet";
import type { Suggestion } from "../components/SearchBar";
import type { Polygon as GeoJSONPolygon, MultiPolygon } from "geojson";

interface NominatimResult {
  geojson: GeoJSONPolygon | MultiPolygon;
  address: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
  lat: string;
  lon: string;
}

export const useSearchSuggestions = (
  setPoints: React.Dispatch<React.SetStateAction<LatLngTuple[]>>,
  setClosedArea: React.Dispatch<React.SetStateAction<boolean>>,
  processPolygon: (points: LatLngTuple[]) => void,
  mapRef: React.RefObject<any>,
  showError: (message: string) => void
) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const debounceRef = useRef<number | null>(null);
  const suggestController = useRef<AbortController | null>(null);

  const fetchSuggestions = async (value: string) => {
    // Annulla eventuale richiesta precedente
    suggestController.current?.abort();

    if (value.length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    suggestController.current = controller;

    try {
      // Richiesta a Nominatim senza polygon_geojson
      const res = await axios.get<NominatimResult[]>(
        "https://nominatim.openstreetmap.org/search",
        {
          signal: controller.signal,
          params: {
            q: value,
            format: "jsonv2",
            addressdetails: 1,
            limit: 50,
          },
        }
      );

      // Mappiamo ogni risultato in Suggestion { label, lat, lon }
      const mapped: (Suggestion | null)[] = res.data.map((s) => {
        const addr = s.address || {};
        const comune = addr.city || addr.town || addr.village || "";
        const provincia = addr.county || "";
        const regione = addr.state || "";
        const stato = addr.country || "";

        // Se non c’è almeno un pezzo di indirizzo, skip
        const label = [comune, provincia, regione, stato]
          .filter(Boolean)
          .join(", ");
        if (!label) return null;

        return {
          label,
          lat: s.lat,
          lon: s.lon,
        };
      });

      // Filtriamo i null e otteniamo un array di Suggestion
      const listUnfiltered: Suggestion[] = mapped.filter(
        (x): x is Suggestion => x !== null
      );

      // ---------------------------
      // Deduplicazione per label
      // ---------------------------
      const dedupMap = new Map<string, Suggestion>();
      for (const item of listUnfiltered) {
        if (!dedupMap.has(item.label)) {
          dedupMap.set(item.label, item);
        }
      }
      const list: Suggestion[] = Array.from(dedupMap.values());
      // ---------------------------

      // Configuriamo Fuse.js per fare la ricerca fuzzy su "label"
      const fuse = new Fuse(list, {
        keys: ["label"],
        threshold: 0.3, // 0.0 = match esatto; 1.0 = match molto permissivo
        distance: 100,
      });

      // Otteniamo i primi 5 risultati ordinati per rilevanza
      const fuseResult = fuse.search(value).slice(0, 5);
      const top5: Suggestion[] = fuseResult.map((r) => r.item);

      setSuggestions(top5);
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
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    // Debounce di ~300ms prima di chiamare fetchSuggestions
    debounceRef.current = window.setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
  };

  const handleSelectSuggestion = async (s: Suggestion) => {
    setSearchTerm(s.label);
    setSuggestions([]);

    try {
      // Qui serve polygon_geojson per disegnare l'area selezionata
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
        showError("Nessuna area trovata.");
        return;
      }
      const geo = res.data[0].geojson;
      // Estraiamo le coordinate del poligono (prima anello, in caso di MultiPolygon prendiamo il primo sottopoligono)
      const coords: [number, number][] =
        geo.type === "Polygon"
          ? (geo.coordinates as [number, number][][])[0]
          : (geo.coordinates as [number, number][][][])[0][0];

      // In Leaflet lat/lon è invertito, quindi [lat, lon]
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
      showError("Errore recupero confini.");
    }
  };

  const clearSearch = () => {
    setSearchTerm("");
    setSuggestions([]);
  };

  return {
    searchTerm,
    suggestions,
    handleInputChange,
    handleSelectSuggestion,
    suggestController,
    clearSearch,
  };
};
