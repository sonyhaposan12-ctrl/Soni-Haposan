import React, { useState, useEffect } from 'react';
import SpeakerOnIcon from './icons/SpeakerOnIcon';
import SpeakerOffIcon from './icons/SpeakerOffIcon';
import PlayIcon from './icons/PlayIcon';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isTtsEnabled: boolean;
  onTtsToggle: (enabled: boolean) => void;
  recognitionLang: string;
  onRecognitionLangChange: (lang: string) => void;
  ttsVoiceURI: string | null;
  onTtsVoiceURIChange: (uri: string) => void;
}

const supportedLanguages = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'es-MX', label: 'Español (México)' },
  { value: 'fr-FR', label: 'Français (France)' },
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
  { value: 'it-IT', label: 'Italiano (Italia)' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'ja-JP', label: '日本語 (日本)' },
  { value: 'ko-KR', label: '한국어 (대한민국)' },
  { value: 'zh-CN', label: '中文 (大陆)' },
];

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  isTtsEnabled,
  onTtsToggle,
  recognitionLang,
  onRecognitionLangChange,
  ttsVoiceURI,
  onTtsVoiceURIChange,
}) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        setVoices(availableVoices);
      }
    };

    // Voices may load asynchronously.
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isOpen]);
  
  const handleTtsToggle = () => {
      onTtsToggle(!isTtsEnabled);
  }

  const handlePreviewVoice = () => {
    if (!ttsVoiceURI || !window.speechSynthesis) return;

    window.speechSynthesis.cancel(); // Stop any current speech

    const sampleText = "Hello, this is a preview of the selected voice.";
    const utterance = new SpeechSynthesisUtterance(sampleText);
    const selectedVoice = voices.find(voice => voice.voiceURI === ttsVoiceURI);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      window.speechSynthesis.speak(utterance);
    }
  };


  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl max-w-lg w-full text-white flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center p-6 border-b border-gray-700 flex-shrink-0">
          <h2 id="settings-title" className="text-2xl font-bold text-white">Settings</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700" aria-label="Close settings">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <main className="p-6 space-y-6 overflow-y-auto">
          {/* Recognition Language */}
          <div>
            <label htmlFor="recognition-lang" className="block text-sm font-medium text-gray-300 mb-2">
              Speech Recognition Language
            </label>
            <select
              id="recognition-lang"
              value={recognitionLang}
              onChange={(e) => onRecognitionLangChange(e.target.value)}
              className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none transition"
            >
              {supportedLanguages.map(lang => (
                <option key={lang.value} value={lang.value}>{lang.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Select the language you will be speaking for the most accurate transcription.</p>
          </div>

          {/* TTS Voice */}
          <div>
            <label htmlFor="tts-voice" className="block text-sm font-medium text-gray-300 mb-2">
              AI Voice (Text-to-Speech)
            </label>
            <div className="flex items-center gap-2">
              <select
                id="tts-voice"
                value={ttsVoiceURI || ''}
                onChange={(e) => onTtsVoiceURIChange(e.target.value)}
                disabled={voices.length === 0}
                className="flex-grow w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none transition disabled:opacity-50"
              >
                {voices.length > 0 ? (
                  voices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {`${voice.name} (${voice.lang})`}
                    </option>
                  ))
                ) : (
                  <option>Loading voices...</option>
                )}
              </select>
              <button
                onClick={handlePreviewVoice}
                disabled={!ttsVoiceURI || voices.length === 0}
                className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                aria-label="Preview selected voice"
                title="Preview voice"
              >
                <PlayIcon className="w-5 h-5 text-white" />
              </button>
            </div>
             <p className="text-xs text-gray-500 mt-1">Choose the voice for AI audio feedback. Options are based on your browser and OS.</p>
          </div>

          {/* TTS Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Audio Feedback
            </label>
            <button
                onClick={handleTtsToggle}
                className={`w-full flex items-center justify-center gap-3 py-2 px-4 rounded-md transition-colors ${isTtsEnabled ? 'bg-cyan-500/20 text-cyan-300' : 'bg-gray-700 hover:bg-gray-600'}`}
                role="switch"
                aria-checked={isTtsEnabled}
            >
                {isTtsEnabled ? <SpeakerOnIcon className="w-5 h-5" /> : <SpeakerOffIcon className="w-5 h-5" />}
                <span>{isTtsEnabled ? 'Enabled' : 'Disabled'}</span>
            </button>
          </div>
        </main>

        <footer className="p-6 text-right border-t border-gray-700 flex-shrink-0 mt-auto">
          <button
            onClick={onClose}
            className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-6 rounded-full transition-colors"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};

export default SettingsPanel;