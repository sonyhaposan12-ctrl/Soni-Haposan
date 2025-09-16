import React from 'react';
import ExclamationIcon from './icons/ExclamationIcon';

interface ErrorDisplayProps {
  message: string;
  onDismiss: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ message, onDismiss }) => {

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 animate-fade-in px-4">
      <div className="bg-red-800/90 backdrop-blur-sm border border-red-600 text-white p-4 rounded-lg shadow-2xl flex items-center space-x-4">
        <ExclamationIcon className="w-8 h-8 text-red-300 flex-shrink-0" />
        <p className="flex-1 text-red-100">{message}</p>
        <button
          onClick={onDismiss}
          className="p-1 rounded-full hover:bg-red-700/50 transition-colors"
          aria-label="Dismiss error message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ErrorDisplay;