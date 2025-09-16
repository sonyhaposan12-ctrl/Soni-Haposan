import React from 'react';

const LogoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className={className}
    fill="none"
  >
    <defs>
      <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#67e8f9" /> {/* cyan-300 */}
        <stop offset="100%" stopColor="#a5b4fc" /> {/* indigo-300 */}
      </linearGradient>
    </defs>
    {/* Headset Shape */}
    <path 
      d="M4 14v-3a8 8 0 1116 0v3" 
      stroke="#9ca3af" // gray-400
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
    <path 
      d="M4 14v4a2 2 0 002 2h0a2 2 0 002-2v-8a2 2 0 00-2-2h0a2 2 0 00-2 2v4z"
      stroke="#9ca3af" // gray-400
      strokeWidth="1.5" 
    />
    {/* Right earpiece with gradient */}
    <path 
      d="M18 12h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4a2 2 0 012-2z"
      fill="url(#logo-gradient)" 
      stroke="#818cf8" // indigo-400
      strokeWidth="1.5"
    />
    {/* Sparkle inside right earpiece */}
    <g transform="translate(17.5, 13) scale(0.3)">
      <path 
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
        fill="white"
      />
    </g>
  </svg>
);

export default LogoIcon;