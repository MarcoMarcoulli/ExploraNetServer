// src/components/CloseAreaButton.tsx
import React from "react";

interface CloseAreaButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const CloseAreaButton: React.FC<CloseAreaButtonProps> = ({
  onClick,
  disabled = false,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="bg-green-600 text-white z-[500] px-4 py-2 rounded shadow hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    Chiudi confini
  </button>
);

export default CloseAreaButton;
