import React from 'react';

const HeadsetIcon: React.FC<{ className?: string }> = ({ className }) => (
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
      d="M12 18.75a6 6 0 0 0 6-6v-1.5a6 6 0 0 0-12 0v1.5a6 6 0 0 0 6 6Z" 
    />
    <path 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      d="M15.75 18.75v.008m-7.5 0v.008m7.5 0a2.25 2.25 0 0 1-2.25 2.25h-3a2.25 2.25 0 0 1-2.25-2.25v-.008" 
    />
    <path 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      d="M17.25 9.75v-3.75a4.5 4.5 0 0 0-9 0v3.75" 
    />
  </svg>
);

export default HeadsetIcon;
