
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
    transcript?: string;
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
    transcript,
    onStartListening,
    onStopListening,
    onNextQuestion,
    practiceState
}) => {
    
    const renderCopilotControls = () => (
        <>
            <div className="flex-1 min-w-0">
                <p className="text-gray-400 text-sm truncate italic">
                    {transcript ? `"${transcript}"` : 'Listening for interviewer...'}
                </p>
            </div>
            <button
                onClick={onGenerate}
                disabled={isProcessing}
                className="flex items-center space-x-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-full transition-colors duration-300 transform hover:scale-105"
            >
                <SparklesIcon className="w-5 h-5" />
                <span>{isProcessing ? 'Generating...' : 'Generate Talking Points'}</span>
            </button>
        </>
    );

    const renderPracticeControls = () => (
        <>
            <div className="flex-1 min-w-0">
                <p className="text-gray-400 text-sm truncate italic">
                    {isListening ? `Recording answer... "${transcript}"` : practiceState === 'feedback' ? "Review your feedback above." : "Ready for the next question."}
                </p>
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

export default Controls;
