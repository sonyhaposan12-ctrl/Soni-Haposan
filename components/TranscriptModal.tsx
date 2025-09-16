import React, { useState, useCallback, useMemo } from 'react';
import { ConversationItem, AppMode, Role } from '../types';
import ClipboardIcon from './icons/ClipboardIcon';
import DownloadIcon from './icons/DownloadIcon';
import DocumentTextIcon from './icons/DocumentTextIcon';
import { T } from '../translations';

interface TranscriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: ConversationItem[];
  jobTitle: string;
  companyName: string;
  appMode: AppMode;
  sessionDate: string;
  translations: typeof T['en'];
}

const stripMarkdown = (text: string = ''): string => {
    return text
        .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold
        .replace(/(\*|_)(.*?)\1/g, '$2')   // Italic
        .replace(/^[#\s]*/gm, '')         // Headers
        .replace(/^\s*-\s/gm, '• ')        // List items
        .replace(/`([^`]+)`/g, '$1');      // Inline code
};

const TranscriptModal: React.FC<TranscriptModalProps> = ({ isOpen, onClose, conversation, jobTitle, companyName, appMode, sessionDate, translations }) => {
    const [copyButtonText, setCopyButtonText] = useState(translations.copy);

    const transcriptText = useMemo(() => {
        let transcript = `${translations.interviewTranscript}\n`;
        transcript += `====================\n`;
        transcript += `${translations.jobTitle}: ${jobTitle}\n`;
        if (companyName) transcript += `${translations.company}: ${companyName}\n`;
        transcript += `${translations.mode}: ${appMode === 'practice' ? translations.practice : translations.copilot}\n`;
        transcript += `${translations.date}: ${sessionDate}\n`;
        transcript += `====================\n\n`;
    
        conversation.forEach(item => {
            if (appMode === 'practice') {
                if (item.role === Role.MODEL) {
                    if (item.feedback) {
                        transcript += `${translations.aiFeedback} (${translations.rating}: ${item.rating || 'N/A'}):\n${stripMarkdown(item.feedback)}\n\n`;
                    }
                    transcript += `${translations.roleAiInterviewer}:\n${stripMarkdown(item.text)}\n\n`;
                } else {
                    transcript += `${translations.roleYou}:\n${stripMarkdown(item.text)}\n\n`;
                }
            } else { // copilot mode
                if (item.role === Role.MODEL) {
                    transcript += `${translations.roleInterviewerQuestion}:\n${stripMarkdown(item.text)}\n\n`;
                } else {
                    const label = item.type === 'exampleAnswer' ? translations.roleAiExample : translations.roleAiSuggestion;
                    transcript += `${label}:\n${stripMarkdown(item.text)}\n\n`;
                }
            }
        });
        return transcript.trim();
    }, [conversation, jobTitle, companyName, appMode, sessionDate, translations]);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(transcriptText).then(() => {
            setCopyButtonText(translations.copied);
            setTimeout(() => setCopyButtonText(translations.copy), 2000);
        });
    }, [transcriptText, translations]);

    const handleDownload = useCallback(() => {
        const blob = new Blob([transcriptText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeFilename = `${jobTitle.replace(/[^a-z0-9]/gi, '_')}_interview_transcript.txt`;
        a.download = safeFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [transcriptText, jobTitle]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="transcript-title"
        >
            <div
                className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl max-w-3xl w-full h-[90vh] flex flex-col text-white"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h2 id="transcript-title" className="text-xl font-bold flex items-center gap-2">
                        <DocumentTextIcon className="w-6 h-6 text-cyan-400"/>
                        {translations.interviewTranscript}
                    </h2>
                    <div className="flex items-center gap-2">
                         <button onClick={handleCopy} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-full transition-colors text-sm">
                            <ClipboardIcon className="w-4 h-4" />
                            <span>{copyButtonText}</span>
                        </button>
                        <button onClick={handleDownload} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-full transition-colors text-sm">
                            <DownloadIcon className="w-4 h-4" />
                            <span>{translations.download}</span>
                        </button>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700" aria-label={translations.closeTranscript}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </header>
                <div className="p-6 overflow-y-auto flex-1">
                    <pre className="text-gray-300 whitespace-pre-wrap font-mono text-sm">{transcriptText}</pre>
                </div>
            </div>
        </div>
    );
};

export default TranscriptModal;