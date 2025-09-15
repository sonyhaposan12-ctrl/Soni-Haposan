import React from 'react';

const SpeakerOffIcon: React.FC<{ className?: string }> = ({ className }) => (
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
      d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6.375a9 9 0 0 1 12.728 0M16.463 8.288 12 12.751 7.537 8.288c-.76-.76-1.76-.98-2.68-.68A5.25 5.25 0 0 0 2.25 12c0 .83.112 1.633.322 2.396C2.806 15.244 3.63 15.75 4.51 15.75H6.75l4.72 4.72a.75.75 0 0 0 1.28-.53V5.12a.75.75 0 0 0-1.28-.53L6.75 9.25H4.51c-.88 0-1.704.507-1.938 1.354A9.01 9.01 0 0 0 2.25 12Z" 
    />
  </svg>
);

export default SpeakerOffIcon;