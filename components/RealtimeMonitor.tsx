import React, { useEffect, useRef } from 'react';
import MicIcon from './icons/MicIcon';
import VolumeUpIcon from './icons/VolumeUpIcon';

interface MicrophoneVisualizerProps {
  audioStream: MediaStream;
}

const MicrophoneVisualizer: React.FC<MicrophoneVisualizerProps> = ({ audioStream }) => {
  const visualizerRef = useRef<HTMLDivElement>(null);
  // Fix: Initialize useRef with a value (null) to satisfy its signature, resolving the "Expected 1 arguments, but got 0" error.
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    if (!audioStream || audioStream.getAudioTracks().length === 0) return;

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) {
      // AudioContext is not supported on this browser, so visualizer will not work.
      return;
    }
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(audioStream);
    source.connect(analyser);

    analyser.fftSize = 32;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const visualizerBars = visualizerRef.current?.children;
    if (!visualizerBars) return;

    const draw = () => {
      animationFrameId.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      let sum = dataArray.reduce((acc, val) => acc + val, 0);
      const average = sum / bufferLength;
      
      const MAX_DB_LEVEL = 140; // Adjusted for typical microphone input levels
      const height = (average / MAX_DB_LEVEL) * 100;

      // Simple 5-bar visualization based on average volume
      const heights = [
        Math.max(2, height * 0.6),
        Math.max(2, height * 0.8),
        Math.max(2, height),
        Math.max(2, height * 0.8),
        Math.max(2, height * 0.6)
      ];

      for (let i = 0; i < visualizerBars.length; i++) {
          (visualizerBars[i] as HTMLElement).style.height = `${Math.min(100, heights[i])}%`;
      }
    };

    draw();

    return () => {
      if(animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      source.disconnect();
      analyser.disconnect();
      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [audioStream]);
  
  return (
    <div ref={visualizerRef} className="flex items-end justify-center gap-1 h-8">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="w-2 bg-cyan-400/50 rounded-full" style={{ height: '2%', transition: 'height 0.1s ease-out' }} />
      ))}
    </div>
  );
};


interface RealtimeMonitorProps {
  audioStream: MediaStream | null;
  finalTranscript?: string;
  interimTranscript?: string;
}

const RealtimeMonitor: React.FC<RealtimeMonitorProps> = ({ audioStream, finalTranscript, interimTranscript }) => {
  return (
    <div className="h-full flex flex-col">
      <h3 className="text-lg font-semibold text-gray-400 mb-3 flex items-center gap-2 flex-shrink-0">
        <MicIcon className="w-5 h-5" />
        Live Monitor
      </h3>
      
      <div className="mb-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="flex items-center justify-between text-sm text-gray-400">
              <span>Microphone Input Level</span>
              <VolumeUpIcon className="w-5 h-5"/>
          </div>
          <div className="mt-2">
              {audioStream ? (
                  <MicrophoneVisualizer audioStream={audioStream} />
              ) : (
                  <div className="text-gray-500 text-xs text-center h-8 flex items-center justify-center">Microphone not active.</div>
              )}
          </div>
           <p className="text-xs text-gray-500 mt-3 text-center">
            If these bars don't move when the interviewer speaks, the app can't hear them. Try using speakers instead of headphones.
          </p>
      </div>
      
      <div className="flex-1 bg-gray-900/50 rounded-lg p-4 overflow-y-auto min-h-0">
        <p className="text-gray-400 font-medium mb-2">Live Transcript</p>
        {finalTranscript || interimTranscript ? (
          <p className="text-gray-200 whitespace-pre-wrap">
            {finalTranscript}
            <span className="text-gray-500">{interimTranscript}</span>
          </p>
        ) : (
          <div className="text-gray-500 h-full flex items-center justify-center">
            <p>Waiting for speech...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RealtimeMonitor;