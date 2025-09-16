import React, { useState, useEffect, useRef } from 'react';
import UploadIcon from './icons/UploadIcon';
import HeadsetIcon from './icons/HeadsetIcon';
import ClockIcon from './icons/ClockIcon';
import CogIcon from './icons/CogIcon';
import { AppMode } from '../types';

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
}

const setupTasks = [
    { id: 'task1', text: 'For live calls, join your meeting (Meet, Zoom, Teams)' },
    { id: 'task2', text: 'Use headphones to prevent audio echo' },
    { id: 'task3', text: 'Ensure your mic is set up correctly' },
];

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart, onShowHistory, onOpenSettings, hasHistory }) => {
    const [jobTitle, setJobTitle] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [cvContent, setCvContent] = useState('');
    const [cvFileName, setCvFileName] = useState('');
    const [isParsingCv, setIsParsingCv] = useState(false);
    const [jobTitleError, setJobTitleError] = useState('');
    const [companyNameError, setCompanyNameError] = useState('');
    const [cvError, setCvError] = useState('');
    const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const MAX_JOB_TITLE_LENGTH = 100;
    const MAX_COMPANY_NAME_LENGTH = 100;
    const MAX_CV_SIZE_MB = 5;
    const MAX_CV_SIZE_BYTES = MAX_CV_SIZE_MB * 1024 * 1024;

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
            setCvError(`File is too large. Please upload a CV smaller than ${MAX_CV_SIZE_MB}MB.`);
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
                setCvError('PDF reader failed to load. You can still use .txt files or refresh the page.');
                return;
            }

            setIsParsingCv(true);
            setCvFileName(`Parsing ${file.name}...`);
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                if (!arrayBuffer) {
                    setCvError('Could not read the PDF file.');
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
                    let message = 'Failed to parse the PDF.';
                    if (error.name === 'PasswordException') {
                        message = 'This PDF is password-protected and cannot be read.';
                    } else if (error.name === 'InvalidPDFException') {
                        message = 'This file does not appear to be a valid PDF.';
                    }
                    setCvError(message);
                    setCvFileName('');
                } finally {
                    setIsParsingCv(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            setCvError('Unsupported file type. Please upload a .txt or .pdf file.');
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
            setJobTitleError("Please enter the position you're applying for.");
            isValid = false;
        } else if (trimmedJobTitle.length > MAX_JOB_TITLE_LENGTH) {
            setJobTitleError(`Job title must be ${MAX_JOB_TITLE_LENGTH} characters or less.`);
            isValid = false;
        }

        if (trimmedCompanyName.length > MAX_COMPANY_NAME_LENGTH) {
            setCompanyNameError(`Company name must be ${MAX_COMPANY_NAME_LENGTH} characters or less.`);
            isValid = false;
        }

        if (isParsingCv) isValid = false;

        if (isValid) onStart(mode, trimmedJobTitle, trimmedCompanyName, cvContent);
    };

    const uploadLabelText = isParsingCv 
        ? 'Processing PDF...' 
        : cvFileName 
        ? `${cvFileName} (Loaded)` 
        : 'Upload CV (Optional, .txt or .pdf)';
    
    const isStartDisabled = !jobTitle.trim() || isParsingCv;

    return (
        <div className="flex flex-col items-center justify-center h-full text-center text-white p-8 overflow-y-auto relative">
             <button
                onClick={onOpenSettings}
                className="absolute top-4 right-4 p-3 rounded-full text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
                aria-label="Open settings"
            >
                <CogIcon className="w-6 h-6" />
            </button>
            <div className="bg-white/10 p-6 rounded-full mb-6 backdrop-blur-sm">
                <HeadsetIcon className="w-20 h-20 text-cyan-300" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">AI Interview Copilot</h1>
            <p className="max-w-2xl text-lg text-gray-300 mb-8">
                Your AI-powered assistant for job interviews. Choose between live assistance or a practice session to get started.
            </p>

            <div className="w-full max-w-md space-y-4">
                <div>
                    <label htmlFor="job-title" className="sr-only">Position you're applying for</label>
                    <input 
                        type="text"
                        id="job-title"
                        value={jobTitle}
                        onChange={handleJobTitleChange}
                        maxLength={MAX_JOB_TITLE_LENGTH}
                        placeholder="Position you're applying for (e.g., Senior Frontend Engineer)"
                        className={`w-full bg-gray-700/50 border text-white placeholder-gray-400 text-center text-lg rounded-full py-3 px-6 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none transition ${jobTitleError ? 'border-red-500 ring-red-500/50' : 'border-gray-600'}`}
                        aria-invalid={!!jobTitleError}
                        aria-describedby="job-title-error"
                    />
                    {jobTitleError && <p id="job-title-error" className="text-red-400 text-sm mt-2">{jobTitleError}</p>}
                </div>
                <div>
                    <label htmlFor="company-name" className="sr-only">Company Name (Optional)</label>
                    <input
                        type="text"
                        id="company-name"
                        value={companyName}
                        onChange={handleCompanyNameChange}
                        maxLength={MAX_COMPANY_NAME_LENGTH}
                        placeholder="Company Name (Optional)"
                        className={`w-full bg-gray-700/50 border text-white placeholder-gray-400 text-center text-lg rounded-full py-3 px-6 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none transition ${companyNameError ? 'border-red-500 ring-red-500/50' : 'border-gray-600'}`}
                        aria-invalid={!!companyNameError}
                        aria-describedby="company-name-error"
                    />
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
                            aria-label="Clear saved CV"
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

            <div className="w-full max-w-md mt-8 text-left animate-fade-in">
                <h2 className="text-lg font-semibold text-gray-200 mb-3">Pre-session Checklist</h2>
                <div className="space-y-2">
                    {setupTasks.map(task => (
                        <label key={task.id} htmlFor={task.id} className="flex items-center space-x-3 cursor-pointer p-2 rounded-md hover:bg-white/10 transition-colors">
                            <input
                                id={task.id}
                                type="checkbox"
                                checked={completedTasks.has(task.id)}
                                onChange={() => handleToggleTask(task.id)}
                                className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-cyan-400 focus:ring-cyan-500"
                            />
                            <span className={`text-gray-300 transition-all ${completedTasks.has(task.id) ? 'line-through text-gray-500' : ''}`}>
                                {task.text}
                            </span>
                        </label>
                    ))}
                </div>
            </div>
          
             <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <button
                    onClick={() => validateAndStart('copilot')}
                    disabled={isStartDisabled}
                    className="bg-cyan-400 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 font-bold py-3 px-8 rounded-full text-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-cyan-500/20"
                >
                    Start Live Assistance
                </button>
                 <button
                    onClick={() => validateAndStart('practice')}
                    disabled={isStartDisabled}
                    className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-8 rounded-full text-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-indigo-500/20"
                >
                    Start Practice Session
                </button>
            </div>
            
            {hasHistory && (
                 <button
                    onClick={onShowHistory}
                    className="mt-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors animate-fade-in"
                 >
                    <ClockIcon className="w-5 h-5" />
                    <span>View Session History</span>
                </button>
            )}

            <div className="mt-auto pt-4 text-center">
                <p className="text-sm text-gray-400">
                    Make sure to allow microphone access when prompted.
                </p>
                <p className="text-xs text-gray-500 mt-2">
                    &copy; {new Date().getFullYear()} PT Josera Global IT Solusindo. All rights reserved.
                </p>
            </div>
        </div>
    );
};

export default WelcomeScreen;