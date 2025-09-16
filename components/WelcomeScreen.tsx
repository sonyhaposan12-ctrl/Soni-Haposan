import React, { useState, useEffect, useRef } from 'react';
import UploadIcon from './icons/UploadIcon';
import LogoIcon from './icons/LogoIcon';
import ClockIcon from './icons/ClockIcon';
import CogIcon from './icons/CogIcon';
import LightbulbIcon from './icons/LightbulbIcon';
import SpinnerIcon from './icons/SpinnerIcon';
import CompanyBriefingModal from './CompanyBriefingModal';
import { AppMode, CompanyBriefing } from '../types';
import { getCompanyBriefing } from '../services/geminiService';
import { Language } from '../App';
import { T } from '../translations';


// Extend the global Window interface for TypeScript to recognize pdfjsLib
declare global {
    interface Window {
        pdfjsLib: any;
    }
}

interface WelcomeScreenProps {
  onStart: (mode: AppMode, jobTitle: string, companyName: string, cvContent: string) => void;
  onShowHistory: () => void;
  onOpenSettings: () => void;
  hasHistory: boolean;
  translations: typeof T['en'];
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart, onShowHistory, onOpenSettings, hasHistory, translations }) => {
    const [jobTitle, setJobTitle] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [cvContent, setCvContent] = useState('');
    const [cvFileName, setCvFileName] = useState('');
    const [isParsingCv, setIsParsingCv] = useState(false);
    const [jobTitleError, setJobTitleError] = useState('');
    const [companyNameError, setCompanyNameError] = useState('');
    const [cvError, setCvError] = useState('');
    const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
    const [isBriefingOpen, setIsBriefingOpen] = useState(false);
    const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
    const [briefingData, setBriefingData] = useState<CompanyBriefing | null>(null);
    const [briefingError, setBriefingError] = useState<string | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const MAX_JOB_TITLE_LENGTH = 100;
    const MAX_COMPANY_NAME_LENGTH = 100;
    const MAX_CV_SIZE_MB = 5;
    const MAX_CV_SIZE_BYTES = MAX_CV_SIZE_MB * 1024 * 1024;
    
    const setupTasks = [
        { id: 'task1', text: translations.checklist1 },
        { id: 'task2', text: translations.checklist2 },
        { id: 'task3', text: translations.checklist3 },
    ];

    useEffect(() => {
        // Load saved CV from localStorage on initial render
        const savedCv = localStorage.getItem('savedCvContent');
        const savedCvName = localStorage.getItem('savedCvFileName');
        if (savedCv && savedCvName) {
            setCvContent(savedCv);
            setCvFileName(savedCvName);
        }

        // Load completed tasks
        const savedTasks = localStorage.getItem('completedCopilotTasks');
        if (savedTasks) {
            setCompletedTasks(new Set(JSON.parse(savedTasks)));
        }

        // Configure pdfjs worker
        const pdfjsLib = window.pdfjsLib;
        if (pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
        }
    }, []);

    const handleToggleTask = (taskId: string) => {
        setCompletedTasks(prev => {
            const newTasks = new Set(prev);
            if (newTasks.has(taskId)) {
                newTasks.delete(taskId);
            } else {
                newTasks.add(taskId);
            }
            localStorage.setItem('completedCopilotTasks', JSON.stringify(Array.from(newTasks)));
            return newTasks;
        });
    };

    const handleCvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        handleClearCv(false); 

        if (file.size > MAX_CV_SIZE_BYTES) {
            setCvError(translations.errorCvSize(MAX_CV_SIZE_MB));
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        
        const saveCv = (name: string, content: string) => {
            setCvContent(content);
            setCvFileName(name);
            localStorage.setItem('savedCvContent', content);
            localStorage.setItem('savedCvFileName', name);
        };

        if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                saveCv(file.name, text);
            };
            reader.readAsText(file);
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const pdfjsLib = window.pdfjsLib;
            if (!pdfjsLib) {
                setCvError(translations.errorPdfReader);
                return;
            }

            setIsParsingCv(true);
            setCvFileName(translations.parsingCv(file.name));
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                if (!arrayBuffer) {
                    setCvError(translations.errorPdfRead);
                    setIsParsingCv(false);
                    return;
                }

                try {
                    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                    let fullText = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n\n';
                    }
                    saveCv(file.name, fullText.trim());
                } catch (error: any) {
                    console.error('Error parsing PDF:', error);
                    let message = translations.errorPdfParse;
                    if (error.name === 'PasswordException') {
                        message = translations.errorPdfPassword;
                    } else if (error.name === 'InvalidPDFException') {
                        message = translations.errorPdfInvalid;
                    }
                    setCvError(message);
                    setCvFileName('');
                } finally {
                    setIsParsingCv(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            setCvError(translations.errorCvType);
        }
    };
    
    const handleClearCv = (resetInput = true) => {
        localStorage.removeItem('savedCvContent');
        localStorage.removeItem('savedCvFileName');
        setCvContent('');
        setCvFileName('');
        setCvError('');
        if (resetInput && fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleJobTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (jobTitleError) setJobTitleError('');
        setJobTitle(e.target.value);
    };

    const handleCompanyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (companyNameError) setCompanyNameError('');
        setCompanyName(e.target.value);
    };

    const validateAndStart = (mode: AppMode) => {
        let isValid = true;
        const trimmedJobTitle = jobTitle.trim();
        const trimmedCompanyName = companyName.trim();

        if (!trimmedJobTitle) {
            setJobTitleError(translations.errorJobTitleEmpty);
            isValid = false;
        } else if (trimmedJobTitle.length > MAX_JOB_TITLE_LENGTH) {
            setJobTitleError(translations.errorJobTitleLength(MAX_JOB_TITLE_LENGTH));
            isValid = false;
        }

        if (trimmedCompanyName.length > MAX_COMPANY_NAME_LENGTH) {
            setCompanyNameError(translations.errorCompanyNameLength(MAX_COMPANY_NAME_LENGTH));
            isValid = false;
        }

        if (isParsingCv) isValid = false;

        if (isValid) onStart(mode, trimmedJobTitle, trimmedCompanyName, cvContent);
    };
    
    const handleGenerateBriefing = async () => {
        const trimmedCompanyName = companyName.trim();
        if (!trimmedCompanyName) return;
        
        setIsGeneratingBriefing(true);
        setBriefingError(null);
        setBriefingData(null);
        setIsBriefingOpen(true);
        
        const currentLang = (localStorage.getItem('language') as Language) || 'en';
        const result = await getCompanyBriefing(trimmedCompanyName, currentLang);

        if (result.briefing.toLowerCase().startsWith('error:') || result.briefing.toLowerCase().startsWith('kesalahan:')) {
            setBriefingError(result.briefing);
        } else {
            setBriefingData(result);
        }
        
        setIsGeneratingBriefing(false);
    }

    const uploadLabelText = isParsingCv 
        ? translations.processingPdf
        : cvFileName 
        ? `${cvFileName} (${translations.loaded})` 
        : translations.uploadCv;
    
    const isStartDisabled = !jobTitle.trim() || isParsingCv;

    return (
        <>
        <CompanyBriefingModal 
            translations={translations}
            isOpen={isBriefingOpen}
            onClose={() => setIsBriefingOpen(false)}
            companyName={companyName}
            briefingData={briefingData}
            isLoading={isGeneratingBriefing}
            error={briefingError}
        />
        <div className="flex flex-col items-center justify-center h-full text-center text-white p-8 overflow-y-auto relative">
             <button
                onClick={onOpenSettings}
                className="absolute top-4 right-4 p-3 rounded-full text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
                aria-label={translations.openSettings}
            >
                <CogIcon className="w-6 h-6" />
            </button>
            <div className="mb-6">
                <LogoIcon className="w-28 h-28" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">{translations.welcomeTitle}</h1>
            <p className="max-w-2xl text-lg text-gray-300 mb-8">
                {translations.welcomeDescription}
            </p>

            <div className="w-full max-w-md space-y-8 animate-fade-in">
                {/* Input Fields Section */}
                <div className="space-y-4">
                    <div>
                        <label htmlFor="job-title" className="sr-only">{translations.positionLabel}</label>
                        <input 
                            type="text"
                            id="job-title"
                            value={jobTitle}
                            onChange={handleJobTitleChange}
                            maxLength={MAX_JOB_TITLE_LENGTH}
                            placeholder={translations.positionPlaceholder}
                            className={`w-full bg-gray-700/50 border text-white placeholder-gray-400 text-center text-lg rounded-full py-3 px-6 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none transition ${jobTitleError ? 'border-red-500 ring-red-500/50' : 'border-gray-600'}`}
                            aria-invalid={!!jobTitleError}
                            aria-describedby="job-title-error"
                        />
                        {jobTitleError && <p id="job-title-error" className="text-red-400 text-sm mt-2">{jobTitleError}</p>}
                    </div>
                    <div className="relative">
                        <label htmlFor="company-name" className="sr-only">{translations.companyLabel}</label>
                        <input
                            type="text"
                            id="company-name"
                            value={companyName}
                            onChange={handleCompanyNameChange}
                            maxLength={MAX_COMPANY_NAME_LENGTH}
                            placeholder={translations.companyPlaceholder}
                            className={`w-full bg-gray-700/50 border text-white placeholder-gray-400 text-center text-lg rounded-full py-3 px-14 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none transition ${companyNameError ? 'border-red-500 ring-red-500/50' : 'border-gray-600'}`}
                            aria-invalid={!!companyNameError}
                            aria-describedby="company-name-error"
                        />
                         <button
                            onClick={handleGenerateBriefing}
                            disabled={!companyName.trim() || isGeneratingBriefing}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-gray-400 hover:text-cyan-300 hover:bg-gray-600/50 disabled:cursor-not-allowed disabled:text-gray-600 transition-colors"
                            aria-label={translations.generateBriefing}
                            title={translations.generateBriefing}
                        >
                            {isGeneratingBriefing ? <SpinnerIcon className="w-5 h-5" /> : <LightbulbIcon className="w-5 h-5" />}
                        </button>
                        {companyNameError && <p id="company-name-error" className="text-red-400 text-sm mt-2">{companyNameError}</p>}
                    </div>
                    <div className="pt-2 relative">
                         <label htmlFor="cv-upload" className={`w-full cursor-pointer bg-gray-700/50 border hover:border-cyan-400 text-gray-300 hover:text-white rounded-full py-3 pl-6 pr-10 flex items-center justify-center space-x-2 transition ${isParsingCv ? 'opacity-50 cursor-wait' : ''} ${cvError ? 'border-red-500' : 'border-gray-600'} ${cvContent ? 'border-cyan-500' : ''}`}>
                            <UploadIcon className="w-6 h-6 flex-shrink-0" />
                            <span className="truncate">{uploadLabelText}</span>
                        </label>
                        {cvContent && !isParsingCv && (
                            <button 
                                onClick={() => handleClearCv()} 
                                className="absolute right-2 top-1/2 -translate-y-1/2 mt-1 bg-gray-600 hover:bg-red-500 text-white rounded-full p-1.5 transition-colors"
                                aria-label={translations.clearCv}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                        <input 
                            ref={fileInputRef}
                            id="cv-upload"
                            type="file"
                            accept=".txt,.pdf"
                            onChange={handleCvUpload}
                            className="hidden"
                            disabled={isParsingCv}
                            aria-describedby="cv-error"
                        />
                        {cvError && <p id="cv-error" className="text-red-400 text-sm mt-2">{cvError}</p>}
                    </div>
                </div>

                {/* Checklist Section */}
                <div className="text-left">
                    <h2 className="text-lg font-semibold text-gray-200 mb-4 text-center">{translations.preSessionChecklist}</h2>
                     <div className="rounded-lg bg-gray-900/50 border border-gray-700 overflow-hidden">
                        <div className="divide-y divide-gray-700/50">
                            {setupTasks.map(task => (
                                <label key={task.id} htmlFor={task.id} className="flex items-start space-x-3 cursor-pointer p-4 hover:bg-white/5 transition-colors">
                                    <input
                                        id={task.id}
                                        type="checkbox"
                                        checked={completedTasks.has(task.id)}
                                        onChange={() => handleToggleTask(task.id)}
                                        className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-cyan-400 focus:ring-cyan-500 flex-shrink-0 mt-0.5"
                                    />
                                    <span className={`text-gray-300 transition-all ${completedTasks.has(task.id) ? 'line-through text-gray-500' : ''}`}>
                                        {task.text}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
          
             <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <button
                    onClick={() => validateAndStart('copilot')}
                    disabled={isStartDisabled}
                    className="bg-cyan-400 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 font-bold py-3 px-8 rounded-full text-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-cyan-500/20"
                >
                    {translations.startLiveAssistance}
                </button>
                 <button
                    onClick={() => validateAndStart('practice')}
                    disabled={isStartDisabled}
                    className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-8 rounded-full text-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-indigo-500/20"
                >
                    {translations.startPracticeSession}
                </button>
            </div>
            
            {hasHistory && (
                 <button
                    onClick={onShowHistory}
                    className="mt-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors animate-fade-in"
                 >
                    <ClockIcon className="w-5 h-5" />
                    <span>{translations.viewHistory}</span>
                </button>
            )}

            <div className="mt-auto pt-4 text-center">
                <p className="text-sm text-gray-400">
                    {translations.micPermissionPrompt}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                    &copy; {new Date().getFullYear()} PT Josera Global IT Solusindo. All rights reserved.
                </p>
            </div>
        </div>
        </>
    );
};

export default WelcomeScreen;