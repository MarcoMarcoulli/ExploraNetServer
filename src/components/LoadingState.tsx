// src/components/LoadingState.tsx
import React from "react";

interface LoadingStateProps {
  className?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({ className }) => (
  <div
    className={
      `absolute inset-0 bg-white/70 z-[400] flex items-center justify-center` +
      (className ? ` ${className}` : "")
    }
  >
    <svg
      className="h-12 w-12 animate-spin text-gray-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  </div>
);

export default LoadingState;
