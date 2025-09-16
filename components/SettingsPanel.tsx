import React from 'react';
import { Language } from '../App';
import { T } from '../translations';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  recognitionLang: string;
  onRecognitionLangChange: (lang: string) => void;
  isAutoTriggerEnabled: boolean;
  onIsAutoTriggerEnabledChange: (enabled: boolean) => void;
  translations: typeof T['en'];
}

const supportedLanguages = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'id-ID', label: 'Bahasa Indonesia' },
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
  language,
  onLanguageChange,
  recognitionLang,
  onRecognitionLangChange,
  isAutoTriggerEnabled,
  onIsAutoTriggerEnabledChange,
  translations,
}) => {
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
          <h2 id="settings-title" className="text-2xl font-bold text-white">{translations.settingsTitle}</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700" aria-label={translations.closeSettings}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <main className="p-6 space-y-6 overflow-y-auto">
           {/* App Language */}
          <div>
            <label htmlFor="app-lang" className="block text-sm font-medium text-gray-300 mb-2">
              {translations.appLanguage}
            </label>
            <select
              id="app-lang"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value as Language)}
              className="w-full bg-gray-700/50 border border-gray-600 rounded-md py-2 px-3 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none transition"
            >
              <option value="en">English</option>
              <option value="id">Bahasa Indonesia</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">{translations.appLanguageDescription}</p>
          </div>

          {/* Recognition Language */}
          <div>
            <label htmlFor="recognition-lang" className="block text-sm font-medium text-gray-300 mb-2">
              {translations.recognitionLanguage}
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
            <p className="text-xs text-gray-500 mt-1">{translations.recognitionLanguageDescription}</p>
          </div>

          {/* Auto-trigger setting */}
          <div>
              <label className="flex items-center justify-between cursor-pointer">
                  <span className="flex flex-col">
                      <span className="text-sm font-medium text-gray-300">{translations.autoSuggestTitle}</span>
                      <span className="text-xs text-gray-500">{translations.autoSuggestDescription}</span>
                  </span>
                  <div className="relative inline-flex items-center cursor-pointer">
                      <input
                          type="checkbox"
                          checked={isAutoTriggerEnabled}
                          onChange={(e) => onIsAutoTriggerEnabledChange(e.target.checked)}
                          className="sr-only peer"
                          id="auto-trigger-toggle"
                      />
                      <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-cyan-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </div>
              </label>
          </div>

        </main>

        <footer className="p-6 text-right border-t border-gray-700 flex-shrink-0 mt-auto">
          <button
            onClick={onClose}
            className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-6 rounded-full transition-colors"
          >
            {translations.done}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default SettingsPanel;