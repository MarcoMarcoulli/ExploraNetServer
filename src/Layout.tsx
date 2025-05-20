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

  // Gestisce il click sulla mappa per aggiungere punti
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

  // Inizia inserimento e reset dati
  const handleStart = () => {
    setInserting(true);
    setPolygonClosed(false);
    setPoints([]);
    setRoads([]);
    setTotalLength(0);
    console.log("Modalità inserimento punti abilitata");
  };

  // Chiude il poligono e carica vie da Overpass
  const handleClose = async () => {
    if (points.length < 3) {
      alert("Inserisci almeno 3 punti per chiudere un poligono.");
      return;
    }
    setInserting(false);
    setPolygonClosed(true);
    console.log("Poligono chiuso, recupero vie...");

    // Costruisci la stringa del poligono per Overpass (lat lon lat lon ...)
    const polyString = points.map((p) => `${p[0]} ${p[1]}`).join(" ");
    const query = `[out:json][timeout:25];way["highway"](poly:"${polyString}");out body geom;`;

    try {
      const response = await axios.post<OverpassResponse>(
        "https://overpass-api.de/api/interpreter",
        query,
        { headers: { "Content-Type": "text/plain" } }
      );
      const elements = response.data.elements;
      // Estrai geometrie come array di lat-lng tuples
      const fetchedRoads: LatLngTuple[][] = elements.map((el) =>
        el.geometry.map((g) => [g.lat, g.lon] as LatLngTuple)
      );
      setRoads(fetchedRoads);

      // Calcola lunghezza totale in km
      let sum = 0;
      fetchedRoads.forEach((coords) => {
        // turf richiede [lon, lat]
        const line = turf.lineString(coords.map((c) => [c[1], c[0]]));
        const len = turf.length(line, { units: "kilometers" });
        sum += len;
      });
      setTotalLength(sum);
      console.log(`Lunghezza totale: ${sum.toFixed(2)} km`);
    } catch (err) {
      console.error(err);
      alert("Errore durante il recupero delle vie da Overpass API.");
    }
  };

  // Cancella tutto
  const handleClear = () => {
    setPoints([]);
    setInserting(false);
    setPolygonClosed(false);
    setRoads([]);
    setTotalLength(0);
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

        {/* Punti inseriti */}
        {points.map((pos, idx) => (
          <CircleMarker
            key={idx}
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

        {/* Polilinea durante l'inserimento e dopo la chiusura */}
        {points.length > 1 && <Polyline positions={points} color="blue" />}

        {/* Poligono chiuso */}
        {polygonClosed && points.length > 2 && (
          <Polygon
            positions={points}
            pathOptions={{ color: "blue", fillColor: "blue", fillOpacity: 0.3 }}
          />
        )}

        {/* Vie recuperate evidenziate in verde */}
        {polygonClosed &&
          roads.map((coords, idx) => (
            <Polyline
              key={`road-${idx}`}
              positions={coords}
              color="green"
              weight={3}
            />
          ))}
      </MapContainer>

      {/* Pulsanti azioni */}
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

      {/* Mostra lunghezza totale in basso a destra */}
      {polygonClosed && (
        <div className="absolute bottom-4 right-4 z-10 bg-white p-2 rounded shadow">
          Lunghezza totale: {totalLength.toFixed(2)} km
        </div>
      )}
    </div>
  );
};

export default Layout;
