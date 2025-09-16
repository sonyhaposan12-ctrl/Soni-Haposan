import React from 'react';
import { CompanyBriefing } from '../types';
import LightbulbIcon from './icons/LightbulbIcon';
import SpinnerIcon from './icons/SpinnerIcon';
import ExclamationIcon from './icons/ExclamationIcon';

interface CompanyBriefingModalProps {
    isOpen: boolean;
    onClose: () => void;
    companyName: string;
    briefingData: CompanyBriefing | null;
    isLoading: boolean;
    error: string | null;
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
        return window.marked.parse(text, { breaks: true, gfm: true });
    }
    return text.replace(/\n/g, '<br />');
};

const CompanyBriefingModal: React.FC<CompanyBriefingModalProps> = ({ isOpen, onClose, companyName, briefingData, isLoading, error }) => {
    if (!isOpen) return null;

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <SpinnerIcon className="w-12 h-12" />
                    <p className="mt-4 text-lg">Researching {companyName}...</p>
                    <p className="text-sm text-gray-500">This may take a moment.</p>
                </div>
            );
        }

        if (error) {
            return (
                 <div className="flex flex-col items-center justify-center h-full text-red-300 text-center">
                    <ExclamationIcon className="w-12 h-12 mb-4"/>
                    <h3 className="text-lg font-semibold">Failed to Generate Briefing</h3>
                    <p className="text-sm text-red-400 mt-2">{error}</p>
                </div>
            );
        }

        if (briefingData) {
            return (
                <div>
                    <div className="markdown-content" dangerouslySetInnerHTML={{ __html: parseMarkdown(briefingData.briefing) }} />
                    {briefingData.sources && briefingData.sources.length > 0 && (
                        <div className="mt-6">
                            <h4 className="text-lg font-semibold text-gray-300 border-t border-gray-600 pt-4">Sources</h4>
                            <ul className="list-disc pl-5 mt-2 space-y-1">
                                {briefingData.sources.map((source, index) => (
                                    <li key={index} className="text-sm text-gray-400">
                                        <a 
                                            href={source.uri} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-cyan-400 hover:text-cyan-300 hover:underline truncate"
                                            title={source.uri}
                                        >
                                            {source.title}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            );
        }

        return null;
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="briefing-title"
        >
            <div
                className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl max-w-3xl w-full h-[90vh] flex flex-col text-white"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h2 id="briefing-title" className="text-xl font-bold flex items-center gap-2">
                        <LightbulbIcon className="w-6 h-6 text-cyan-400"/>
                        Company Briefing: {companyName}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700" aria-label="Close briefing">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>
                <div className="p-6 overflow-y-auto flex-1">
                    {renderContent()}
                </div>
                 <footer className="p-4 border-t border-gray-700 text-right flex-shrink-0">
                     <button
                        onClick={onClose}
                        className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-6 rounded-full transition-colors"
                     >
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default CompanyBriefingModal;
