// src/components/DrawAreaButton.tsx
import React from "react";

interface DrawAreaButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const DrawAreaButton: React.FC<DrawAreaButtonProps> = ({
  onClick,
  disabled = false,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="bg-blue-600 text-white z-[500] px-4 py-2 rounded shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    Disegna confini
  </button>
);

export default DrawAreaButton;
