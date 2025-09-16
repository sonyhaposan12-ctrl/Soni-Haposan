import React, { useState, useEffect } from 'react';
import ClockIcon from './icons/ClockIcon';

interface TimerDisplayProps {
  startTime: number;
}

const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const TimerDisplay: React.FC<TimerDisplayProps> = ({ startTime }) => {
    const [elapsedTime, setElapsedTime] = useState(Math.floor((Date.now() - startTime) / 1000));

    useEffect(() => {
        const intervalId = setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);

        return () => clearInterval(intervalId);
    }, [startTime]);

    return (
        <div className="flex items-center gap-2 text-lg font-mono text-gray-400 tracking-wider bg-gray-900 px-3 py-1 rounded-full border border-gray-700">
            <ClockIcon className="w-5 h-5" />
            <span>{formatTime(elapsedTime)}</span>
        </div>
    );
};

export default TimerDisplay;
