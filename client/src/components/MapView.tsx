import React, { forwardRef } from "react";
import {
  MapContainer,
  TileLayer,
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
  
  // 2. MODIFICA QUI: Usa LatLngExpression[][] invece di [number, number][][]
  // Questo accetterà sia i dati dal backend che i tipi di Leaflet senza errori.
  roads: LatLngExpression[][];
  trails: LatLngExpression[][];

  isLoading: boolean;
  onMapClick: (latlng: LatLngTuple) => void;
  closedArea: boolean;
}

// Helper per girare le coordinate [lon, lat] -> [lat, lon]
function toLeaflet(segments: LatLngExpression[][]): LatLngExpression[][] {
  return segments.map(line => 
    (line as number[][]).map(pt => [pt[1], pt[0]] as LatLngTuple)
  );
}

const MapInner: React.FC<MapViewProps> = ({
  polygonPoints,
  isDrawing,
  roads,
  trails,
  onMapClick,
  closedArea,
}) => {
  
  useMapEvents({
    click(e) {
      if (isDrawing) {
        onMapClick([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  const renderRoads = toLeaflet(roads);
  const renderTrails = toLeaflet(trails);

  return (
    <>
      {isDrawing &&
        polygonPoints.map((pos, i) => (
          <CircleMarker
            key={`pt-${i}`}
            center={pos}
            radius={4}
            pathOptions={{ color: "red", fillColor: "red", fillOpacity: 1 }}
          />
        ))}

      {isDrawing &&
        polygonPoints.slice(0, -1).map((_, i) => (
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
        renderRoads.map((seg, i) => (
          <Polyline key={`r-${i}`} positions={seg} color="red" weight={3} />
        ))}

      {closedArea &&
        renderTrails.map((seg, i) => (
          <Polyline key={`t-${i}`} positions={seg} color="green" weight={3} dashArray="5, 5" />
        ))}
    </>
  );
};

const MapView = forwardRef<any, MapViewProps>((props, ref) => {
  return (
    <div className="relative w-full h-full">
      <MapContainer 
        center={props.center} 
        zoom={12} 
        className="w-full h-full"
        ref={ref}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
        />
        <MapInner {...props} />
      </MapContainer>
      {props.isLoading && <LoadingState />}
    </div>
  );
});

export default MapView;
