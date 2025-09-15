import React, { useState } from 'react';
import { SavedSession } from '../types';
import Conversation from './Conversation';
import DocumentTextIcon from './icons/DocumentTextIcon';
import TrashIcon from './icons/TrashIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';

interface HistoryScreenProps {
  sessions: SavedSession[];
  onBack: () => void;
  onClear: () => void;
}

const HistoryScreen: React.FC<HistoryScreenProps> = ({ sessions, onBack, onClear }) => {
  const [selectedSession, setSelectedSession] = useState<SavedSession | null>(sessions[0] || null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClear = () => {
      onClear();
      setSelectedSession(null);
      setShowConfirm(false);
  }

  return (
    <div className="flex flex-col h-full text-white p-4 sm:p-6 md:p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-3">
          <DocumentTextIcon className="w-10 h-10 text-cyan-300" />
          Session History
        </h1>
        <button
          onClick={onBack}
          className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-full transition-colors"
        >
          &larr; Back to Welcome
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400">
            <DocumentTextIcon className="w-24 h-24 text-gray-600 mb-4" />
            <h2 className="text-2xl font-semibold text-gray-200">No Saved Sessions</h2>
            <p>Your completed interview sessions will appear here.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
          {/* Session List */}
          <div className="w-full md:w-1/3 flex flex-col bg-gray-900/50 rounded-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-xl font-bold">Past Interviews</h2>
                <button 
                    onClick={() => setShowConfirm(true)}
                    className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-md transition-colors"
                    aria-label="Clear all sessions"
                >
                    <TrashIcon className="w-4 h-4"/>
                    Clear
                </button>
            </div>
            <ul className="overflow-y-auto flex-1">
                {sessions.map((session) => (
                    <li key={session.id}>
                        <button
                            onClick={() => setSelectedSession(session)}
                            className={`w-full text-left p-4 border-b border-gray-800 hover:bg-gray-700/50 transition-colors flex justify-between items-center ${selectedSession?.id === session.id ? 'bg-cyan-500/20' : ''}`}
                        >
                           <div>
                                <p className={`font-bold ${selectedSession?.id === session.id ? 'text-cyan-300' : 'text-white'}`}>{session.jobTitle}</p>
                                <p className="text-sm text-gray-400">{session.companyName || 'No Company'}</p>
                                <p className="text-xs text-gray-500 mt-1">{session.date}</p>
                           </div>
                           <ChevronRightIcon className="w-5 h-5 text-gray-500" />
                        </button>
                    </li>
                ))}
            </ul>
          </div>
          {/* Detail View */}
          <div className="flex-1 flex flex-col bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
            {selectedSession ? (
                <>
                    <div className="p-4 border-b border-gray-700 flex-shrink-0">
                        <h2 className="text-2xl font-bold text-white">{selectedSession.jobTitle}</h2>
                        <p className="text-gray-300">{selectedSession.companyName}</p>
                         <p className="text-sm text-gray-500 capitalize">{selectedSession.mode} Mode &middot; {selectedSession.date}</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        <h3 className="text-xl font-bold mb-4 text-cyan-400">Interview Transcript</h3>
                        <div className="bg-gray-800/50 rounded-lg p-2">
                           <Conversation conversation={selectedSession.conversation} isProcessing={false} appMode={selectedSession.mode} />
                        </div>
                        <hr className="my-6 border-gray-700" />
                        <h3 className="text-xl font-bold mb-4 text-cyan-400">Final Summary</h3>
                        <div className="bg-gray-800/50 rounded-lg p-6 text-gray-200 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: selectedSession.summary.replace(/\n/g, '<br />') }}></div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <p>Select a session to view details</p>
                </div>
            )}
          </div>
        </div>
      )}
      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-8 shadow-2xl max-w-sm text-center">
                <h2 className="text-2xl font-bold mb-2">Are you sure?</h2>
                <p className="text-gray-400 mb-6">This will permanently delete all your saved session history. This action cannot be undone.</p>
                <div className="flex gap-4">
                    <button onClick={() => setShowConfirm(false)} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-full transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleClear} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-full transition-colors">
                        Yes, Delete
                    </button>
                </div>
            </div>
        </div>
      )}
       <footer className="text-center pt-4 mt-auto flex-shrink-0">
        <p className="text-xs text-gray-500">
          &copy; {new Date().getFullYear()} PT Josera Global IT Solusindo. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default HistoryScreen;