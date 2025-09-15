
import React, { useState } from 'react';
import DocumentTextIcon from './icons/DocumentTextIcon';
import ThumbsUpIcon from './icons/ThumbsUpIcon';

interface SummaryScreenProps {
  summary: string;
  onRestart: () => void;
}

const SummaryScreen: React.FC<SummaryScreenProps> = ({ summary, onRestart }) => {
  const [feedbackText, setFeedbackText] = useState('');
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);

  const handleSubmitFeedback = () => {
    if (!feedbackText.trim()) return;
    // In a real application, you would send this feedback to a server.
    console.log("User Feedback Submitted:", feedbackText);
    setIsFeedbackSubmitted(true);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-white p-8 animate-fade-in overflow-y-auto">
      <div className="bg-white/10 p-6 rounded-full mb-6 backdrop-blur-sm flex-shrink-0">
          <DocumentTextIcon className="w-20 h-20 text-cyan-300" />
      </div>
      <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">Session Summary</h1>
      <p className="max-w-3xl text-lg text-gray-300 mb-8 text-center">
          Here's a breakdown of your performance with actionable feedback.
      </p>
      <div className="w-full max-w-3xl h-1/2 bg-gray-900/50 border border-gray-700 rounded-lg p-6 overflow-y-auto mb-8 flex-shrink-0">
          <div className="text-gray-200 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: summary.replace(/\n/g, '<br />') }}></div>
      </div>

      {/* Feedback Section */}
      <div className="w-full max-w-3xl mb-8">
        {!isFeedbackSubmitted ? (
          <div className="animate-fade-in">
            <h2 className="text-2xl font-bold mb-3 text-center">How was your experience?</h2>
            <p className="text-gray-400 text-center mb-4">Help us improve the AI assistant by sharing your feedback.</p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Your feedback..."
              className="w-full bg-gray-700/50 border border-gray-600 rounded-lg p-4 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 outline-none transition"
              rows={4}
              aria-label="Feedback input"
            />
            <button
              onClick={handleSubmitFeedback}
              disabled={!feedbackText.trim()}
              className="mt-4 w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-full text-lg transition-all duration-300"
            >
              Submit Feedback
            </button>
          </div>
        ) : (
          <div className="text-center bg-green-900/50 border border-green-700 rounded-lg p-6 animate-fade-in">
            <ThumbsUpIcon className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-300">Thank you for your feedback!</h2>
            <p className="text-gray-300">We appreciate you helping us make this tool better.</p>
          </div>
        )}
      </div>

      <button
          onClick={onRestart}
          className="bg-cyan-400 hover:bg-cyan-500 text-gray-900 font-bold py-3 px-8 rounded-full text-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-cyan-500/20 flex-shrink-0"
      >
          Start New Session
      </button>
    </div>
  );
};

export default SummaryScreen;
