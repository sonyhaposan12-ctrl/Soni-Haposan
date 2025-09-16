import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ConversationItem, Role, AppMode, AppState, SavedSession } from './types';
import { 
    startCopilotSession, 
    getCopilotResponse,
    getInterviewSummary,
    startPracticeSession,
    getPracticeResponse
} from './services/geminiService';
import { getSessions, saveSession, clearSessions } from './services/storageService';
import type { CopilotSuggestions } from './services/geminiService';
import type { Chat } from '@google/genai';
import WelcomeScreen from './components/WelcomeScreen';
import Conversation from './components/Conversation';
import Feedback from './components/Feedback';
import Controls from './components/Controls';
import SummaryScreen from './components/SummaryScreen';
import HistoryScreen from './components/HistoryScreen';
import ErrorDisplay from './components/ErrorDisplay';

// Fix: Add types for the Web Speech API to resolve TypeScript errors.
interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: () => void;
    onend: () => void;
    onerror: (event: any) => void;
    onresult: (event: any) => void;
    start: () => void;
    stop: () => void;
}

declare global {
    interface Window {
        webkitSpeechRecognition: {
            new(): SpeechRecognition;
        };
    }
}

type PracticeState = 'asking' | 'answering' | 'feedback';

const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>('welcome');
    const [appMode, setAppMode] = useState<AppMode>('copilot');
    const [jobTitle, setJobTitle] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [companyValues, setCompanyValues] = useState('');
    const [conversation, setConversation] = useState<ConversationItem[]>([]);
    const [summaryReport, setSummaryReport] = useState<string | null>(null);
    const [sessions, setSessions] = useState<SavedSession[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isTtsEnabled, setIsTtsEnabled] = useState<boolean>(() => {
        const saved = localStorage.getItem('isTtsEnabled');
        return saved !== null ? JSON.parse(saved) : true; // Default to on
    });
    const [elapsedTime, setElapsedTime] = useState(0);
    const [appError, setAppError] = useState<string | null>(null);

    // Copilot State
    const [feedbackContent, setFeedbackContent] = useState<string | null>(null);
    const [feedbackTitle, setFeedbackTitle] = useState<string>('AI Talking Points');
    const [activeQuestion, setActiveQuestion] = useState('');
    const [copilotCache, setCopilotCache] = useState<(CopilotSuggestions & { question: string }) | null>(null);
    
    // Practice State
    const [practiceState, setPracticeState] = useState<PracticeState>('asking');
    const [isListening, setIsListening] = useState(false);

    // Shared State
    const [transcript, setTranscript] = useState('');
    const [finalTranscript, setFinalTranscript] = useState('');

    const chatRef = useRef<Chat | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const timerIntervalRef = useRef<number | null>(null);
    const isSessionActiveRef = useRef<boolean>(false);
    const debounceTimerRef = useRef<number | null>(null);

     useEffect(() => {
        setSessions(getSessions());
    }, []);

    const speakText = useCallback((text: string) => {
        if (isTtsEnabled && text && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(utterance);
        }
    }, [isTtsEnabled]);

    useEffect(() => {
        localStorage.setItem('isTtsEnabled', JSON.stringify(isTtsEnabled));
    }, [isTtsEnabled]);

    useEffect(() => {
        if (appMode === 'practice') {
            const lastMessage = conversation[conversation.length - 1];
            if (lastMessage?.role === Role.MODEL && lastMessage.feedback) {
                speakText(lastMessage.feedback);
            }
        }
    }, [conversation, appMode, speakText]);

    const processCopilotRequest = useCallback(async (type: 'talkingPoints' | 'exampleAnswer') => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        const question = finalTranscript.trim() || activeQuestion;
        if (!question || !chatRef.current) return;

        setAppError(null);
        setActiveQuestion(question);
        setFeedbackTitle(type === 'talkingPoints' ? 'AI Talking Points' : 'AI Example Answer');

        if (copilotCache && copilotCache.question === question) {
            const content = type === 'talkingPoints' ? copilotCache.talkingPoints : copilotCache.exampleAnswer;
            setFeedbackContent(content);
            const lastItem = conversation[conversation.length - 1];
            if (lastItem?.type !== type || lastItem?.text !== content) {
                 setConversation(prev => [...prev, { role: Role.USER, text: content, type: type }]);
            }
            return;
        }

        // Do not stop recognition here; let it run continuously.
        setIsProcessing(true);
        setFeedbackContent(null);
        
        const isNewQuestion = !conversation.some(item => item.role === Role.MODEL && item.text === question);
        if (isNewQuestion) {
             setConversation(prev => [...prev, { role: Role.MODEL, text: question }]);
        }
        
        const response = await getCopilotResponse(chatRef.current, question);
        setCopilotCache({ ...response, question: question });
        
        const content = type === 'talkingPoints' ? response.talkingPoints : response.exampleAnswer;
        setFeedbackContent(content);
        setConversation(prev => [...prev, { role: Role.USER, text: content, type: type }]);
        
        setIsProcessing(false);
        setTranscript('');
        setFinalTranscript('');
    }, [finalTranscript, activeQuestion, copilotCache, conversation]);

    const handleAutoGenerateSuggestion = useCallback(() => {
        processCopilotRequest('talkingPoints');
    }, [processCopilotRequest]);

    const setupSpeechRecognition = useCallback((mode: AppMode) => {
        if (!('webkitSpeechRecognition' in window)) {
            setAppError("Speech recognition is not supported by your browser. Please use Google Chrome.");
            return;
        }
        if (recognitionRef.current) recognitionRef.current.stop();

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = mode === 'copilot';
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => {
            setIsListening(false);
            if (isSessionActiveRef.current && appMode === 'copilot') {
                recognitionRef.current?.start(); // Auto-restart if it stops unexpectedly
            }
        };
        recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                setAppError("Microphone access denied. To fix this, go to your browser's site settings, allow microphone access for this page, and then refresh.");
                isSessionActiveRef.current = false;
            } else if (event.error === 'no-speech') {
                setAppError("No sound detected. Please ensure your microphone is unmuted and connected, then try speaking again. You may need to check your system's audio settings.");
            } else if (event.error !== 'aborted') {
                setAppError("An error occurred with speech recognition. Please try again.");
            }
        };
        
        recognition.onresult = (event) => {
            let interimTranscript = '';
            let latestFinalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcriptChunk = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    latestFinalTranscript += transcriptChunk + ' ';
                } else {
                    interimTranscript += transcriptChunk;
                }
            }

            setTranscript(interimTranscript);

            if (latestFinalTranscript) {
                const newFinalTranscript = (finalTranscript + ' ' + latestFinalTranscript).trim();
                setFinalTranscript(newFinalTranscript);

                if (appMode === 'copilot') {
                    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                    debounceTimerRef.current = window.setTimeout(handleAutoGenerateSuggestion, 1500);
                }
            }
        };
        
        recognitionRef.current = recognition;
    }, [finalTranscript, appMode, handleAutoGenerateSuggestion]);

    const handleStartSession = useCallback(async (mode: AppMode, title: string, company: string, cvContent: string, values: string) => {
        setAppError(null);
        setAppMode(mode);
        setJobTitle(title);
        setCompanyName(company);
        setCompanyValues(values);
        setAppState('session');
        isSessionActiveRef.current = true;
        setupSpeechRecognition(mode);

        setElapsedTime(0);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = window.setInterval(() => {
            setElapsedTime(prevTime => prevTime + 1);
        }, 1000);
        
        setIsProcessing(true);
        if (mode === 'copilot') {
            chatRef.current = startCopilotSession(title, company, cvContent, values);
            recognitionRef.current?.start();
        } else {
            chatRef.current = startPracticeSession(title, company, cvContent);
            const response = await getPracticeResponse(chatRef.current);
            if(response.question) {
                setConversation([{ role: Role.MODEL, text: response.question }]);
                speakText(response.question);
            }
            setPracticeState('asking');
        }
        setIsProcessing(false);
    }, [setupSpeechRecognition, speakText]);
    
    // --- Copilot Handlers ---
    const handleGenerateSuggestion = useCallback(() => processCopilotRequest('talkingPoints'), [processCopilotRequest]);
    const handleGenerateExampleAnswer = useCallback(() => processCopilotRequest('exampleAnswer'), [processCopilotRequest]);

    // --- Practice Handlers ---
    const handleStartListening = () => {
        setAppError(null);
        setTranscript('');
        setFinalTranscript('');
        recognitionRef.current?.start();
        setPracticeState('answering');
    };

    const handleStopListening = useCallback(async () => {
        isSessionActiveRef.current = false;
        recognitionRef.current?.stop();
        if (!finalTranscript.trim() || !chatRef.current) {
            setPracticeState('asking'); // No answer, go back
            return;
        }
        
        setIsProcessing(true);
        const userAnswer = finalTranscript.trim();
        setConversation(prev => [...prev, { role: Role.USER, text: userAnswer }]);

        const response = await getPracticeResponse(chatRef.current, userAnswer);

        setConversation(prev => [...prev, { 
            role: Role.MODEL, 
            text: response.question,
            feedback: response.feedback ?? undefined,
            rating: response.rating ?? undefined,
        }]);
        
        setPracticeState('feedback');
        setTranscript('');
        setFinalTranscript('');
        setIsProcessing(false);
        isSessionActiveRef.current = true; // Re-enable for next question
    }, [finalTranscript]);

    const handleNextQuestion = async () => {
       if (!chatRef.current) return;
       setIsProcessing(true);
       const lastMessage = conversation[conversation.length - 1];
       if (lastMessage.role === Role.MODEL) {
           speakText(lastMessage.text);
       }
       setPracticeState('asking');
       setIsProcessing(false);
    };

    // --- Global Handlers ---
    const handleEndSession = useCallback(async () => {
        isSessionActiveRef.current = false;
        window.speechSynthesis.cancel();
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        recognitionRef.current?.stop();
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        setIsProcessing(true);
        
        const summary = await getInterviewSummary(conversation, jobTitle, companyName, appMode);

        const newSession: SavedSession = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            jobTitle,
            companyName,
            mode: appMode,
            conversation,
            summary,
        };
        saveSession(newSession);
        setSessions(getSessions());

        setSummaryReport(summary);
        setAppState('summary');
        setIsProcessing(false);
    }, [conversation, jobTitle, companyName, appMode]);

    const handleResetApp = () => {
        isSessionActiveRef.current = false;
        window.speechSynthesis.cancel();
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        recognitionRef.current?.stop();
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        setElapsedTime(0);
        setAppState('welcome');
        setConversation([]);
        setFeedbackContent(null);
        setIsProcessing(false);
        setTranscript('');
        setFinalTranscript('');
        setSummaryReport(null);
        setJobTitle('');
        setCompanyName('');
        setCompanyValues('');
        setActiveQuestion('');
        setCopilotCache(null);
        setAppError(null);
        chatRef.current = null;
        recognitionRef.current = null;
    };

    const handleShowHistory = () => setAppState('history');

    const handleClearHistory = () => {
        clearSessions();
        setSessions([]);
    };


    const renderContent = () => {
        switch (appState) {
            case 'welcome':
                return <WelcomeScreen onStart={handleStartSession} onShowHistory={handleShowHistory} hasHistory={sessions.length > 0} />;
            case 'session': {
                let practiceFeedbackContent: string | null = null;
                let practiceFeedbackRating: ConversationItem['rating'] | null = null;

                if (appMode === 'practice' && practiceState === 'feedback') {
                    const lastModelResponse = conversation[conversation.length - 1];
                    if (lastModelResponse?.role === Role.MODEL && lastModelResponse.feedback) {
                        practiceFeedbackContent = lastModelResponse.feedback;
                        practiceFeedbackRating = lastModelResponse.rating ?? null;
                    }
                }

                return (
                    <div className="flex flex-1 flex-col md:flex-row h-full overflow-hidden">
                        <div className="flex-1 flex flex-col">
                            <Conversation conversation={conversation} isProcessing={isProcessing} appMode={appMode}/>
                            <Controls 
                                mode={appMode}
                                isProcessing={isProcessing}
                                onEndSession={handleEndSession}
                                finalTranscript={finalTranscript}
                                interimTranscript={transcript}
                                // Copilot
                                onGenerate={handleGenerateSuggestion}
                                onGenerateExample={handleGenerateExampleAnswer}
                                // Practice
                                practiceState={practiceState}
                                isListening={isListening}
                                onStartListening={handleStartListening}
                                onStopListening={handleStopListening}
                                onNextQuestion={handleNextQuestion}
                            />
                        </div>
                        <Feedback 
                            title={appMode === 'copilot' ? feedbackTitle : 'AI Feedback'}
                            content={appMode === 'copilot' ? feedbackContent : practiceFeedbackContent}
                            rating={appMode === 'copilot' ? null : practiceFeedbackRating}
                            isTtsEnabled={isTtsEnabled}
                            onToggleTts={() => setIsTtsEnabled(prev => !prev)}
                            showTtsToggle={appMode === 'practice'}
                            elapsedTime={elapsedTime}
                        />
                    </div>
                );
            }
            case 'summary':
                 return summaryReport ? <SummaryScreen summary={summaryReport} onRestart={handleResetApp} /> : null;
            case 'history':
                return <HistoryScreen sessions={sessions} onBack={handleResetApp} onClear={handleClearHistory} />;
            default:
                return <WelcomeScreen onStart={handleStartSession} onShowHistory={handleShowHistory} hasHistory={sessions.length > 0} />;
        }
    };

    return (
        <main className="bg-gray-800 h-screen w-screen flex flex-col font-sans overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-gray-900 via-gray-900 to-black -z-10"></div>
            {appError && <ErrorDisplay message={appError} onDismiss={() => setAppError(null)} />}
            {renderContent()}
        </main>
    );
};

export default App;