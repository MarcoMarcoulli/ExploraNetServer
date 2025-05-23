// src/Layout.tsx
import React, { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Polygon,
  CircleMarker,
  useMapEvents,
} from "react-leaflet";
import type { LatLngExpression, LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import axios from "axios";
import * as turf from "@turf/turf";

// Tipizzazione risposta Overpass e Nominatim API
import type { Polygon as GeoJSONPolygon, MultiPolygon } from "geojson";
interface OverpassElement {
  geometry: { lat: number; lon: number }[];
}
interface OverpassResponse {
  elements: OverpassElement[];
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
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Gestisce click manuale
  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        if (inserting) {
          const newPoint: LatLngTuple = [e.latlng.lat, e.latlng.lng];
          setPoints((prev) => [...prev, newPoint]);
        }
      },
    });
    return null;
  };

  // Common: data processing per poligono
  const processPolygon = async (polygonPoints: LatLngTuple[]) => {
    // chiudi i vertici
    const coords = polygonPoints.map((p) => [p[1], p[0]] as [number, number]);
    if (
      coords[0][0] !== coords[coords.length - 1][0] ||
      coords[0][1] !== coords[coords.length - 1][1]
    )
      coords.push(coords[0]);
    const polygonFeature = turf.polygon([coords]);

    // calcola area (km2)
    const areaKm2 = turf.area(polygonFeature) / 1_000_000;
    setArea(areaKm2);

    // Overpass query
    const polyString = points.map((p) => `${p[0]} ${p[1]}`).join(" ");
    const query = `[out:json][timeout:25];(way["highway"](poly:"${polyString}"););out body geom;`;

    try {
      const resp = await axios.post<OverpassResponse>(
        "https://overpass-api.de/api/interpreter",
        query,
        { headers: { "Content-Type": "text/plain" } }
      );
      const elems = resp.data.elements;
      // clipping delle vie
      const clipped: LatLngTuple[][] = [];
      elems.forEach((el) => {
        const lineCoords = el.geometry.map(
          (g) => [g.lat, g.lon] as LatLngTuple
        );
        for (let i = 0; i < lineCoords.length - 1; i++) {
          const seg = [lineCoords[i], lineCoords[i + 1]];
          const mid: [number, number] = [
            (seg[0][1] + seg[1][1]) / 2,
            (seg[0][0] + seg[1][0]) / 2,
          ];
          if (turf.booleanPointInPolygon(turf.point(mid), polygonFeature))
            clipped.push(seg);
        }
      });
      setRoads(clipped);
      // lunghezza totale (km)
      const sumKm = clipped.reduce((acc, seg) => {
        const line = turf.lineString(seg.map((c) => [c[1], c[0]]));
        return acc + turf.length(line, { units: "kilometers" });
      }, 0);
      setTotalLength(sumKm);
      setDensity(sumKm / areaKm2);
    } catch {
      alert("Errore recupero vie da Overpass API.");
    }
  };

  // Inizio inserimento manuale
  const handleStart = () => {
    setPoints([]);
    setRoads([]);
    setTotalLength(0);
    setArea(0);
    setDensity(0);
    setPolygonClosed(false);
    setInserting(true);
  };

  // Fine inserimento manuale
  const handleClose = () => {
    if (points.length < 3) return alert("Inserisci almeno 3 punti.");
    setInserting(false);
    setPolygonClosed(true);
    processPolygon(points);
  };

  // Ricerca confini via Nominatim
  const handleSearch = async () => {
    if (!searchTerm) return;
    try {
      const res = await axios.get<NominatimResult[]>(
        "https://nominatim.openstreetmap.org/search",
        { params: { q: searchTerm, format: "json", polygon_geojson: 1 } }
      );
      if (!res.data.length) return alert("Nessun risultato.");
      const geo = res.data[0].geojson;
      // estrai coordinate primo poligono
      const coords: [number, number][] =
        geo.type === "Polygon"
          ? (geo.coordinates as [number, number][][])[0]
          : (geo.coordinates as [number, number][][][])[0][0];
      const polyPoints: LatLngTuple[] = coords.map((c) => [c[1], c[0]]);
      // imposta direttamente
      setPoints(polyPoints);
      setPolygonClosed(true);
      processPolygon(polyPoints);
    } catch {
      alert("Errore durante la ricerca confini.");
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
  };

  return (
    <div className="relative w-screen h-screen z-0">
      {/* Barra ricerca */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <input
          type="text"
          placeholder="Comune, Provincia, Regione..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-2 py-1 rounded border"
        />
        <button
          onClick={handleSearch}
          className="bg-indigo-600 text-white px-3 py-1 rounded shadow"
        >
          Cerca
        </button>
      </div>

      <MapContainer center={center} zoom={11} className="w-full h-full z-0">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {inserting && <MapClickHandler />}
        {/* Punti */}
        {points.map((pos, i) => (
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
        {/* Segmenti dinamici */}
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
        {/* Fill dinamico senza chiusura */}
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
        {/* Poligono chiuso */}
        {polygonClosed && points.length > 2 && (
          <Polygon
            positions={points}
            pathOptions={{ color: "blue", fillColor: "blue", fillOpacity: 0.3 }}
          />
        )}
        {/* Vie clippate */}
        {polygonClosed &&
          roads.map((seg, i) => (
            <Polyline key={i} positions={seg} color="green" weight={3} />
          ))}
      </MapContainer>

      {/* Bottoni */}
      {!inserting && !polygonClosed && (
        <button
          onClick={handleStart}
          className="absolute top-4 right-4 z-10 bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
        >
          Disegna confini
        </button>
      )}
      {inserting && (
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
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
        </div>
      )}
      {polygonClosed && (
        <button
          onClick={handleClear}
          className="absolute top-4 right-4 z-10 bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700"
        >
          Cancella confini
        </button>
      )}
      {polygonClosed && (
        <div className="absolute bottom-4 right-4 z-10 bg-white p-2 rounded shadow">
          Lunghezza totale: {totalLength.toFixed(2)} km
          <br />
          Superficie: {area.toFixed(2)} km²
          <br />
          Densità: {density.toFixed(2)} km/km²
        </div>
      )}
    </div>
  );
};

export default Layout;
