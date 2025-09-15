import React from 'react';
import SparklesIcon from './icons/SparklesIcon';
import SpeakerOnIcon from './icons/SpeakerOnIcon';
import SpeakerOffIcon from './icons/SpeakerOffIcon';

interface FeedbackProps {
    title: string;
    content: string | null;
    isTtsEnabled: boolean;
    onToggleTts: () => void;
    showTtsToggle?: boolean;
}

const Feedback: React.FC<FeedbackProps> = ({ title, content, isTtsEnabled, onToggleTts, showTtsToggle = true }) => {
    return (
        <div className="w-full md:w-1/3 bg-gray-900/50 p-6 border-l border-gray-700 flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white flex items-center">
                    <SparklesIcon className="w-6 h-6 mr-2 text-cyan-400" />
                    {title}
                </h2>
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
            </div>
            <div className="flex-1 bg-gray-800 rounded-lg p-4 overflow-y-auto">
                {content ? (
                    <p className="text-gray-300 whitespace-pre-wrap">{content}</p>
                ) : (
                    <div className="text-gray-500 h-full flex flex-col items-center justify-center text-center">
                       <SparklesIcon className="w-12 h-12 mb-4 text-gray-600" />
                       <p className="font-medium">Content will appear here.</p>
                       <p className="text-sm">Follow the instructions in the control bar below.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Feedback;