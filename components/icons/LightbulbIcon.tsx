import React from 'react';

const LightbulbIcon: React.FC<{ className?: string }> = ({ className }) => (
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
        d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.311a7.5 7.5 0 0 1-7.5 0c.401-.42.792-.863 1.135-1.327a7.5 7.5 0 0 1 5.23 0c.343.464.734.907 1.135 1.327ZM12 2.25a2.25 2.25 0 0 1 2.25 2.25v.75a2.25 2.25 0 0 1-4.5 0v-.75A2.25 2.25 0 0 1 12 2.25Z" 
    />
  </svg>
);

export default LightbulbIcon;
