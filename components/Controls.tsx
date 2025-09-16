import React from 'react';
import StopIcon from './icons/StopIcon';
import SparklesIcon from './icons/SparklesIcon';
import MicIcon from './icons/MicIcon';
import { AppMode } from '../types';

interface ControlsProps {
    mode: AppMode;
    isProcessing: boolean;
    isListening: boolean;
    onEndSession: () => void;
    // Copilot props
    onGenerate?: () => void;
    onGenerateExample?: () => void;
    finalTranscript?: string;
    interimTranscript?: string;
    isOnCooldown?: boolean;
    cooldownSeconds?: number;
    // Practice props
    onStartListening?: () => void;
    onStopListening?: () => void;
    onNextQuestion?: () => void;
    practiceState?: 'asking' | 'answering' | 'feedback';
}

const Controls: React.FC<ControlsProps> = ({ 
    mode, 
    isProcessing, 
    isListening,
    onEndSession, 
    onGenerate,
    onGenerateExample, 
    finalTranscript,
    interimTranscript,
    isOnCooldown,
    cooldownSeconds,
    onStartListening,
    onStopListening,
    onNextQuestion,
    practiceState
}) => {
    
    const renderCopilotControls = () => {
        const fullTranscript = [finalTranscript, interimTranscript].filter(Boolean).join(' ');
        let statusText = 'Listening for interviewer...';
        if (isProcessing) {
            statusText = 'AI is generating suggestions...';
        } else if (isOnCooldown) {
            statusText = `Rate limited. Please wait ${cooldownSeconds}s.`;
        } else if (isListening && fullTranscript) {
            statusText = `"${fullTranscript}"`;
        } else if (isListening) {
            statusText = 'Listening...';
        }
        
        const isButtonDisabled = isProcessing || isOnCooldown;
        const talkingPointsText = isOnCooldown ? `On Cooldown (${cooldownSeconds}s)` : isProcessing ? 'Thinking...' : 'Talking Points';
        const exampleAnswerText = isOnCooldown ? `On Cooldown (${cooldownSeconds}s)` : isProcessing ? 'Drafting...' : 'Example Answer';

        return (
            <>
                <div className="flex-1 min-w-0">
                    <p className="text-gray-400 text-sm truncate italic">
                        {statusText}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onGenerate}
                        disabled={isButtonDisabled}
                        className="flex items-center space-x-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-full transition-colors duration-300 transform hover:scale-105"
                    >
                        <SparklesIcon className="w-5 h-5" />
                        <span>{talkingPointsText}</span>
                    </button>
                     <button
                        onClick={onGenerateExample}
                        disabled={isButtonDisabled}
                        className="flex items-center space-x-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-full transition-colors duration-300 transform hover:scale-105"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" />
                        </svg>
                        <span>{exampleAnswerText}</span>
                    </button>
                </div>
            </>
        );
    }

    const renderPracticeControls = () => (
        <>
            <div className="flex-1 min-w-0">
                 <div className="text-gray-400 text-sm italic">
                    {isListening ?
                        <div>
                            <span>Recording answer...</span>
                            <p className="text-gray-200 mt-0.5">
                                {finalTranscript}
                                {interimTranscript && (
                                    <span className="bg-cyan-500/20 text-cyan-200 px-1 rounded ml-1">
                                        {interimTranscript}
                                    </span>
                                )}
                            </p>
                        </div>
                        : practiceState === 'feedback'
                            ? <p>Review your feedback above.</p>
                            : <p>Ready for the next question.</p>
                    }
                </div>
            </div>
            {practiceState === 'asking' && (
                 <button
                    onClick={onStartListening}
                    disabled={isProcessing}
                    className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-full transition-colors duration-300"
                >
                    <MicIcon className="w-5 h-5" />
                    <span>Answer Question</span>
                </button>
            )}
             {practiceState === 'answering' && (
                <button
                    onClick={onStopListening}
                    disabled={isProcessing}
                    className="flex items-center space-x-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-full transition-colors duration-300"
                >
                    <StopIcon className="w-5 h-5" />
                    <span>{isProcessing ? 'Submitting...' : 'Submit Answer'}</span>
                </button>
            )}
             {practiceState === 'feedback' && (
                 <button
                    onClick={onNextQuestion}
                    disabled={isProcessing}
                    className="flex items-center space-x-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-full transition-colors duration-300"
                >
                    <SparklesIcon className="w-5 h-5" />
                    <span>{isProcessing ? 'Getting Question...' : 'Next Question'}</span>
                </button>
            )}
        </>
    );

    return (
        <div className="w-full bg-gray-900/50 backdrop-blur-sm p-4 border-t border-gray-700">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
                {mode === 'copilot' ? renderCopilotControls() : renderPracticeControls()}
                <button
                    onClick={onEndSession}
                    disabled={isProcessing && practiceState !== 'answering'}
                    className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-full transition-colors duration-300"
                >
                    <StopIcon className="w-5 h-5" />
                    <span>End & Summarize</span>
                </button>
            </div>
        </div>
    );
};

export default React.memo(Controls);