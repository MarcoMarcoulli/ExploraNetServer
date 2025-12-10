// src/components/Controls.tsx
import React from "react";
import SearchBar from "./SearchBar";
import type { Suggestion } from "./SearchBar";
import DrawAreaButton from "./DrawAreaButton";
import CloseAreaButton from "./CloseAreaButton";
import CancelAreaButton from "./CancelAreaButton";

// 1. Definisci l'interfaccia Estesa (DEVE essere presente qui per il casting)
export interface ExtendedSuggestion extends Suggestion {
  osm_id: number;
  osm_type: string;
}

interface ControlsProps {
  insertingPoints: boolean;
  ClosedArea: boolean;
  isLoadingTrails: boolean;
  searchTerm: string;
  
  // 2. I dati in ingresso sono estesi
  suggestions: ExtendedSuggestion[]; 
  handleSelectSuggestion: (s: ExtendedSuggestion) => void;
  
  handleInputChange: (value: string) => void;
  handleStart: () => void;
  handleClose: () => void;
  handleClear: () => void;
}

const Controls: React.FC<ControlsProps> = ({
  insertingPoints,
  ClosedArea,
  isLoadingTrails,
  searchTerm,
  suggestions,
  handleInputChange,
  handleSelectSuggestion,
  handleStart,
  handleClose,
  handleClear,
}) => (
  <div className="absolute top-4 right-4 z-[600] flex flex-col gap-2 items-end">
    {!insertingPoints && !ClosedArea && (
      // 3. Passiamo i dati alla SearchBar
      // TypeScript dedurrà automaticamente T = ExtendedSuggestion grazie alle props passate
      <SearchBar
        searchTerm={searchTerm}
        onChange={handleInputChange}
        suggestions={suggestions}
        onSelect={handleSelectSuggestion} 
      />
    )}
    {!insertingPoints && !ClosedArea && (
      <DrawAreaButton onClick={handleStart} disabled={isLoadingTrails} />
    )}
    {insertingPoints && (
      <>
        <CloseAreaButton onClick={handleClose} disabled={isLoadingTrails} />
        <CancelAreaButton onClick={handleClear} />
      </>
    )}
    {ClosedArea && !insertingPoints && (
      <CancelAreaButton onClick={handleClear} />
    )}
  </div>
);

export default Controls;