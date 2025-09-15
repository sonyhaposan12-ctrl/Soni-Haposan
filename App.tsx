import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ConversationItem, Role, AppMode, AppState } from './types';
import { 
    startCopilotSession, 
    getTalkingPoints, 
    getExampleAnswer,
    getInterviewSummary,
    startPracticeSession,
    getPracticeResponse
} from './services/geminiService';
import type { Chat } from '@google/genai';
import WelcomeScreen from './components/WelcomeScreen';
import Conversation from './components/Conversation';
import Feedback from './components/Feedback';
import Controls from './components/Controls';
import SummaryScreen from './components/SummaryScreen';

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
    const [conversation, setConversation] = useState<ConversationItem[]>([]);
    const [summaryReport, setSummaryReport] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isTtsEnabled, setIsTtsEnabled] = useState<boolean>(() => {
        const saved = localStorage.getItem('isTtsEnabled');
        return saved !== null ? JSON.parse(saved) : true; // Default to on
    });

    // Copilot State
    const [feedbackContent, setFeedbackContent] = useState<string | null>(null);
    const [feedbackTitle, setFeedbackTitle] = useState<string>('AI Talking Points');
    
    // Practice State
    const [practiceState, setPracticeState] = useState<PracticeState>('asking');
    const [feedback, setFeedback] = useState<string | null>(null);
    const [isListening, setIsListening] = useState(false);

    // Shared State
    const [transcript, setTranscript] = useState('');
    const [finalTranscript, setFinalTranscript] = useState('');

    const chatRef = useRef<Chat | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

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
        if (appMode === 'practice' && feedback) speakText(feedback);
    }, [feedback, appMode, speakText]);

    const setupSpeechRecognition = useCallback((mode: AppMode) => {
        if (!('webkitSpeechRecognition' in window)) return;
        if (recognitionRef.current) recognitionRef.current.stop();

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = mode === 'copilot';
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = (event) => console.error('Speech recognition error:', event.error);
        
        let currentFinalTranscript = '';
        recognition.onresult = (event) => {
            let interimTranscript = '';
            currentFinalTranscript = finalTranscript; // Preserve previous final transcript if continuous is false
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    currentFinalTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            setTranscript(interimTranscript);
            setFinalTranscript(currentFinalTranscript.trim());
        };
        
        recognitionRef.current = recognition;
    }, [finalTranscript]);

    const handleStartSession = useCallback(async (mode: AppMode, title: string, company: string, cvContent: string) => {
        setAppMode(mode);
        setJobTitle(title);
        setCompanyName(company);
        setAppState('session');
        setupSpeechRecognition(mode);
        
        setIsProcessing(true);
        if (mode === 'copilot') {
            chatRef.current = startCopilotSession(title, company, cvContent);
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
    const handleGenerateSuggestion = useCallback(async () => {
        if (!finalTranscript.trim() || !chatRef.current) return;
        recognitionRef.current?.stop();
        setIsProcessing(true);
        setFeedbackContent(null);
        setFeedbackTitle('AI Talking Points');
        setConversation(prev => [...prev, { role: Role.MODEL, text: finalTranscript }]);

        const response = await getTalkingPoints(chatRef.current, finalTranscript);
        if (response.talkingPoints) {
            setFeedbackContent(response.talkingPoints);
            setConversation(prev => [...prev, { role: Role.USER, text: response.talkingPoints, type: 'talkingPoints' }]);
        }
        
        setIsProcessing(false);
        setTranscript('');
        setFinalTranscript('');
        recognitionRef.current?.start();
    }, [finalTranscript]);

    const handleGenerateExampleAnswer = useCallback(async () => {
        if (!finalTranscript.trim() || !chatRef.current) return;
        recognitionRef.current?.stop();
        setIsProcessing(true);
        setFeedbackContent(null);
        setFeedbackTitle('AI Example Answer');
        setConversation(prev => [...prev, { role: Role.MODEL, text: finalTranscript }]);

        const response = await getExampleAnswer(chatRef.current, finalTranscript);
        if (response.exampleAnswer) {
            setFeedbackContent(response.exampleAnswer);
            setConversation(prev => [...prev, { role: Role.USER, text: response.exampleAnswer, type: 'exampleAnswer' }]);
        }

        setIsProcessing(false);
        setTranscript('');
        setFinalTranscript('');
        recognitionRef.current?.start();
    }, [finalTranscript]);

    // --- Practice Handlers ---
    const handleStartListening = () => {
        setTranscript('');
        setFinalTranscript('');
        recognitionRef.current?.start();
        setPracticeState('answering');
    };

    const handleStopListening = useCallback(async () => {
        recognitionRef.current?.stop();
        if (!finalTranscript.trim() || !chatRef.current) {
            setPracticeState('asking'); // No answer, go back
            return;
        }
        
        setIsProcessing(true);
        setFeedback(null);
        setConversation(prev => [...prev, { role: Role.USER, text: finalTranscript }]);

        const response = await getPracticeResponse(chatRef.current, finalTranscript);
        if (response.feedback) setFeedback(response.feedback);
        if(response.question) {
             setConversation(prev => [...prev, { role: Role.MODEL, text: response.question }]);
        }
        
        setPracticeState('feedback');
        setTranscript('');
        setFinalTranscript('');
        setIsProcessing(false);
    }, [finalTranscript]);

    const handleNextQuestion = async () => {
       if (!chatRef.current) return;
       setIsProcessing(true);
       setFeedback(null);
       const lastMessage = conversation[conversation.length - 1];
       if (lastMessage.role === Role.MODEL) {
           speakText(lastMessage.text);
       }
       setPracticeState('asking');
       setIsProcessing(false);
    };

    // --- Global Handlers ---
    const handleEndSession = useCallback(async () => {
        window.speechSynthesis.cancel();
        recognitionRef.current?.stop();
        setIsProcessing(true);
        const summary = await getInterviewSummary(conversation, jobTitle, companyName, appMode);
        setSummaryReport(summary);
        setAppState('summary');
        setIsProcessing(false);
    }, [conversation, jobTitle, companyName, appMode]);

    const handleResetApp = () => {
        window.speechSynthesis.cancel();
        setAppState('welcome');
        setConversation([]);
        setFeedbackContent(null);
        setFeedback(null);
        setIsProcessing(false);
        setTranscript('');
        setFinalTranscript('');
        setSummaryReport(null);
        setJobTitle('');
        setCompanyName('');
        chatRef.current = null;
        recognitionRef.current = null;
    };

    const renderContent = () => {
        switch (appState) {
            case 'welcome':
                return <WelcomeScreen onStart={handleStartSession} />;
            case 'session':
                return (
                    <div className="flex flex-1 flex-col md:flex-row h-full overflow-hidden">
                        <div className="flex-1 flex flex-col">
                            <Conversation conversation={conversation} isProcessing={isProcessing} appMode={appMode}/>
                            <Controls 
                                mode={appMode}
                                isProcessing={isProcessing}
                                onEndSession={handleEndSession}
                                transcript={transcript || finalTranscript}
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
                            content={appMode === 'copilot' ? feedbackContent : feedback}
                            isTtsEnabled={isTtsEnabled}
                            onToggleTts={() => setIsTtsEnabled(prev => !prev)}
                            showTtsToggle={appMode === 'practice'}
                        />
                    </div>
                );
            case 'summary':
                 return summaryReport ? <SummaryScreen summary={summaryReport} onRestart={handleResetApp} /> : null;
            default:
                return <WelcomeScreen onStart={handleStartSession} />;
        }
    };

    return (
        <main className="bg-gray-800 h-screen w-screen flex flex-col font-sans overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-gray-900 via-gray-900 to-black -z-10"></div>
            {renderContent()}
        </main>
    );
};

export default App;