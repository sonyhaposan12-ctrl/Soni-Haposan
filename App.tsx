import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ConversationItem, Role, AppMode, AppState, SavedSession, InProgressSession } from './types';
import { 
    startCopilotSession, 
    getCopilotResponseStream,
    getInterviewSummary,
    startPracticeSession,
    restorePracticeSession,
    getPracticeResponse
} from './services/geminiService';
import { getSessions, saveSession, clearSessions, saveInProgressSession, getInProgressSession, clearInProgressSession } from './services/storageService';
import { T } from './translations';
import type { PracticeResponse } from './services/geminiService';
import type { Chat, Content } from '@google/genai';
import WelcomeScreen from './components/WelcomeScreen';
import Conversation from './components/Conversation';
import Feedback from './components/Feedback';
import Controls from './components/Controls';
import SummaryScreen from './components/SummaryScreen';
import HistoryScreen from './components/HistoryScreen';
import ErrorDisplay from './components/ErrorDisplay';
import SettingsPanel from './components/SettingsPanel';
import ErrorBoundary from './components/ErrorBoundary';

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
export type Language = 'en' | 'id';

const parseMarkdownResponse = (markdown: string) => {
    const talkingPointsHeader = '### Talking Points';
    const exampleAnswerHeader = '### Example Answer';

    if (markdown.includes(exampleAnswerHeader)) {
        const parts = markdown.split(exampleAnswerHeader);
        const talkingPoints = parts[0].replace(talkingPointsHeader, '').trim();
        const exampleAnswer = parts[1].trim();
        return { talkingPoints, exampleAnswer };
    } else {
        const talkingPoints = markdown.replace(talkingPointsHeader, '').trim();
        return { talkingPoints, exampleAnswer: '' };
    }
};


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
    const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
    const [appError, setAppError] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Settings State
    const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('language') as Language) || 'en');
    const [recognitionLang, setRecognitionLang] = useState<string>(() => localStorage.getItem('recognitionLang') || 'en-US');
    const [isAutoTriggerEnabled, setIsAutoTriggerEnabled] = useState(() => {
        const saved = localStorage.getItem('isAutoTriggerEnabled');
        return saved !== null ? JSON.parse(saved) : true;
    });
    
    // Copilot State
    const [feedbackContent, setFeedbackContent] = useState<string | null>(null);
    const [feedbackTitle, setFeedbackTitle] = useState<string>('AI Talking Points');
    const [activeQuestion, setActiveQuestion] = useState('');
    const [copilotCache, setCopilotCache] = useState<{ question: string; talkingPoints: string; exampleAnswer: string; } | null>(null);
    const [isOnCooldown, setIsOnCooldown] = useState(false);
    const [cooldownSeconds, setCooldownSeconds] = useState(0);

    // Practice State
    const [practiceState, setPracticeState] = useState<PracticeState>('asking');
    const [isListening, setIsListening] = useState(false);

    // Shared State & Refs
    const [transcript, setTranscript] = useState('');
    const [finalTranscript, setFinalTranscript] = useState('');
    const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
    const chatRef = useRef<Chat | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const isSessionActiveRef = useRef<boolean>(false);
    const cooldownIntervalRef = useRef<number | null>(null);
    const speechPauseTimerRef = useRef<number | null>(null);
    
    const translations = T[language];

     useEffect(() => {
        setSessions(getSessions());
    }, []);

    // Save settings whenever they change
    useEffect(() => { localStorage.setItem('language', language); }, [language]);
    useEffect(() => { localStorage.setItem('recognitionLang', recognitionLang); }, [recognitionLang]);
    useEffect(() => { localStorage.setItem('isAutoTriggerEnabled', JSON.stringify(isAutoTriggerEnabled)); }, [isAutoTriggerEnabled]);


    const startCooldown = useCallback((seconds: number) => {
        if (isOnCooldown) return; 
        setIsOnCooldown(true);
        setCooldownSeconds(seconds);

        if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);

        cooldownIntervalRef.current = window.setInterval(() => {
            setCooldownSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(cooldownIntervalRef.current!);
                    setIsOnCooldown(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [isOnCooldown]);

    const processCopilotRequest = useCallback(async (type: 'talkingPoints' | 'exampleAnswer') => {
        const question = finalTranscript.trim() || activeQuestion;
        if (!question || !chatRef.current) return;

        setAppError(null);
        setActiveQuestion(question);
        setFeedbackTitle(type === 'talkingPoints' ? translations.talkingPoints : translations.exampleAnswer);

        if (copilotCache && copilotCache.question === question) {
            const content = type === 'talkingPoints' ? copilotCache.talkingPoints : copilotCache.exampleAnswer;
            setFeedbackContent(content);
            const lastItem = conversation[conversation.length - 1];
            if (lastItem?.type !== type || lastItem?.text !== content) {
                 setConversation(prev => [...prev, { role: Role.USER, text: content, type: type }]);
            }
            return;
        }

        setIsProcessing(true);
        setFeedbackContent('');
        
        const isNewQuestion = !conversation.some(item => item.role === Role.MODEL && item.text === question);
        
        const stream = getCopilotResponseStream(chatRef.current, question, language);
        let fullResponse = '';

        for await (const chunk of stream) {
            // Error handling for streams: if the chunk is a full error message, stop.
            if (chunk.toLowerCase().startsWith("error:") || chunk.toLowerCase().startsWith("kesalahan:")) {
                fullResponse = chunk;
                break;
            }
            fullResponse += chunk;
            const { talkingPoints, exampleAnswer } = parseMarkdownResponse(fullResponse);
            setFeedbackContent(type === 'talkingPoints' ? talkingPoints : exampleAnswer);
        }
        
        if (fullResponse.toLowerCase().startsWith("error:") || fullResponse.toLowerCase().startsWith("kesalahan:")) {
            setFeedbackContent(fullResponse);
            startCooldown(10);
        } else {
            const { talkingPoints, exampleAnswer } = parseMarkdownResponse(fullResponse);
            setCopilotCache({ question, talkingPoints, exampleAnswer });
            
            const content = type === 'talkingPoints' ? talkingPoints : exampleAnswer;
            
            setConversation(prev => {
                const newConversation = [...prev];
                if (isNewQuestion) {
                    newConversation.push({ role: Role.MODEL, text: question });
                }
                // Only add the final, complete response to the conversation history
                const lastItem = newConversation[newConversation.length - 1];
                if (lastItem?.role === Role.USER && lastItem?.type === type) {
                    // This case can happen if user clicks buttons for the same response.
                    // To avoid duplicates, we can check if the content is the same.
                    if (lastItem.text !== content) {
                         newConversation.push({ role: Role.USER, text: content, type: type });
                    }
                } else {
                    newConversation.push({ role: Role.USER, text: content, type: type });
                }

                return newConversation;
            });
        }
        
        setIsProcessing(false);
        setTranscript('');
        setFinalTranscript('');
    }, [finalTranscript, activeQuestion, copilotCache, conversation, language, translations.talkingPoints, translations.exampleAnswer, startCooldown]);

    useEffect(() => {
        if (appState !== 'session' || appMode !== 'copilot' || !isAutoTriggerEnabled || !finalTranscript.trim()) {
            return;
        }
    
        if (speechPauseTimerRef.current) {
            clearTimeout(speechPauseTimerRef.current);
        }
    
        speechPauseTimerRef.current = window.setTimeout(() => {
            if (!isProcessing) {
                 processCopilotRequest('talkingPoints');
            }
        }, 1000); // Reduced delay for faster "listening"
    
        return () => {
            if (speechPauseTimerRef.current) {
                clearTimeout(speechPauseTimerRef.current);
            }
        };
    }, [finalTranscript, appState, appMode, isAutoTriggerEnabled, isProcessing, processCopilotRequest]);

    const setupSpeechRecognition = useCallback((mode: AppMode) => {
        if (!('webkitSpeechRecognition' in window)) {
            setAppError(translations.errorBrowserSupport);
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
                setAppError(translations.errorMicPermission);
                isSessionActiveRef.current = false;
            } else if (event.error === 'no-speech') {
                // This error is common and doesn't require a user-facing error message.
            } else if (event.error !== 'aborted') {
                setAppError(translations.errorSpeechRecognition);
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
                setFinalTranscript(prevTranscript => (prevTranscript + ' ' + latestFinalTranscript).trim());
            }
        };
        
        recognitionRef.current = recognition;
    }, [appMode, recognitionLang, translations]);

    const cleanupSession = useCallback(() => {
        isSessionActiveRef.current = false;
        if (recognitionRef.current) {
            recognitionRef.current.onend = null; // Prevent auto-restart on intentional stop
            recognitionRef.current.stop();
        }
        if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
            cooldownIntervalRef.current = null;
        }
        if (speechPauseTimerRef.current) {
            clearTimeout(speechPauseTimerRef.current);
            speechPauseTimerRef.current = null;
        }
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            setAudioStream(null);
        }
    }, [audioStream]);


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
        
        setIsProcessing(true);
        if (mode === 'copilot') {
            chatRef.current = startCopilotSession(title, company, cv, language);
            setFeedbackTitle(translations.aiTalkingPoints);
            recognitionRef.current?.start();
        } else {
            chatRef.current = startPracticeSession(title, company, cv, language);
            const response: PracticeResponse = await getPracticeResponse(chatRef.current, undefined, language);
            if(response.question) {
                setConversation([{ role: Role.MODEL, text: response.question }]);
            }
            setPracticeState('asking');
        }
        setIsProcessing(false);
    }, [setupSpeechRecognition, language, translations]);
    
    const initiateSessionStart = useCallback(async (mode: AppMode, title: string, company: string, cv: string) => {
        setAppError(null);

        try {
            let stream: MediaStream;
            if (mode === 'copilot') {
                // For copilot, capture tab audio to hear the interviewer.
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true, // Required to prompt for tab selection.
                    audio: true,
                });

                if (stream.getAudioTracks().length === 0) {
                    stream.getVideoTracks().forEach(track => track.stop()); // Clean up video track.
                    setAppError(translations.errorAudioSharing);
                    return;
                }
                // We don't need the video, so stop the track for efficiency.
                stream.getVideoTracks().forEach(track => track.stop());
            } else {
                // For practice, capture the user's microphone.
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            
            setAudioStream(stream);
            handleStartSession(mode, title, company, cv);

        } catch (err: any) {
            console.error("Media stream acquisition error:", err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                const modeText = mode === 'copilot' ? translations.tabAudio : translations.microphone;
                setAppError(translations.errorPermissionDenied(modeText));
            } else {
                setAppError(translations.errorMediaAccess);
            }
        }
    }, [handleStartSession, translations]);

    const reconstructPracticeHistory = (conv: ConversationItem[]): Content[] => {
        const history: Content[] = [];
        if (conv.length === 0) return history;
    
        const firstQuestionMsg = language === 'id' ? "Tolong ajukan pertanyaan pertama." : "Please ask me the first question.";
        history.push({ role: 'user', parts: [{ text: firstQuestionMsg }] });
        const firstModelResponse = conv[0];
        history.push({ role: 'model', parts: [{ text: JSON.stringify({ question: firstModelResponse.text, feedback: null, rating: null }) }] });
    
        for (let i = 1; i < conv.length; i += 2) {
            const userAnswer = conv[i];
            const modelFeedbackAndQuestion = conv[i + 1];
    
            if (userAnswer && userAnswer.role === Role.USER) {
                 const userAnswerMsg = language === 'id' 
                    ? `Ini jawaban saya: "${userAnswer.text}". Mohon berikan umpan balik, peringkat, dan pertanyaan berikutnya.`
                    : `Here is my answer: "${userAnswer.text}". Please provide feedback, a rating, and the next question.`;
                history.push({ role: 'user', parts: [{ text: userAnswerMsg }] });
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
    
    const handleRestoreSession = useCallback(async (session: InProgressSession) => {
        setAppError(null);

        try {
            let stream: MediaStream;
            if (session.mode === 'copilot') {
                stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                if (stream.getAudioTracks().length === 0) {
                    stream.getVideoTracks().forEach(track => track.stop());
                    clearInProgressSession();
                    setAppError(translations.errorRestoreNoAudio);
                    setAppState('welcome');
                    return;
                }
                stream.getVideoTracks().forEach(track => track.stop());
            } else {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            setAudioStream(stream);
        } catch (err: any) {
             console.error("Media stream acquisition error on restore:", err);
             clearInProgressSession();
             if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                 const modeText = session.mode === 'copilot' ? translations.tabAudio : translations.microphone;
                 setAppError(translations.errorRestorePermission(modeText));
             } else {
                 setAppError(translations.errorRestoreMedia);
             }
             setAppState('welcome');
             return;
        }

        setAppMode(session.mode);
        setJobTitle(session.jobTitle);
        setCompanyName(session.companyName);
        setCvContent(session.cvContent);
        setConversation(session.conversation);
        setSessionStartTime(session.startTime);
        setAppState('session');
        isSessionActiveRef.current = true;

        setupSpeechRecognition(session.mode);
        setIsProcessing(true);

        if (session.mode === 'copilot') {
            chatRef.current = startCopilotSession(session.jobTitle, session.companyName, session.cvContent, language);
            recognitionRef.current?.start();
        } else {
            const history = reconstructPracticeHistory(session.conversation);
            chatRef.current = restorePracticeSession(session.jobTitle, session.companyName, session.cvContent, history, language);
            
            const lastMessage = session.conversation[session.conversation.length - 1];
            if (lastMessage?.role === Role.MODEL) {
                setPracticeState('asking');
            } else {
                 setPracticeState('feedback');
            }
        }
        setIsProcessing(false);
    }, [setupSpeechRecognition, language, translations]);
    
    useEffect(() => {
        const inProgressSession = getInProgressSession();
        if (inProgressSession) {
            const lastActive = new Date(inProgressSession.startTime).toLocaleString(language === 'id' ? 'id-ID' : 'en-US');
            if (window.confirm(translations.confirmRestoreSession(lastActive))) {
                handleRestoreSession(inProgressSession);
            } else {
                clearInProgressSession();
            }
        }
    }, [handleRestoreSession, language, translations]);

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
    
    const handleGenerateSuggestion = useCallback(() => {
        if (speechPauseTimerRef.current) clearTimeout(speechPauseTimerRef.current);
        speechPauseTimerRef.current = null;
        processCopilotRequest('talkingPoints');
    }, [processCopilotRequest]);

    const handleGenerateExampleAnswer = useCallback(() => {
        if (speechPauseTimerRef.current) clearTimeout(speechPauseTimerRef.current);
        speechPauseTimerRef.current = null;
        processCopilotRequest('exampleAnswer');
    }, [processCopilotRequest]);

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
            setPracticeState('asking'); 
            return;
        }
        
        setIsProcessing(true);
        const userAnswer = finalTranscript.trim();
        setConversation(prev => [...prev, { role: Role.USER, text: userAnswer }]);

        const response: PracticeResponse = await getPracticeResponse(chatRef.current, userAnswer, language);

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
        isSessionActiveRef.current = true;
    }, [finalTranscript, language]);

    const handleNextQuestion = async () => {
       if (!chatRef.current) return;
       setIsProcessing(true);
       setPracticeState('asking');
       setIsProcessing(false);
    };

    const handleEndSession = useCallback(async () => {
        cleanupSession();
        setIsProcessing(true);
        
        const summary = await getInterviewSummary(conversation, jobTitle, companyName, appMode, language);

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
    }, [cleanupSession, conversation, jobTitle, companyName, appMode, language]);

    const handleResetApp = useCallback(() => {
        cleanupSession();
        clearInProgressSession();
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
        setIsOnCooldown(false);
        setCooldownSeconds(0);
    }, [cleanupSession]);

    const handleShowHistory = () => setAppState('history');

    const handleClearHistory = () => {
        clearSessions();
        setSessions([]);
    };

    const handleLanguageChange = (lang: Language) => {
        setLanguage(lang);
        setRecognitionLang(lang === 'id' ? 'id-ID' : 'en-US');
    }

    const renderContent = () => {
        switch (appState) {
            case 'welcome':
                return <WelcomeScreen translations={translations} onStart={initiateSessionStart} onShowHistory={handleShowHistory} hasHistory={sessions.length > 0} onOpenSettings={() => setIsSettingsOpen(true)}/>;
            case 'session': {
                if (!sessionStartTime) return null; // Should not happen

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
                            <Conversation conversation={conversation} isProcessing={isProcessing} appMode={appMode} translations={translations}/>
                            <Controls 
                                translations={translations}
                                mode={appMode}
                                isProcessing={isProcessing}
                                onEndSession={handleEndSession}
                                finalTranscript={finalTranscript}
                                interimTranscript={transcript}
                                // Copilot
                                onGenerate={handleGenerateSuggestion}
                                onGenerateExample={handleGenerateExampleAnswer}
                                isOnCooldown={isOnCooldown}
                                cooldownSeconds={cooldownSeconds}
                                // Practice
                                practiceState={practiceState}
                                isListening={isListening}
                                onStartListening={handleStartListening}
                                onStopListening={handleStopListening}
                                onNextQuestion={handleNextQuestion}
                            />
                        </div>
                        <Feedback 
                            translations={translations}
                            title={appMode === 'copilot' ? feedbackTitle : translations.aiFeedback}
                            content={appMode === 'copilot' ? feedbackContent : practiceFeedbackContent}
                            rating={appMode === 'copilot' ? null : practiceFeedbackRating}
                            sessionStartTime={sessionStartTime}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                            audioStream={audioStream}
                            finalTranscript={finalTranscript}
                            interimTranscript={transcript}
                        />
                    </div>
                );
            }
            case 'summary':
                 return summaryReport ? <SummaryScreen 
                    translations={translations}
                    summary={summaryReport} 
                    onRestart={handleResetApp}
                    conversation={conversation}
                    appMode={appMode}
                    jobTitle={jobTitle}
                    companyName={companyName}
                  /> : null;
            case 'history':
                return <HistoryScreen translations={translations} sessions={sessions} onBack={handleResetApp} onClear={handleClearHistory} />;
            default:
                return <WelcomeScreen translations={translations} onStart={initiateSessionStart} onShowHistory={handleShowHistory} hasHistory={sessions.length > 0} onOpenSettings={() => setIsSettingsOpen(true)}/>;
        }
    };

    return (
        <main className="bg-gray-800 h-screen w-screen flex flex-col font-sans overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-gray-900 via-gray-900 to-black -z-10"></div>
            {appError && <ErrorDisplay message={appError} onDismiss={() => setAppError(null)} />}
            <SettingsPanel 
                translations={translations}
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                language={language}
                onLanguageChange={handleLanguageChange}
                recognitionLang={recognitionLang}
                onRecognitionLangChange={setRecognitionLang}
                isAutoTriggerEnabled={isAutoTriggerEnabled}
                onIsAutoTriggerEnabledChange={setIsAutoTriggerEnabled}
            />
            <ErrorBoundary onReset={handleResetApp}>
              {renderContent()}
            </ErrorBoundary>
        </main>
    );
};

export default App;