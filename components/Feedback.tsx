import React from 'react';
import SparklesIcon from './icons/SparklesIcon';
import StarIcon from './icons/StarIcon';
import CogIcon from './icons/CogIcon';
import { ConversationItem } from '../types';
import RealtimeMonitor from './RealtimeMonitor';
import TimerDisplay from './TimerDisplay';
import { T } from '../translations';

interface FeedbackProps {
    title: string;
    content: string | null;
    rating: ConversationItem['rating'] | null;
    onOpenSettings: () => void;
    sessionStartTime: number;
    audioStream: MediaStream | null;
    finalTranscript?: string;
    interimTranscript?: string;
    translations: typeof T['en'];
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
        case 'Luar Biasa':
            return 'bg-green-500/20 text-green-300 border-green-500/30';
        case 'Good':
        case 'Baik':
            return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
        case 'Needs Improvement':
        case 'Perlu Peningkatan':
            return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
        default:
            return 'bg-gray-600/20 text-gray-300 border-gray-500/30';
    }
};

const Feedback: React.FC<FeedbackProps> = ({ title, content, rating, onOpenSettings, sessionStartTime, audioStream, finalTranscript, interimTranscript, translations }) => {
    const isError = content?.toLowerCase().startsWith('error:') || content?.toLowerCase().startsWith('kesalahan:');
    
    return (
        <div className="w-full md:w-1/3 bg-gray-900/50 p-6 border-l border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white flex items-center">
                    <SparklesIcon className="w-6 h-6 mr-2 text-cyan-400" />
                    {title}
                </h2>
                <div className="flex items-center space-x-2">
                    <TimerDisplay startTime={sessionStartTime} />
                     <button
                        onClick={onOpenSettings}
                        className="p-2 rounded-full hover:bg-gray-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400"
                        aria-label={translations.openSettings}
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
                        translations={translations}
                        audioStream={audioStream}
                        finalTranscript={finalTranscript}
                        interimTranscript={interimTranscript}
                    />
                )}
            </div>
        </div>
    );
};

export default React.memo(Feedback);