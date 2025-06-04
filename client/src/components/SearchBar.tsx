// src/components/SearchBar.tsx
import React from "react";

export interface Suggestion {
  label: string;
  lat: string;
  lon: string;
}

interface SearchBarProps {
  searchTerm: string;
  onChange: (value: string) => void;
  suggestions: Suggestion[];
  onSelect: (suggestion: Suggestion) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchTerm,
  onChange,
  suggestions,
  onSelect,
}) => (
  <div className="relative w-80 z-[600]">
    <input
      type="text"
      placeholder="Comune, Provincia, Regione..."
      value={searchTerm}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1 rounded border shadow-sm"
    />
    {suggestions.length > 0 && (
      <ul className="absolute mt-1 w-full bg-white border rounded shadow max-h-60 overflow-auto z-[600]">
        {suggestions.map((s, i) => (
          <li
            key={i}
            onClick={() => onSelect(s)}
            className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
          >
            {s.label}
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default SearchBar;
