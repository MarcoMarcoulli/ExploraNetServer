// src/components/MapView.tsx
import React, { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  Polyline,
  Polygon,
  CircleMarker,
} from "react-leaflet";
import type { LatLngExpression, LatLngTuple } from "leaflet";
import LoadingState from "./LoadingState";

interface MapViewProps {
  center: LatLngExpression;
  polygonPoints: LatLngTuple[];
  isDrawing: boolean;

  // ⚠️ Importante: i segmenti NON sono LatLngTuple
  // arrivano dal backend → [lon, lat]
  roads: [number, number][][];
  trails: [number, number][][];

  isLoading: boolean;
  onMapClick: (latlng: LatLngTuple) => void;
  closedArea: boolean;
}

// Conversione backend → Leaflet
// Da [lon, lat] a [lat, lon]
function toLeafletSeg(seg: [number, number][]): LatLngTuple[] {
  return seg.map(([lon, lat]) => [lat, lon]) as LatLngTuple[];
}

const MapInner: React.FC<MapViewProps> = ({
  polygonPoints,
  isDrawing,
  roads,
  trails,
  onMapClick,
  closedArea,
}) => {
  const map = useMap();

  // Gestione click durante il disegno
  useMapEvents({
    click(e) {
      if (isDrawing) {
        onMapClick([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  // Al chiudersi dell'area, fai zoom automatico
  useEffect(() => {
    if (closedArea && polygonPoints.length > 0) {
      map.flyToBounds(polygonPoints, { padding: [20, 20] });
    }
  }, [closedArea, polygonPoints, map]);

  return (
    <>
      {/* Marker di disegno */}
      {isDrawing &&
        polygonPoints.map((pos, i) => (
          <CircleMarker
            key={`pt-${i}`}
            center={pos}
            radius={4}
            pathOptions={{ color: "red", fillColor: "red", fillOpacity: 1 }}
          />
        ))}

      {/* Anteprima linee durante il disegno */}
      {isDrawing &&
        polygonPoints
          .slice(0, -1)
          .map((_, i) => (
            <Polyline
              key={`ln-${i}`}
              positions={[polygonPoints[i], polygonPoints[i + 1]]}
              color="blue"
            />
          ))}

      {/* Poligono finale */}
      {closedArea && polygonPoints.length > 2 && (
        <Polygon
          positions={polygonPoints}
          pathOptions={{ color: "blue", fillColor: "blue", fillOpacity: 0.3 }}
        />
      )}

      {/* 🚀 Segnali strade (convertiti per Leaflet) */}
      {closedArea &&
        roads.map((seg, i) => (
          <Polyline
            key={`road-${i}`}
            positions={toLeafletSeg(seg)}
            color="red"
            weight={3}
          />
        ))}

      {/* 🚀 Segnali sentieri (convertiti per Leaflet) */}
      {closedArea &&
        trails.map((seg, i) => (
          <Polyline
            key={`trail-${i}`}
            positions={toLeafletSeg(seg)}
            color="green"
            weight={3}
          />
        ))}
    </>
  );
};

const MapView: React.FC<MapViewProps> = (props) => {
  return (
    <div className="relative w-full h-full">
      <MapContainer center={props.center} zoom={12} className="w-full h-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
        />
        <MapInner {...props} />
      </MapContainer>

      {/* Overlay di caricamento */}
      {props.isLoading && <LoadingState />}
    </div>
  );
};

export default MapView;
