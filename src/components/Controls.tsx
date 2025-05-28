// src/components/Controls.tsx
import React from "react";
import SearchBar from "./SearchBar";
import type { Suggestion } from "./SearchBar";
import DrawAreaButton from "./DrawAreaButton";
import CloseAreaButton from "./CloseAreaButton";
import CancelAreaButton from "./CancelAreaButton";

interface ControlsProps {
  insertingPoints: boolean;
  ClosedArea: boolean;
  isLoadingTrails: boolean;
  searchTerm: string;
  suggestions: Suggestion[];
  handleInputChange: (value: string) => void;
  handleSelectSuggestion: (s: Suggestion) => void;
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
