import React from 'react';
import SparklesIcon from './icons/SparklesIcon';
import SpeakerOnIcon from './icons/SpeakerOnIcon';
import SpeakerOffIcon from './icons/SpeakerOffIcon';
import StarIcon from './icons/StarIcon';
import ClockIcon from './icons/ClockIcon';
import CogIcon from './icons/CogIcon';
import { ConversationItem } from '../types';
import RealtimeMonitor from './RealtimeMonitor';

interface FeedbackProps {
    title: string;
    content: string | null;
    rating: ConversationItem['rating'] | null;
    isTtsEnabled: boolean;
    onToggleTts: () => void;
    onOpenSettings: () => void;
    showTtsToggle?: boolean;
    elapsedTime: number;
    audioStream: MediaStream | null;
    finalTranscript?: string;
    interimTranscript?: string;
}

declare global {
    interface Window {
        marked: {
            parse: (markdown: string, options?: object) => string;
        };
    }
}

const parseMarkdown = (text: string | null): string => {
    if (!text) return '';
    if (window.marked) {
        // Use GFM and breaks for better formatting of typical AI responses.
        return window.marked.parse(text, { breaks: true, gfm: true });
    }
    // Simple fallback if marked.js fails to load.
    return text.replace(/\n/g, '<br />');
};


const getRatingClass = (rating: ConversationItem['rating']) => {
    switch (rating) {
        case 'Excellent':
            return 'bg-green-500/20 text-green-300 border-green-500/30';
        case 'Good':
            return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
        case 'Needs Improvement':
            return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
        default:
            return 'bg-gray-600/20 text-gray-300 border-gray-500/30';
    }
};

const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const Feedback: React.FC<FeedbackProps> = ({ title, content, rating, isTtsEnabled, onToggleTts, onOpenSettings, showTtsToggle = true, elapsedTime, audioStream, finalTranscript, interimTranscript }) => {
    const isError = content?.toLowerCase().startsWith('error:');
    
    return (
        <div className="w-full md:w-1/3 bg-gray-900/50 p-6 border-l border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white flex items-center">
                    <SparklesIcon className="w-6 h-6 mr-2 text-cyan-400" />
                    {title}
                </h2>
                <div className="flex items-center space-x-2">
                    <div className="flex items-center gap-2 text-lg font-mono text-gray-400 tracking-wider bg-gray-900 px-3 py-1 rounded-full border border-gray-700">
                        <ClockIcon className="w-5 h-5" />
                        <span>{formatTime(elapsedTime)}</span>
                    </div>
                    {showTtsToggle && (
                        <button
                            onClick={onToggleTts}
                            className="p-2 rounded-full hover:bg-gray-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400"
                            aria-label={isTtsEnabled ? "Disable audio feedback" : "Enable audio feedback"}
                        >
                            {isTtsEnabled ? (
                                <SpeakerOnIcon className="w-6 h-6 text-gray-300" />
                            ) : (
                                <SpeakerOffIcon className="w-6 h-6 text-gray-500" />
                            )}
                        </button>
                    )}
                     <button
                        onClick={onOpenSettings}
                        className="p-2 rounded-full hover:bg-gray-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400"
                        aria-label="Open settings"
                    >
                        <CogIcon className="w-6 h-6 text-gray-400 hover:text-white" />
                    </button>
                </div>
            </div>
            <div className={`flex-1 bg-gray-800 rounded-lg p-4 overflow-y-auto transition-all min-h-0 ${isError ? 'border border-red-500/50' : ''}`}>
                {content ? (
                    <div>
                        {rating && (
                             <div className={`inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full text-sm font-semibold border ${getRatingClass(rating)}`}>
                                <StarIcon className="w-4 h-4" />
                                <span>{rating}</span>
                            </div>
                        )}
                        <div
                            className={`markdown-content text-gray-300 ${isError ? 'text-red-300' : ''}`}
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
                        />
                    </div>
                 ) : (
                    <RealtimeMonitor 
                        audioStream={audioStream}
                        finalTranscript={finalTranscript}
                        interimTranscript={interimTranscript}
                    />
                )}
            </div>
        </div>
    );
};

export default Feedback;
