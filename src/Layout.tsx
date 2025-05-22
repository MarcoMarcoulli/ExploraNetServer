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

// Tipizzazione risposta Overpass API
interface OverpassElement {
  geometry: { lat: number; lon: number }[];
}
interface OverpassResponse {
  elements: OverpassElement[];
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

  const handleStart = () => {
    setPoints([]);
    setRoads([]);
    setTotalLength(0);
    setArea(0);
    setPolygonClosed(false);
    setInserting(true);
    console.log("Modalità inserimento punti abilitata");
  };

  const handleClose = async () => {
    if (points.length < 3) {
      alert("Inserisci almeno 3 punti per chiudere un poligono.");
      return;
    }
    setInserting(false);
    setPolygonClosed(true);

    const polyCoords = points.map((p) => [p[1], p[0]] as [number, number]);
    if (
      polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] ||
      polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]
    ) {
      polyCoords.push(polyCoords[0]);
    }
    const polygonFeature = turf.polygon([polyCoords]);

    // calcolo area
    const areaKm2 = turf.area(polygonFeature) / 1_000_000;
    setArea(areaKm2);

    // Overpass query
    const polyString = points.map((p) => `${p[0]} ${p[1]}`).join(" ");
    const query = `[out:json][timeout:25];(
  way["highway"](poly:"${polyString}");
);out body geom;`;

    try {
      const response = await axios.post<OverpassResponse>(
        "https://overpass-api.de/api/interpreter",
        query,
        { headers: { "Content-Type": "text/plain" } }
      );
      const elements = response.data.elements;

      const clipped: LatLngTuple[][] = [];
      elements.forEach((el) => {
        const coords = el.geometry.map((g) => [g.lat, g.lon] as LatLngTuple);
        for (let i = 0; i < coords.length - 1; i++) {
          const seg = [coords[i], coords[i + 1]];
          const mid: [number, number] = [
            (seg[0][1] + seg[1][1]) / 2,
            (seg[0][0] + seg[1][0]) / 2,
          ];
          if (turf.booleanPointInPolygon(turf.point(mid), polygonFeature)) {
            clipped.push(seg);
          }
        }
      });
      setRoads(clipped);
      // lunghezza
      const sum = clipped.reduce((acc, seg) => {
        const line = turf.lineString(seg.map((c) => [c[1], c[0]]));
        return acc + turf.length(line, { units: "kilometers" });
      }, 0);
      setTotalLength(sum);
      setDensity(sum / areaKm2);
    } catch {
      alert("Errore recupero vie da Overpass API.");
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
            .map((_, idx) => (
              <Polyline
                key={idx}
                positions={[points[idx], points[idx + 1]]}
                color="blue"
              />
            ))}
        {/* Fill dinamico senza spigolo di chiusura */}
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
          className="absolute top-4 right-4 z-10 bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
          onClick={handleStart}
        >
          Disegna confini
        </button>
      )}
      {inserting && (
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          <button
            className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700"
            onClick={handleClose}
          >
            Chiudi confini
          </button>
          <button
            className="bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700"
            onClick={handleClear}
          >
            Cancella confini
          </button>
        </div>
      )}
      {polygonClosed && (
        <button
          className="absolute top-4 right-4 z-10 bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700"
          onClick={handleClear}
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
          Densità di sentieri : {density.toFixed(2)} km/km²
        </div>
      )}
    </div>
  );
};

export default Layout;
