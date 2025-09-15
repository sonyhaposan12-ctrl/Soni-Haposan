

import React, { useEffect, useRef } from 'react';
import { ConversationItem, Role, AppMode } from '../types';

interface ConversationProps {
    conversation: ConversationItem[];
    isProcessing: boolean;
    appMode: AppMode;
}

const Conversation: React.FC<ConversationProps> = ({ conversation, isProcessing, appMode }) => {
    const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation]);
    
    return (
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            {conversation.map((item, index) => {
                const isModel = item.role === Role.MODEL;

                const modelLabel = appMode === 'practice' ? 'AI Interviewer:' : 'Interviewer Question:';
                const modelAvatarText = appMode === 'practice' ? 'AI' : 'IV';
                const modelAvatarTitle = appMode === 'practice' ? 'AI Interviewer' : 'Interviewer';

                const userLabel = appMode === 'practice' ? 'You:' : 'AI Suggestion:';
                const userAvatarText = appMode === 'practice' ? 'You' : 'AI';
                const userAvatarTitle = appMode === 'practice' ? 'You' : 'AI Assistant';

                return (
                    <div key={index} className={`flex items-start gap-4 ${!isModel ? 'justify-end' : ''}`}>
                        {isModel && (
                            <div className="w-10 h-10 rounded-full bg-gray-600 flex-shrink-0 flex items-center justify-center font-bold text-white" title={modelAvatarTitle}>{modelAvatarText}</div>
                        )}
                        <div className={`max-w-lg p-4 rounded-2xl ${!isModel ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                           <p className="font-bold text-sm mb-1">{isModel ? modelLabel : userLabel}</p>
                           <p className="whitespace-pre-wrap">{item.text}</p>
                        </div>
                        {!isModel && (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex-shrink-0 flex items-center justify-center font-bold text-white" title={userAvatarTitle}>{userAvatarText}</div>
                        )}
                    </div>
                );
})}
            {isProcessing && (
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
