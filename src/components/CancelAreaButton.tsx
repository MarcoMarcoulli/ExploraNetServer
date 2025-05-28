// src/components/CancelAreaButton.tsx
import React from "react";

interface CancelAreaButtonProps {
  onClick: () => void;
}

const CancelAreaButton: React.FC<CancelAreaButtonProps> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="bg-red-600 text-white z-[800] px-4 py-2 rounded shadow hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    Cancella confini
  </button>
);

export default CancelAreaButton;
