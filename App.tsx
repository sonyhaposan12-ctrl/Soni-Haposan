import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ConversationItem, Role, AppMode, AppState, SavedSession, InProgressSession } from './types';
import { 
    startCopilotSession, 
    getCopilotResponse,
    getInterviewSummary,
    startPracticeSession,
    restorePracticeSession,
    getPracticeResponse
} from './services/geminiService';
import { getSessions, saveSession, clearSessions, saveInProgressSession, getInProgressSession, clearInProgressSession } from './services/storageService';
import type { CopilotSuggestions } from './services/geminiService';
import type { Chat, Content } from '@google/genai';
import WelcomeScreen from './components/WelcomeScreen';
import Conversation from './components/Conversation';
import Feedback from './components/Feedback';
import Controls from './components/Controls';
import SummaryScreen from './components/SummaryScreen';
import HistoryScreen from './components/HistoryScreen';
import ErrorDisplay from './components/ErrorDisplay';
import SettingsPanel from './components/SettingsPanel';

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
    const [cvContent, setCvContent] = useState('');
    const [conversation, setConversation] = useState<ConversationItem[]>([]);
    const [summaryReport, setSummaryReport] = useState<string | null>(null);
    const [sessions, setSessions] = useState<SavedSession[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
    const [appError, setAppError] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Settings State
    const [isTtsEnabled, setIsTtsEnabled] = useState<boolean>(() => JSON.parse(localStorage.getItem('isTtsEnabled') ?? 'true'));
    const [recognitionLang, setRecognitionLang] = useState<string>(() => localStorage.getItem('recognitionLang') || 'en-US');
    const [ttsVoiceURI, setTtsVoiceURI] = useState<string | null>(() => localStorage.getItem('ttsVoiceURI'));
    

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
            if (ttsVoiceURI) {
                const voices = window.speechSynthesis.getVoices();
                const selectedVoice = voices.find(voice => voice.voiceURI === ttsVoiceURI);
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                }
            }
            window.speechSynthesis.speak(utterance);
        }
    }, [isTtsEnabled, ttsVoiceURI]);

    // Save settings whenever they change
    useEffect(() => { localStorage.setItem('isTtsEnabled', JSON.stringify(isTtsEnabled)); }, [isTtsEnabled]);
    useEffect(() => { localStorage.setItem('recognitionLang', recognitionLang); }, [recognitionLang]);
    useEffect(() => {
        if (ttsVoiceURI) localStorage.setItem('ttsVoiceURI', ttsVoiceURI);
        else localStorage.removeItem('ttsVoiceURI');
    }, [ttsVoiceURI]);


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

    const setupSpeechRecognition = useCallback((mode: AppMode) => {
        if (!('webkitSpeechRecognition' in window)) {
            setAppError("Speech recognition is not supported by your browser. Please use Google Chrome.");
            return;
        }
        if (recognitionRef.current) recognitionRef.current.stop();

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = mode === 'copilot';
        recognition.interimResults = true;
        recognition.lang = recognitionLang;

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
            }
        };
        
        recognitionRef.current = recognition;
    }, [finalTranscript, appMode, recognitionLang]);

    const handleStartSession = useCallback(async (mode: AppMode, title: string, company: string, cv: string) => {
        setAppError(null);
        setAppMode(mode);
        setJobTitle(title);
        setCompanyName(company);
        setCvContent(cv);
        setAppState('session');
        const startTime = Date.now();
        setSessionStartTime(startTime);
        isSessionActiveRef.current = true;
        setupSpeechRecognition(mode);

        setElapsedTime(0);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = window.setInterval(() => {
            setElapsedTime(prevTime => prevTime + 1);
        }, 1000);
        
        setIsProcessing(true);
        if (mode === 'copilot') {
            chatRef.current = startCopilotSession(title, company, cv);
            recognitionRef.current?.start();
        } else {
            chatRef.current = startPracticeSession(title, company, cv);
            const response = await getPracticeResponse(chatRef.current);
            if(response.question) {
                setConversation([{ role: Role.MODEL, text: response.question }]);
                speakText(response.question);
            }
            setPracticeState('asking');
        }
        setIsProcessing(false);
    }, [setupSpeechRecognition, speakText]);

    const reconstructPracticeHistory = (conv: ConversationItem[]): Content[] => {
        const history: Content[] = [];
        if (conv.length === 0) return history;
    
        // 1. Initial prompt from user is implicit, leading to the first question from model
        history.push({ role: 'user', parts: [{ text: "Please ask me the first question." }] });
        const firstModelResponse = conv[0];
        history.push({ role: 'model', parts: [{ text: JSON.stringify({ question: firstModelResponse.text, feedback: null, rating: null }) }] });
    
        // 2. Loop through subsequent user answers and model feedback
        for (let i = 1; i < conv.length; i += 2) {
            const userAnswer = conv[i];
            const modelFeedbackAndQuestion = conv[i + 1];
    
            if (userAnswer && userAnswer.role === Role.USER) {
                history.push({ role: 'user', parts: [{ text: `Here is my answer: "${userAnswer.text}". Please provide feedback, a rating, and the next question.` }] });
            }
    
            if (modelFeedbackAndQuestion && modelFeedbackAndQuestion.role === Role.MODEL) {
                 history.push({ role: 'model', parts: [{ text: JSON.stringify({
                     feedback: modelFeedbackAndQuestion.feedback,
                     rating: modelFeedbackAndQuestion.rating,
                     question: modelFeedbackAndQuestion.text
                 }) }] });
            }
        }
        return history;
    }
    
    const handleRestoreSession = useCallback((session: InProgressSession) => {
        setAppError(null);
        setAppMode(session.mode);
        setJobTitle(session.jobTitle);
        setCompanyName(session.companyName);
        setCvContent(session.cvContent);
        setConversation(session.conversation);
        setSessionStartTime(session.startTime);
        setAppState('session');
        isSessionActiveRef.current = true;

        const timeSinceStart = Math.floor((Date.now() - session.startTime) / 1000);
        setElapsedTime(timeSinceStart);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = window.setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);

        setupSpeechRecognition(session.mode);
        setIsProcessing(true);

        if (session.mode === 'copilot') {
            chatRef.current = startCopilotSession(session.jobTitle, session.companyName, session.cvContent);
            recognitionRef.current?.start();
        } else {
            const history = reconstructPracticeHistory(session.conversation);
            chatRef.current = restorePracticeSession(session.jobTitle, session.companyName, session.cvContent, history);
            
            const lastMessage = session.conversation[session.conversation.length - 1];
            if (lastMessage?.role === Role.MODEL) {
                setPracticeState('asking');
            } else {
                 setPracticeState('feedback');
            }
        }
        setIsProcessing(false);
    }, [setupSpeechRecognition]);
    
    // Check for in-progress session on initial load
    useEffect(() => {
        const inProgressSession = getInProgressSession();
        if (inProgressSession) {
            const lastActive = new Date(inProgressSession.startTime).toLocaleString();
            if (window.confirm(`You have an unfinished session from ${lastActive}. Would you like to restore it?`)) {
                handleRestoreSession(inProgressSession);
            } else {
                clearInProgressSession();
            }
        }
    }, [handleRestoreSession]);

    // Auto-save session progress
    useEffect(() => {
        if (appState === 'session' && sessionStartTime) {
            const sessionToSave: InProgressSession = {
                startTime: sessionStartTime,
                jobTitle,
                companyName,
                cvContent,
                mode: appMode,
                conversation,
            };
            saveInProgressSession(sessionToSave);
        }
    }, [conversation, appState, sessionStartTime, jobTitle, companyName, cvContent, appMode]);
    
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
        clearInProgressSession();
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
        clearInProgressSession();
        setElapsedTime(0);
        setSessionStartTime(null);
        setAppState('welcome');
        setConversation([]);
        setFeedbackContent(null);
        setIsProcessing(false);
        setTranscript('');
        setFinalTranscript('');
        setSummaryReport(null);
        setJobTitle('');
        setCompanyName('');
        setCvContent('');
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
                return <WelcomeScreen onStart={handleStartSession} onShowHistory={handleShowHistory} hasHistory={sessions.length > 0} onOpenSettings={() => setIsSettingsOpen(true)}/>;
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
                            onOpenSettings={() => setIsSettingsOpen(true)}
                            finalTranscript={finalTranscript}
                            interimTranscript={transcript}
                        />
                    </div>
                );
            }
            case 'summary':
                 return summaryReport ? <SummaryScreen 
                    summary={summaryReport} 
                    onRestart={handleResetApp}
                    conversation={conversation}
                    appMode={appMode}
                    jobTitle={jobTitle}
                    companyName={companyName}
                  /> : null;
            case 'history':
                return <HistoryScreen sessions={sessions} onBack={handleResetApp} onClear={handleClearHistory} />;
            default:
                return <WelcomeScreen onStart={handleStartSession} onShowHistory={handleShowHistory} hasHistory={sessions.length > 0} onOpenSettings={() => setIsSettingsOpen(true)}/>;
        }
    };

    return (
        <main className="bg-gray-800 h-screen w-screen flex flex-col font-sans overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-gray-900 via-gray-900 to-black -z-10"></div>
            {appError && <ErrorDisplay message={appError} onDismiss={() => setAppError(null)} />}
            <SettingsPanel 
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                isTtsEnabled={isTtsEnabled}
                onTtsToggle={setIsTtsEnabled}
                recognitionLang={recognitionLang}
                onRecognitionLangChange={setRecognitionLang}
                ttsVoiceURI={ttsVoiceURI}
                onTtsVoiceURIChange={setTtsVoiceURI}
            />
            {renderContent()}
        </main>
    );
};

export default App;