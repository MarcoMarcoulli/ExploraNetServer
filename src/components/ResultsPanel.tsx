// src/components/ResultsPanel.tsx
import React from "react";

interface ResultsPanelProps {
  area: number;
  totalLengthRoads: number;
  totalLengthTrails: number;
  densityRoads: number;
  densityTrails: number;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({
  area,
  totalLengthRoads,
  totalLengthTrails,
  densityRoads,
  densityTrails,
}) => (
  <div className="absolute bottom-0 right-0 z-[500] bg-white/90 border border-gray-300 shadow-xl rounded-lg p-4 text-sm text-gray-800 w-72 backdrop-blur">
    <div className="space-y-1">
      <p>
        <span className="font-medium">Superficie:</span> {area.toFixed(2)} km²
      </p>
      <p>
        <span className="font-medium">Lunghezza totale strade:</span>{" "}
        {totalLengthRoads.toFixed(2)} km
      </p>
      <p>
        <span className="font-medium">Lunghezza totale sentieri:</span>{" "}
        {totalLengthTrails.toFixed(2)} km
      </p>
      <p>
        <span className="font-medium">Lunghezza totale :</span>{" "}
        {(totalLengthTrails + totalLengthRoads).toFixed(2)} km
      </p>
      <p>
        <span className="font-medium">Densità strade:</span>{" "}
        {densityRoads.toFixed(2)} km/km²
      </p>
      <p>
        <span className="font-medium">Densità sentieri:</span>{" "}
        {densityTrails.toFixed(2)} km/km²
      </p>
      <p>
        <span className="font-medium">Densità:</span>{" "}
        {(densityRoads + densityTrails).toFixed(2)} km/km²
      </p>
    </div>
  </div>
);

export default ResultsPanel;
