// src/components/SearchBar.tsx
import { useState, useEffect, useRef } from "react";

// 1. Definiamo l'interfaccia base. 
// Rendiamo osm_id e osm_type opzionali: questo risolve i conflitti di tipo.
export interface Suggestion {
  label: string;
  lat: string;
  lon: string;
  osm_id?: number;
  osm_type?: string;
}

// 2. Usiamo un GENERICO <T>.
// Questo dice a TypeScript: "Accetta qualsiasi oggetto che estende Suggestion".
// Così ExtendedSuggestion (che ha osm_id obbligatorio) viene accettato senza errori.
interface SearchBarProps<T extends Suggestion> {
  searchTerm: string;
  onChange: (value: string) => void;
  suggestions: T[];
  onSelect: (suggestion: T) => void;
}

const SearchBar = <T extends Suggestion>({
  searchTerm,
  onChange,
  suggestions,
  onSelect,
}: SearchBarProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Chiude il menu se clicchi fuori
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (suggestions.length > 0) setIsOpen(true);
  }, [suggestions]);

  return (
    <div ref={wrapperRef} className="relative w-80 z-[600]">
      
      {/* --- PUNTO CRITICO PER RISOLVERE "CLIENT DISCONNECTED" --- */}
      {/* onSubmit={e => e.preventDefault()} impedisce il refresh della pagina */}
      <form 
        onSubmit={(e) => e.preventDefault()} 
        className="w-full"
      >
        <input
          type="text"
          placeholder="Comune, Provincia, Regione..."
          value={searchTerm}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          // Sicurezza extra: Blocca Invio anche da tastiera
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          className="w-full px-2 py-1 rounded border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </form>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute mt-1 w-full bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-auto z-[600]">
          {suggestions.map((s, i) => (
            <li
              key={`${s.lat}-${s.lon}-${i}`}
              onClick={() => {
                onSelect(s);
                setIsOpen(false);
              }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0 border-gray-100"
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;