// src/App.tsx
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
  const center: LatLngExpression = [45.0, 9.7];
  const [points, setPoints] = useState<LatLngTuple[]>([]);
  const [inserting, setInserting] = useState(false);
  const [polygonClosed, setPolygonClosed] = useState(false);
  const [roads, setRoads] = useState<LatLngTuple[][]>([]);
  const [totalLength, setTotalLength] = useState<number>(0);

  // Gestisce click per punti
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

  // Avvia inserimento
  const handleStart = () => {
    setPoints([]);
    setRoads([]);
    setTotalLength(0);
    setPolygonClosed(false);
    setInserting(true);
    console.log("Modalità inserimento punti abilitata");
  };

  // Chiude poligono e recupera vie
  const handleClose = async () => {
    if (points.length < 3) {
      alert("Inserisci almeno 3 punti per chiudere un poligono.");
      return;
    }
    setInserting(false);
    setPolygonClosed(true);

    // Crea poligono Turf ([lon, lat])
    const polyCoords = points.map((p) => [p[1], p[0]] as [number, number]);
    if (
      polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] ||
      polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]
    ) {
      polyCoords.push(polyCoords[0]);
    }
    const polygonFeature = turf.polygon([polyCoords]);

    // Overpass: tutte le vie highway, railway, waterway
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

      // Segmentazione manuale e filtraggio segmenti interni
      const clippedSegments: LatLngTuple[][] = [];
      elements.forEach((el) => {
        const coords = el.geometry.map((g) => [g.lat, g.lon] as LatLngTuple);
        for (let i = 0; i < coords.length - 1; i++) {
          const segment: LatLngTuple[] = [coords[i], coords[i + 1]];
          // Punto medio in [lon, lat]
          const mid: [number, number] = [
            (segment[0][1] + segment[1][1]) / 2,
            (segment[0][0] + segment[1][0]) / 2,
          ];
          if (turf.booleanPointInPolygon(turf.point(mid), polygonFeature)) {
            clippedSegments.push(segment);
          }
        }
      });
      setRoads(clippedSegments);

      // Calcola lunghezza totale (km)
      const sum = clippedSegments.reduce((acc, seg) => {
        const line = turf.lineString(seg.map((c) => [c[1], c[0]]));
        return acc + turf.length(line, { units: "kilometers" });
      }, 0);
      setTotalLength(sum);
      console.log(`Lunghezza totale clippata: ${sum.toFixed(2)} km`);
    } catch (error) {
      console.error(error);
      alert("Errore recupero vie da Overpass API.");
    }
  };

  // Reset dati
  const handleClear = () => {
    setPoints([]);
    setRoads([]);
    setTotalLength(0);
    setPolygonClosed(false);
    setInserting(false);
    console.log("Dati resettati");
  };

  return (
    <div className="relative w-screen h-screen z-0">
      <MapContainer center={center} zoom={13} className="w-full h-full z-0">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {inserting && <MapClickHandler />}
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
        {points.length > 1 && <Polyline positions={points} color="blue" />}
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
      {!inserting && !polygonClosed && (
        <button
          className="absolute top-4 right-4 z-10 bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
          onClick={handleStart}
        >
          Inserisci confine
        </button>
      )}
      {inserting && (
        <button
          className="absolute top-4 right-4 z-10 bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700"
          onClick={handleClose}
        >
          Chiudi forma
        </button>
      )}
      {(points.length > 0 || polygonClosed) && (
        <button
          className="absolute top-4 left-4 z-10 bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700"
          onClick={handleClear}
        >
          Cancella confini
        </button>
      )}
      {polygonClosed && (
        <div className="absolute bottom-4 right-4 z-10 bg-white p-2 rounded shadow">
          Lunghezza totale: {totalLength.toFixed(2)} km
        </div>
      )}
    </div>
  );
};

export default Layout;
