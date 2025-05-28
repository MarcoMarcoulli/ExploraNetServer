// src/components/ResultsPanel.tsx
import React from "react";

interface ResultsPanelProps {
  totalLength: number;
  area: number;
  density: number;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({
  totalLength,
  area,
  density,
}) => (
  <div className="absolute bottom-0 right-0 z-[500] bg-white/90 border border-gray-300 shadow-xl rounded-lg p-4 text-sm text-gray-800 w-72 backdrop-blur">
    <h3 className="text-lg font-semibold text-gray-900 mb-2">Risultati</h3>
    <div className="space-y-1">
      <p>
        <span className="font-medium">Lunghezza totale:</span>{" "}
        {totalLength.toFixed(2)} km
      </p>
      <p>
        <span className="font-medium">Superficie:</span> {area.toFixed(2)} km²
      </p>
      <p>
        <span className="font-medium">Densità:</span> {density.toFixed(2)}{" "}
        km/km²
      </p>
    </div>
  </div>
);

export default ResultsPanel;
