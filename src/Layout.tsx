// src/Layout.tsx
import React, { useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Polygon,
  CircleMarker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type {
  LatLngExpression,
  LatLngTuple,
  LatLngBoundsExpression,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import axios from "axios";
import * as turf from "@turf/turf";
import type { Polygon as GeoJSONPolygon, MultiPolygon } from "geojson";

interface OverpassElement {
  geometry: { lat: number; lon: number }[];
}
interface OverpassResponse {
  elements: OverpassElement[];
}
interface Suggestion {
  label: string;
  lat: string;
  lon: string;
}
interface NominatimResult {
  geojson: GeoJSONPolygon | MultiPolygon;
}

const Layout: React.FC = () => {
  const center: LatLngExpression = [45.71, 9.7];
  const [points, setPoints] = useState<LatLngTuple[]>([]);
  const [inserting, setInserting] = useState(false);
  const [polygonClosed, setPolygonClosed] = useState(false);
  const [roads, setRoads] = useState<LatLngTuple[][]>([]);
  const [totalLength, setTotalLength] = useState<number>(0);
  const [area, setArea] = useState<number>(0);
  const [density, setDensity] = useState<number>(0);

  // Autocomplete + debounce
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // timer di tipo number nel browser
  const debounceRef = useRef<number | null>(null);

  // Riferimento mappa per flyToBounds
  const mapRef = useRef<any>(null);
  const MapRefController = () => {
    const map = useMap();
    mapRef.current = map;
    return null;
  };

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        if (inserting) {
          setPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
        }
      },
    });
    return null;
  };

  const processPolygon = async (polygonPoints: LatLngTuple[]) => {
    const coords = polygonPoints.map((p) => [p[1], p[0]] as [number, number]);
    if (
      coords[0][0] !== coords[coords.length - 1][0] ||
      coords[0][1] !== coords[coords.length - 1][1]
    ) {
      coords.push(coords[0]);
    }
    const feature = turf.polygon([coords]);
    const areaKm2 = turf.area(feature) / 1_000_000;
    setArea(areaKm2);

    const polyString = polygonPoints.map((p) => `${p[0]} ${p[1]}`).join(" ");
    const query = `[out:json][timeout:25];way["highway"](poly:"${polyString}");out body geom;`;

    try {
      const resp = await axios.post<OverpassResponse>(
        "https://overpass-api.de/api/interpreter",
        query,
        { headers: { "Content-Type": "text/plain" } }
      );
      const clipped: LatLngTuple[][] = [];
      resp.data.elements.forEach((el) => {
        const line = el.geometry.map((g) => [g.lat, g.lon] as LatLngTuple);
        for (let i = 0; i < line.length - 1; i++) {
          const seg = [line[i], line[i + 1]];
          const mid = [
            (seg[0][1] + seg[1][1]) / 2,
            (seg[0][0] + seg[1][0]) / 2,
          ];
          if (turf.booleanPointInPolygon(turf.point(mid), feature))
            clipped.push(seg);
        }
      });
      setRoads(clipped);
      const sumKm = clipped.reduce((acc, seg) => {
        const length = turf.length(
          turf.lineString(seg.map((c) => [c[1], c[0]])),
          { units: "kilometers" }
        );
        return acc + length;
      }, 0);
      setTotalLength(sumKm);
      setDensity(sumKm / areaKm2);
    } catch {
      alert("Errore recupero vie da Overpass API.");
    }
  };

  const handleStart = () => {
    setPoints([]);
    setRoads([]);
    setTotalLength(0);
    setArea(0);
    setDensity(0);
    setPolygonClosed(false);
    setInserting(true);
  };

  const handleClose = () => {
    if (points.length < 3) {
      alert("Inserisci almeno 3 punti.");
      return;
    }
    setInserting(false);
    setPolygonClosed(true);
    processPolygon(points);
  };

  const fetchSuggestions = async (value: string) => {
    if (value.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await axios.get<any[]>(
        "https://nominatim.openstreetmap.org/search",
        {
          params: {
            q: value,
            format: "jsonv2",
            addressdetails: 1,
            polygon_geojson: 1,
            limit: 50,
          },
        }
      );

      // Filtra solo gli elementi con confine valido
      const withGeojson = res.data.filter((s) => {
        return (
          s.geojson &&
          Array.isArray(s.geojson.coordinates) &&
          // nel caso di MultiPolygon guardo almeno un poligono non vuoto
          ((s.geojson.type === "Polygon" &&
            (s.geojson.coordinates as any[][][])[0]?.length > 0) ||
            (s.geojson.type === "MultiPolygon" &&
              (s.geojson.coordinates as any[][][][])[0]?.[0]?.length > 0))
        );
      });

      // Mappo in Suggestion solo i campi che mi servono
      const list: Suggestion[] = withGeojson.map((s) => {
        const addr = s.address || {};
        const comune = addr.city ?? addr.town ?? addr.village ?? "";
        const provincia = addr.county ?? "";
        const regione = addr.state ?? "";
        const stato = addr.country ?? "";

        return {
          label: [comune, provincia, regione, stato].filter(Boolean).join(", "),
          lat: s.lat,
          lon: s.lon,
        };
      });

      const filtered = list
        .filter((item) =>
          item.label.toLowerCase().startsWith(value.toLowerCase())
        )
        .slice(0, 5);

      setSuggestions(filtered);
    } catch {
      setSuggestions([]);
    }
  };

  // Debounce
  const handleInputChange = (value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      fetchSuggestions(value);
    }, 200);
  };

  // Seleziona suggerimento
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
      setPolygonClosed(true);
      processPolygon(polyPoints);

      const bounds: LatLngBoundsExpression = polyPoints;
      if (mapRef.current) {
        mapRef.current.flyToBounds(bounds, { padding: [20, 20] });
      }
    } catch {
      alert("Errore recupero confini.");
    }
  };

  const handleClear = () => {
    setPoints([]);
    setRoads([]);
    setTotalLength(0);
    setArea(0);
    setDensity(0);
    setPolygonClosed(false);
    setInserting(false);
    setSearchTerm("");
    setSuggestions([]);
  };

  return (
    <div className="relative w-screen h-screen z-0">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
        {/* Barra di ricerca: visibile solo se NON sto disegnando */}
        {!inserting && !polygonClosed && (
          <div className="relative w-80">
            <input
              type="text"
              placeholder="Comune, Provincia, Regione..."
              value={searchTerm}
              onChange={(e) => handleInputChange(e.target.value)}
              className="w-full px-2 py-1 rounded border shadow-sm"
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-auto">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    onClick={() => handleSelectSuggestion(s)}
                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                  >
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Bottoni */}
        {!inserting && !polygonClosed && (
          <button
            onClick={handleStart}
            className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
          >
            Disegna confini
          </button>
        )}
        {inserting && (
          <>
            <button
              onClick={handleClose}
              className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700"
            >
              Chiudi confini
            </button>
            <button
              onClick={handleClear}
              className="bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700"
            >
              Cancella confini
            </button>
          </>
        )}
        {polygonClosed && !inserting && (
          <button
            onClick={handleClear}
            className="bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700"
          >
            Cancella confini
          </button>
        )}
      </div>

      <MapContainer center={center} zoom={12} className="w-full h-full z-0">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <MapRefController />
        {inserting && <MapClickHandler />}

        {inserting &&
          points.map((pos, i) => (
            <CircleMarker
              key={i}
              center={pos}
              radius={6}
              pathOptions={{
                color: "red",
                fillColor: "red",
                fillOpacity: 1,
                stroke: false,
              }}
            />
          ))}

        {!polygonClosed &&
          points
            .slice(0, -1)
            .map((_, i) => (
              <Polyline
                key={i}
                positions={[points[i], points[i + 1]]}
                color="blue"
              />
            ))}

        {!polygonClosed && points.length > 2 && (
          <Polygon
            positions={points}
            pathOptions={{
              stroke: false,
              fillColor: "blue",
              fillOpacity: 0.15,
            }}
          />
        )}

        {polygonClosed && points.length > 2 && (
          <Polygon
            positions={points}
            pathOptions={{ color: "blue", fillColor: "blue", fillOpacity: 0.3 }}
          />
        )}

        {polygonClosed &&
          roads.map((seg, i) => (
            <Polyline key={i} positions={seg} color="green" weight={3} />
          ))}
      </MapContainer>

      {polygonClosed && (
        <div className="absolute bottom-0 right-0 z-50 bg-white/90 border border-gray-300 shadow-xl rounded-lg p-4 text-sm text-gray-800 w-72 backdrop-blur">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Risultati
          </h3>
          <div className="space-y-1">
            <p>
              <span className="font-medium">Lunghezza totale:</span>{" "}
              {totalLength.toFixed(2)} km
            </p>
            <p>
              <span className="font-medium">Superficie:</span> {area.toFixed(2)}{" "}
              km²
            </p>
            <p>
              <span className="font-medium">Densità:</span> {density.toFixed(2)}{" "}
              km/km²
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
