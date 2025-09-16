import React from 'react';

const ClipboardIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    fill="none" 
    viewBox="0 0 24 24" 
    strokeWidth={1.5} 
    stroke="currentColor" 
    className={className}
  >
    <path 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3A2.25 2.25 0 0 0 8.25 4.5v2.25c0 .621.504 1.125 1.125 1.125h5.25c.621 0 1.125-.504 1.125-1.125V4.5A2.25 2.25 0 0 0 15.666 3.888Z" 
    />
    <path 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      d="M1.5 7.5A2.25 2.25 0 0 1 3.75 5.25h16.5A2.25 2.25 0 0 1 22.5 7.5v10.5A2.25 2.25 0 0 1 20.25 21H3.75A2.25 2.25 0 0 1 1.5 18.375V7.5Z" 
    />
  </svg>
);

export default ClipboardIcon;