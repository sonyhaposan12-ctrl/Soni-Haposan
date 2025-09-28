import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ConversationItem, Role, AppMode, AppState, SavedSession, InProgressSession } from './types';
import { 
    getCopilotResponseStream,
    getInterviewSummary,
    getPracticeResponseStream,
    getPracticeExampleAnswerStream,
    connectLiveProxy,
    getCompanyBriefing,
} from './services/apiService';
import { getSessions, saveSession, clearSessions, saveInProgressSession, getInProgressSession, clearInProgressSession } from './services/storageService';
import { T } from './translations';
import type { Content } from '@google/genai';
import WelcomeScreen from './components/WelcomeScreen';
import Conversation from './components/Conversation';
import Feedback from './components/Feedback';
import Controls from './components/Controls';
import SummaryScreen from './components/SummaryScreen';
import HistoryScreen from './components/HistoryScreen';
import ErrorDisplay from './components/ErrorDisplay';
import SettingsPanel from './components/SettingsPanel';
import ErrorBoundary from './components/ErrorBoundary';

// Add types for the Web Speech API to resolve TypeScript errors.
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

// Helper to encode audio data for the live proxy
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
// Helper to create audio blob for the live proxy
function createBlob(data: Float32Array) {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

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

const parsePracticeResponse = (markdown: string, lang: Language): { feedback: string; rating: ConversationItem['rating']; question: string } => {
    const parts = markdown.split('---');
    if (parts.length === 3) {
        const ratingText = parts[1].trim();
        let rating: ConversationItem['rating'] = null;
        if (['Excellent', 'Luar Biasa'].includes(ratingText)) rating = lang === 'id' ? 'Luar Biasa' : 'Excellent';
        else if (['Good', 'Baik'].includes(ratingText)) rating = lang === 'id' ? 'Baik' : 'Good';
        else if (['Needs Improvement', 'Perlu Peningkatan'].includes(ratingText)) rating = lang === 'id' ? 'Perlu Peningkatan' : 'Needs Improvement';
        
        return {
            feedback: parts[0].replace('**Feedback:**', '').trim(),
            rating: rating,
            question: parts[2].trim(),
        };
    }
    // This is for the first question which has no feedback/rating
    return {
        feedback: '',
        rating: null,
        question: markdown.trim(),
    };
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
    const [practiceHistory, setPracticeHistory] = useState<Content[]>([]);
    const [isListening, setIsListening] = useState(false);

    // Shared State & Refs
    const [transcript, setTranscript] = useState('');
    const [finalTranscript, setFinalTranscript] = useState('');
    const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null); // For practice mode
    const liveProxyRef = useRef<{ sendAudio: (blob: any) => void; close: () => void; } | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const isSessionActiveRef = useRef<boolean>(false);
    const cooldownIntervalRef = useRef<number | null>(null);
    
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
        if (!question) return;

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
        
        const stream = getCopilotResponseStream(jobTitle, companyName, cvContent, question, language);
        let fullResponse = '';

        for await (const chunk of stream) {
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
                const lastItem = newConversation[newConversation.length - 1];
                if (lastItem?.role === Role.USER && lastItem?.type === type) {
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
    }, [finalTranscript, activeQuestion, copilotCache, conversation, language, jobTitle, companyName, cvContent, translations.talkingPoints, translations.exampleAnswer, startCooldown]);

    const setupCopilotLiveTranscription = useCallback((stream: MediaStream) => {
        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        audioContextRef.current = inputAudioContext;
        
        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        audioProcessorRef.current = scriptProcessor;

        let currentTurnTranscript = '';

        liveProxyRef.current = connectLiveProxy({
            onOpen: () => {
                setIsListening(true);
            },
            onMessage: (message) => {
                if (message.type === 'live_message') {
                    const liveMessage = message.payload;
                    if (liveMessage.serverContent?.inputTranscription) {
                        const { text, isFinal } = liveMessage.serverContent.inputTranscription;
                        if (isFinal) {
                            currentTurnTranscript += text;
                        }
                        setTranscript(currentTurnTranscript + (isFinal ? '' : text));
                    }
                    if (liveMessage.serverContent?.turnComplete) {
                        if (currentTurnTranscript.trim()) {
                            setFinalTranscript(currentTurnTranscript.trim());
                        }
                        currentTurnTranscript = '';
                        setTranscript('');
                    }
                } else if (message.type === 'live_error') {
                     console.error('Live session error from backend:', message.payload);
                    setAppError(translations.errorSpeechRecognition);
                }
            },
            onError: (e: ErrorEvent) => {
                console.error('Live proxy WebSocket error:', e);
                setAppError(translations.errorSpeechRecognition);
            },
            onClose: () => {
                setIsListening(false);
            },
        });

        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            liveProxyRef.current?.sendAudio(pcmBlob);
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(inputAudioContext.destination);

    }, [translations.errorSpeechRecognition]);
    
    useEffect(() => {
        if (appState !== 'session' || appMode !== 'copilot' || !isAutoTriggerEnabled || !finalTranscript.trim()) {
            return;
        }
        if (!isProcessing) {
            processCopilotRequest('talkingPoints');
        }
    
    }, [finalTranscript, appState, appMode, isAutoTriggerEnabled, isProcessing, processCopilotRequest]);

    const setupSpeechRecognition = useCallback(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setAppError(translations.errorBrowserSupport);
            return;
        }
        if (recognitionRef.current) recognitionRef.current.stop();

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = false; 
        recognition.interimResults = true;
        recognition.lang = recognitionLang;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                setAppError(translations.errorMicPermission);
                isSessionActiveRef.current = false;
            } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
                setAppError(translations.errorSpeechRecognition);
            }
        };
        
        recognition.onresult = (event) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final += event.results[i][0].transcript + ' ';
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            setTranscript(interim);
            if (final) {
                setFinalTranscript(prev => (prev + ' ' + final).trim());
            }
        };
        
        recognitionRef.current = recognition;
    }, [recognitionLang, translations]);

    const cleanupSession = useCallback(() => {
        isSessionActiveRef.current = false;
        
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
        }

        if (liveProxyRef.current) {
            liveProxyRef.current.close();
            liveProxyRef.current = null;
        }
        if (audioProcessorRef.current) {
            audioProcessorRef.current.disconnect();
            audioProcessorRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(e => console.error("Error closing audio context", e));
            audioContextRef.current = null;
        }

        if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
            cooldownIntervalRef.current = null;
        }

        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            setAudioStream(null);
        }
    }, [audioStream]);


    const initiateSessionStart = useCallback(async (mode: AppMode, title: string, company: string, cv: string) => {
        setAppError(null);

        try {
            let stream: MediaStream;
            if (mode === 'copilot') {
                stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { sampleRate: 16000 } });
                if (stream.getAudioTracks().length === 0) {
                    stream.getVideoTracks().forEach(track => track.stop());
                    setAppError(translations.errorAudioSharing);
                    return;
                }
                stream.getVideoTracks().forEach(track => track.stop());
            } else {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            
            setAudioStream(stream);
            setAppMode(mode);
            setJobTitle(title);
            setCompanyName(company);
            setCvContent(cv);
            setAppState('session');
            setSessionStartTime(Date.now());
            isSessionActiveRef.current = true;
            
            if (mode === 'copilot') {
                setFeedbackTitle(translations.aiTalkingPoints);
                setupCopilotLiveTranscription(stream);
            } else {
                setupSpeechRecognition();
                setIsProcessing(true);
                const responseStream = getPracticeResponseStream(title, company, cv, [], undefined, language);
                const placeholder: ConversationItem = { role: Role.MODEL, text: '' };
                setConversation([placeholder]);

                let fullResponse = '';
                for await (const chunk of responseStream) {
                    fullResponse += chunk;
                    setConversation(prev => {
                        const newConversation = [...prev];
                        newConversation[newConversation.length - 1].text = fullResponse;
                        return newConversation;
                    });
                }
                 setPracticeHistory([
                    { role: 'user', parts: [{ text: language === 'id' ? "Tolong ajukan pertanyaan pertama." : "Please ask me the first question." }] },
                    { role: 'model', parts: [{ text: fullResponse }] }
                ]);
                setPracticeState('asking');
                setIsProcessing(false);
            }

        } catch (err: any) {
            console.error("Media stream acquisition error:", err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                const modeText = mode === 'copilot' ? translations.tabAudio : translations.microphone;
                setAppError(translations.errorPermissionDenied(modeText));
            } else {
                setAppError(translations.errorMediaAccess);
            }
        }
    }, [language, translations, setupCopilotLiveTranscription, setupSpeechRecognition]);
    
    // Restore session logic is removed as it adds complexity with the new backend architecture.
    // A fresh start is cleaner. Users are prompted to save sessions at the end.
    useEffect(() => {
        const inProgressSession = getInProgressSession();
        if (inProgressSession) {
            clearInProgressSession(); // Clear any stale session data on page load.
        }
    }, []);

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
    
    const handleGenerateSuggestion = useCallback(() => processCopilotRequest('talkingPoints'), [processCopilotRequest]);
    const handleGenerateExampleAnswer = useCallback(() => processCopilotRequest('exampleAnswer'), [processCopilotRequest]);

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
        const userAnswer = finalTranscript.trim();
        if (!userAnswer) {
            setPracticeState('asking'); 
            return;
        }
        
        setIsProcessing(true);
        setConversation(prev => [...prev, { role: Role.USER, text: userAnswer }]);

        const stream = getPracticeResponseStream(jobTitle, companyName, cvContent, practiceHistory, userAnswer, language);
        const placeholder: ConversationItem = { role: Role.MODEL, text: '' };
        setConversation(prev => [...prev, placeholder]);

        let fullResponse = '';
        for await (const chunk of stream) {
            fullResponse += chunk;
            setConversation(prev => {
                const newConversation = [...prev];
                const lastItem = newConversation[newConversation.length - 1];
                if(lastItem) {
                    const { feedback, rating, question } = parsePracticeResponse(fullResponse, language);
                    lastItem.text = question;
                    lastItem.feedback = feedback;
                    lastItem.rating = rating;
                }
                return newConversation;
            });
        }
        
        const userAnswerMsg = language === 'id' 
            ? `Ini jawaban saya: "${userAnswer}". Mohon berikan umpan balik, peringkat, dan pertanyaan berikutnya dalam format yang ditentukan.`
            : `Here is my answer: "${userAnswer}". Please provide feedback, a rating, and the next question in the specified format.`;

        setPracticeHistory(prev => [...prev, 
            { role: 'user', parts: [{ text: userAnswerMsg }] },
            { role: 'model', parts: [{ text: fullResponse }] },
        ]);
        
        setPracticeState('feedback');
        setTranscript('');
        setFinalTranscript('');
        setIsProcessing(false);
        isSessionActiveRef.current = true;
    }, [finalTranscript, language, jobTitle, companyName, cvContent, practiceHistory]);

    const handleGetPracticeExampleAnswer = useCallback(async () => {
        if (isProcessing) return;
        const lastQuestionItem = [...conversation].reverse().find(item => item.role === Role.MODEL);
        if (!lastQuestionItem) return;

        setIsProcessing(true);
        setAppError(null);

        const placeholder: ConversationItem = { role: Role.USER, type: 'exampleAnswer', text: '' };
        setConversation(prev => [...prev, placeholder]);
        const stream = getPracticeExampleAnswerStream(jobTitle, companyName, cvContent, lastQuestionItem.text, language);
        let fullResponse = '';

        for await (const chunk of stream) {
            fullResponse += chunk;
            setConversation(prev => {
                const newConv = [...prev];
                const last = newConv[newConv.length - 1];
                if (last) last.text = fullResponse;
                return newConv;
            });
        }
        setIsProcessing(false);
    }, [isProcessing, conversation, jobTitle, companyName, cvContent, language]);

    const handleNextQuestion = () => setPracticeState('asking');

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
        setIsOnCooldown(false);
        setCooldownSeconds(0);
        setPracticeHistory([]);
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
                if (!sessionStartTime) return null; 

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
                                translations={translations} mode={appMode} isProcessing={isProcessing}
                                onEndSession={handleEndSession} finalTranscript={finalTranscript}
                                interimTranscript={transcript} isListening={isListening}
                                onGenerate={handleGenerateSuggestion} onGenerateExample={handleGenerateExampleAnswer}
                                isOnCooldown={isOnCooldown} cooldownSeconds={cooldownSeconds}
                                practiceState={practiceState} onStartListening={handleStartListening}
                                onStopListening={handleStopListening} onNextQuestion={handleNextQuestion}
                                onGetExampleAnswer={handleGetPracticeExampleAnswer}
                            />
                        </div>
                        <Feedback 
                            translations={translations}
                            title={appMode === 'copilot' ? feedbackTitle : translations.aiFeedback}
                            content={appMode === 'copilot' ? feedbackContent : practiceFeedbackContent}
                            rating={appMode === 'copilot' ? null : practiceFeedbackRating}
                            sessionStartTime={sessionStartTime} onOpenSettings={() => setIsSettingsOpen(true)}
                            audioStream={audioStream} finalTranscript={finalTranscript} interimTranscript={transcript}
                        />
                    </div>
                );
            }
            case 'summary':
                 return summaryReport ? <SummaryScreen 
                    translations={translations} summary={summaryReport} onRestart={handleResetApp}
                    conversation={conversation} appMode={appMode} jobTitle={jobTitle} companyName={companyName}
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
                translations={translations} isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)}
                language={language} onLanguageChange={handleLanguageChange}
                recognitionLang={recognitionLang} onRecognitionLangChange={setRecognitionLang}
                isAutoTriggerEnabled={isAutoTriggerEnabled} onIsAutoTriggerEnabledChange={setIsAutoTriggerEnabled}
            />
            <ErrorBoundary onReset={handleResetApp}>
              {renderContent()}
            </ErrorBoundary>
        </main>
    );
};

export default App;