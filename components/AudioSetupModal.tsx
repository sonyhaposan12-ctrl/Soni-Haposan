import React, { useState } from 'react';
import RealtimeMonitor from './RealtimeMonitor';
import HeadsetIcon from './icons/HeadsetIcon';
import { T } from '../translations';

interface AudioSetupModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  audioStream: MediaStream | null;
  translations: typeof T['en'];
}

const AudioSetupModal: React.FC<AudioSetupModalProps> = ({ onConfirm, onCancel, audioStream, translations }) => {
    const [testSoundPlayed, setTestSoundPlayed] = useState(false);

    const handlePlayTestSound = () => {
        setTestSoundPlayed(true);
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (!audioContext) {
            alert("Web Audio API is not supported in this browser.");
            return;
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 pitch
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.1); // Fade in

        oscillator.start(audioContext.currentTime);

        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 1.5); // Fade out
        oscillator.stop(audioContext.currentTime + 1.5);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-8 shadow-2xl max-w-2xl w-full text-center">
                <div className="bg-cyan-500/10 p-4 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                    <HeadsetIcon className="w-12 h-12 text-cyan-300" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Copilot Audio Check</h2>
                <p className="text-gray-400 mb-6 max-w-lg mx-auto">
                    To hear the interviewer, the AI needs to listen through your microphone. Please use <strong className="text-white">speakers, not headphones,</strong> for this session.
                </p>

                <div className="bg-gray-900/50 rounded-lg p-4 mb-6">
                    <p className="text-gray-300 font-semibold mb-2">Step 1: Play a test sound</p>
                    <button
                        onClick={handlePlayTestSound}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-6 rounded-full transition-colors"
                    >
                        Play Test Sound
                    </button>
                    <p className="text-xs text-gray-500 mt-2">This will play a short tone from your speakers.</p>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-4 mb-6">
                    <p className="text-gray-300 font-semibold mb-2">Step 2: Check the monitor below</p>
                    <p className="text-gray-400 text-sm mb-4">When the sound plays, these bars should move. If they don't, check your speaker volume.</p>
                    {/* Fix: Pass the 'translations' prop to RealtimeMonitor to satisfy its prop requirements. */}
                    <RealtimeMonitor audioStream={audioStream} showTranscript={false} translations={translations} />
                </div>

                <div className="flex gap-4">
                    <button onClick={onCancel} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-full transition-colors">
                        Back
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-full transition-colors"
                    >
                        Continue to Session
                    </button>
                </div>
                 <p className="text-xs text-gray-500 mt-4">
                    You can continue without a successful test, but the AI might not work correctly.
                </p>
            </div>
        </div>
    );
};

export default AudioSetupModal;