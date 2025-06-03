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
  roads: LatLngTuple[][];
  trails: LatLngTuple[][];
  isLoading: boolean;
  onMapClick: (latlng: LatLngTuple) => void;
  closedArea: boolean;
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

  // handle clicks when drawing
  useMapEvents({
    click(e) {
      if (isDrawing) {
        onMapClick([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  // fly to bounds when area is closed
  useEffect(() => {
    if (closedArea && polygonPoints.length > 0) {
      map.flyToBounds(polygonPoints, { padding: [20, 20] });
    }
  }, [closedArea, polygonPoints, map]);

  return (
    <>
      {/* drawing markers */}
      {isDrawing &&
        polygonPoints.map((pos, i) => (
          <CircleMarker
            key={`pt-${i}`}
            center={pos}
            radius={4}
            pathOptions={{ color: "red", fillColor: "red", fillOpacity: 1 }}
          />
        ))}

      {/* drawing polyline preview */}
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

      {closedArea && polygonPoints.length > 2 && (
        <Polygon
          positions={polygonPoints}
          pathOptions={{ color: "blue", fillColor: "blue", fillOpacity: 0.3 }}
        />
      )}

      {closedArea &&
        roads.map((seg, i) => (
          <Polyline key={`tr-${i}`} positions={seg} color="red" weight={3} />
        ))}

      {closedArea &&
        trails.map((seg, i) => (
          <Polyline key={`tr-${i}`} positions={seg} color="green" weight={3} />
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

      {/* loading overlay */}
      {props.isLoading && <LoadingState />}
    </div>
  );
};

export default MapView;
