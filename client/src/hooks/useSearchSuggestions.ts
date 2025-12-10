import { useRef, useState } from "react";
import axios, { AxiosError } from "axios";
import type { LatLngTuple, LatLngBoundsExpression } from "leaflet";
// Assicurati di importare o definire Suggestion/ExtendedSuggestion come preferisci
import type { Suggestion } from "../components/SearchBar"; 
import type { Polygon as GeoJSONPolygon, MultiPolygon } from "geojson";

// Estendiamo l'interfaccia base per includere i dati tecnici che servono a noi (ID)
// ma che non mostriamo nell'UI
export interface ExtendedSuggestion extends Suggestion {
  osm_id: number;
  osm_type: string;
}

interface NominatimResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  geojson: GeoJSONPolygon | MultiPolygon;
  addresstype?: string; // Nominatim jsonv2 restituisce questo campo utile
  type?: string;        // Alternativa a addresstype
  address: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
    // Campi da ignorare ma presenti nel tipo
    hamlet?: string;
    suburb?: string;
    neighbourhood?: string;
  };
  lat: string;
  lon: string;
  display_name: string;
}

export const useSearchSuggestions = (
  setPoints: React.Dispatch<React.SetStateAction<LatLngTuple[]>>,
  setClosedArea: React.Dispatch<React.SetStateAction<boolean>>,
  processPolygon: (points: LatLngTuple[]) => void,
  mapRef: React.RefObject<any>,
  showError: (message: string) => void
) => {
  const [searchTerm, setSearchTerm] = useState("");
  // Usiamo il tipo esteso internamente
  const [suggestions, setSuggestions] = useState<ExtendedSuggestion[]>([]);
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
      const res = await axios.get<NominatimResult[]>(
        "https://nominatim.openstreetmap.org/search",
        {
          signal: controller.signal,
          params: {
            q: value,
            format: "jsonv2",
            addressdetails: 1,
            limit: 30, // 30 sono più che sufficienti
            // polygon_geojson: 0 // Non ci serve la geometria ora, alleggeriamo la richiesta
          },
        }
      );

      // --- FILTRO PER TIPI AMMINISTRATIVI VALIDI ---
      // Escludiamo frazioni (hamlet), quartieri (suburb), strade, etc.
      // Vogliamo solo Comuni, Province, Regioni.
      const excludeTypes = new Set([
        "hamlet", "suburb", "neighbourhood", "quarter", "isolated_dwelling", 
        "locality", "road", "way", "park", "point_of_interest"
      ]);

      const mapped: (ExtendedSuggestion | null)[] = res.data.map((s) => {
        // 1. Controllo sul tipo di luogo restituito
        const type = s.addresstype || s.type || "";
        if (excludeTypes.has(type)) {
          return null;
        }

        const addr = s.address || {};

        // 2. Cerchiamo il nome principale SOLO tra i livelli amministrativi che hanno confini
        // In Italia: Village/Town/City = Comune. County = Provincia. State = Regione.
        const mainName = addr.city || addr.town || addr.village || addr.county || addr.state || addr.country;
        
        // Se non troviamo un nome in questi campi, è probabile che sia una frazione o altro
        if (!mainName) return null;

        // Costruiamo la label gerarchica
        const provincia = addr.county || "";
        const regione = addr.state || "";
        const stato = addr.country || "";

        // Esempio: "Monza, Monza e della Brianza, Lombardia, Italia"
        const parts = [mainName, provincia, regione, stato].filter(Boolean);
        
        // Rimuove duplicati (es. se cerchi "Milano", città e provincia hanno lo stesso nome)
        const label = [...new Set(parts)].join(", ");

        return {
          label,
          lat: s.lat,
          lon: s.lon,
          osm_id: s.osm_id,     // SALVIAMO L'ID!
          osm_type: s.osm_type, // SALVIAMO IL TIPO (Node, Way, Relation)
        };
      });

      const listUnfiltered = mapped.filter((x): x is ExtendedSuggestion => x !== null);

      // Deduplicazione
      const dedupMap = new Map<string, ExtendedSuggestion>();
      for (const item of listUnfiltered) {
        if (!dedupMap.has(item.label)) {
          dedupMap.set(item.label, item);
        }
      }
      
      // Prendiamo i primi 5 risultati unici. Non serve Fuse.js, Nominatim ordina già per rilevanza.
      const top5 = Array.from(dedupMap.values()).slice(0, 5);
      setSuggestions(top5);

    } catch (err) {
      if ((err as AxiosError).name !== "CanceledError") {
        setSuggestions([]);
      }
    }
  };

  const handleInputChange = (value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchSuggestions(value), 300);
  };

  const handleSelectSuggestion = async (s: ExtendedSuggestion) => {
    setSearchTerm(s.label);
    setSuggestions([]);

    try {
      // --- MODIFICA FONDAMENTALE ---
      // Invece di rifare la ricerca per nome (imprecisa), usiamo /lookup tramite ID.
      // Questo garantisce di prendere ESATTAMENTE l'elemento cliccato.
      
      // Nominatim vuole il tipo come prefisso: N (node), W (way), R (relation)
      const typePrefix = s.osm_type.charAt(0).toUpperCase(); 
      const lookupId = `${typePrefix}${s.osm_id}`;

      const res = await axios.get<NominatimResult[]>(
        "https://nominatim.openstreetmap.org/lookup",
        {
          params: {
            osm_ids: lookupId,
            format: "json",
            polygon_geojson: 1, // Qui chiediamo la geometria
          },
        }
      );

      if (!res.data.length || !res.data[0].geojson) {
        showError("Confini non disponibili per questa area.");
        return;
      }

      const geo = res.data[0].geojson;
      let coords: [number, number][] = [];

      // Gestione Geometry
      if (geo.type === "Polygon") {
        coords = (geo.coordinates as [number, number][][])[0];
      } else if (geo.type === "MultiPolygon") {
        coords = (geo.coordinates as [number, number][][][])[0][0];
      }

      if (!coords.length) {
        showError("Geometria non valida.");
        return;
      }

      // Leaflet vuole [lat, lon], GeoJSON è [lon, lat]
      const polyPoints = coords.map((c) => [c[1], c[0]] as LatLngTuple);
      
      setPoints(polyPoints);
      setClosedArea(true);

      const bounds: LatLngBoundsExpression = polyPoints;
      if (mapRef.current) {
        mapRef.current.flyToBounds(bounds, { padding: [50, 50] });
        // Lancia il calcolo appena finito lo zoom
        mapRef.current.once("moveend", () => processPolygon(polyPoints));
      } else {
        processPolygon(polyPoints);
      }
    } catch (err) {
      console.error(err);
      showError("Errore nel recupero dell'area.");
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