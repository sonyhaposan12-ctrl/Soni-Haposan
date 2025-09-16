import React, { useEffect, useRef } from 'react';
import { ConversationItem, Role, AppMode } from '../types';
import StarIcon from './icons/StarIcon';

interface ConversationProps {
    conversation: ConversationItem[];
    isProcessing: boolean;
    appMode: AppMode;
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
        // Use GFM and breaks for better formatting of typical AI responses.
        return window.marked.parse(text, { breaks: true, gfm: true });
    }
    // Simple fallback if marked.js fails to load.
    return text.replace(/\n/g, '<br />');
};

const getRatingClass = (rating: ConversationItem['rating']) => {
    switch (rating) {
        case 'Excellent':
            return 'bg-green-500/20 text-green-300 border-green-500/30';
        case 'Good':
            return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
        case 'Needs Improvement':
            return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
        default:
            return 'bg-gray-600/20 text-gray-300 border-gray-500/30';
    }
};

const RatingBadge: React.FC<{ rating: ConversationItem['rating']}> = ({ rating }) => {
    if (!rating) return null;

    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getRatingClass(rating)}`}>
            <StarIcon className="w-3.5 h-3.5" />
            <span>{rating}</span>
        </div>
    );
};

const ConversationMessage: React.FC<{ item: ConversationItem, appMode: AppMode }> = React.memo(({ item, appMode }) => {
    const isModel = item.role === Role.MODEL;

    const modelLabel = appMode === 'practice' ? 'AI Interviewer:' : 'Interviewer Question:';
    const modelAvatarText = appMode === 'practice' ? 'AI' : 'IV';
    const modelAvatarTitle = appMode === 'practice' ? 'AI Interviewer' : 'Interviewer';

    const userLabel = appMode === 'practice' 
        ? 'You:' 
        : item.type === 'exampleAnswer' 
            ? 'AI Example Answer:' 
            : 'AI Suggestion:';
    const userAvatarText = appMode === 'practice' ? 'You' : 'AI';
    const userAvatarTitle = appMode === 'practice' ? 'You' : 'AI Assistant';
    
    const hasFeedback = appMode === 'practice' && item.feedback;

    const isFeedbackError = item.feedback?.toLowerCase().startsWith('error:');
    const isTextError = item.text.toLowerCase().includes('sorry, i encountered an error');

    return (
        <div className={`flex items-start gap-4 ${!isModel ? 'justify-end' : ''}`}>
            {isModel && (
                <div className="w-10 h-10 rounded-full bg-gray-600 flex-shrink-0 flex items-center justify-center font-bold text-white" title={modelAvatarTitle}>{modelAvatarText}</div>
            )}
            <div className={`max-w-lg p-4 rounded-2xl ${!isModel ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
               
               {hasFeedback ? (
                    <>
                        <div className="mb-3">
                            <p className="font-bold text-sm mb-2 text-gray-400">AI Feedback:</p>
                            <RatingBadge rating={item.rating} />
                            <div 
                                className={`markdown-content mt-2 ${isFeedbackError ? 'text-red-300' : ''}`}
                                dangerouslySetInnerHTML={{ __html: parseMarkdown(item.feedback) }} 
                            />
                        </div>
                        <hr className="border-gray-600 my-3"/>
                        <p className="font-bold text-sm mb-1">{modelLabel}</p>
                         <div
                            className={`markdown-content ${isTextError ? 'text-red-300' : ''}`}
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(item.text) }}
                        />
                    </>
               ) : (
                    <>
                        <p className="font-bold text-sm mb-1">{isModel ? modelLabel : userLabel}</p>
                        <div 
                            className="markdown-content"
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(item.text) }}
                        />
                    </>
               )}
               
            </div>
            {!isModel && (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex-shrink-0 flex items-center justify-center font-bold text-white" title={userAvatarTitle}>{userAvatarText}</div>
            )}
        </div>
    );
});

const Conversation: React.FC<ConversationProps> = ({ conversation, isProcessing, appMode }) => {
    const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // Instantly scroll to the bottom when new messages are added to maintain a real-time feel.
        // The 'auto' behavior is more immediate than 'smooth'.
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'auto' });
    }, [conversation]);
    
    return (
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            {conversation.map((item, index) => (
                <ConversationMessage key={index} item={item} appMode={appMode} />
            ))}
            {isProcessing && appMode === 'practice' && (
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex-shrink-0 flex items-center justify-center font-bold text-white">AI</div>
                    <div className="max-w-lg p-4 rounded-2xl bg-gray-700 text-gray-200 rounded-bl-none">
                        <div className="flex space-x-1">
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></span>
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span>
                        </div>
                    </div>
                </div>
            )}
            <div ref={endOfMessagesRef} />
        </div>
    );
};

export default Conversation;