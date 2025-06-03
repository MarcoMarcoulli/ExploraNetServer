import React from "react";

interface ErrorMessageProps {
  message: string;
  onClose: () => void;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center">
      <div className="bg-white border border-red-400 text-red-700 px-6 py-4 rounded shadow-lg max-w-sm w-full mx-4">
        <div className="text-center">
          <p className="text-sm mb-4">{message}</p>
          <button
            onClick={onClose}
            className="bg-red-500 hover:bg-red-600 text-white font-semibold py-1 px-4 rounded"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorMessage;
