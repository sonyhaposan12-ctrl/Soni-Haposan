import { ConversationItem, Role, AppMode, CompanyBriefing, InProgressSession } from "../types";
import type { Content } from "@google/genai";
import { Language } from '../App';

const API_BASE_URL = 'http://localhost:3001/api';

const handleApiError = (error: any, lang: 'en' | 'id' = 'en'): string => {
    console.error("API Service Error:", error);
    const isIndonesian = lang === 'id';
     if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
         return isIndonesian
            ? "Kesalahan: Tidak dapat terhubung ke server backend. Pastikan server berjalan dan coba lagi."
            : "Error: Could not connect to the backend server. Please ensure it's running and try again.";
    }
    return isIndonesian ? "Terjadi kesalahan tak terduga." : "An unexpected error occurred.";
};

async function* getStream(endpoint: string, body: object): AsyncGenerator<string, void, unknown> {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            // Server-Sent Events (SSE) format is "data: ...\n\n"
            const lines = chunk.split('\n\n').filter(line => line.startsWith('data: '));
            for (const line of lines) {
                const jsonString = line.substring(6);
                yield JSON.parse(jsonString);
            }
        }
    } catch (error) {
        const lang = (body as any).lang || 'en';
        yield handleApiError(error, lang);
    }
}

export const getCopilotResponseStream = (
    jobTitle: string, companyName: string, cvContent: string, question: string, lang: Language
): AsyncGenerator<string, void, unknown> => {
    return getStream('/copilot-stream', { jobTitle, companyName, cvContent, question, lang });
};

export const getPracticeResponseStream = (
    jobTitle: string, companyName: string, cvContent: string, history: Content[], latestAnswer: string | undefined, lang: Language
): AsyncGenerator<string, void, unknown> => {
    return getStream('/practice-stream', { jobTitle, companyName, cvContent, history, latestAnswer, lang });
};

export const getPracticeExampleAnswerStream = (
    jobTitle: string, companyName: string, cvContent: string, question: string, lang: Language
): AsyncGenerator<string, void, unknown> => {
    return getStream('/practice-example-stream', { jobTitle, companyName, cvContent, question, lang });
};


export const getCompanyBriefing = async (companyName: string, lang: Language): Promise<CompanyBriefing> => {
    try {
        const response = await fetch(`${API_BASE_URL}/briefing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyName, lang }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            return { briefing: errorData.briefing || 'Error fetching briefing', sources: [] };
        }
        return await response.json();
    } catch (error) {
        return { briefing: handleApiError(error, lang), sources: [] };
    }
};

export const getInterviewSummary = async (conversation: ConversationItem[], jobTitle: string, companyName: string, mode: AppMode, lang: Language): Promise<string> => {
    try {
        const response = await fetch(`${API_BASE_URL}/summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation, jobTitle, companyName, mode, lang }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            return errorData.summary || 'Error fetching summary';
        }
        const data = await response.json();
        return data.summary;
    } catch (error) {
        return handleApiError(error, lang);
    }
};


// --- Live Transcription WebSocket Proxy ---

export const connectLiveProxy = (callbacks: {
    onOpen: () => void,
    onMessage: (message: any) => void,
    onError: (error: any) => void,
    onClose: () => void,
}) => {
    const ws = new WebSocket(`ws://localhost:3001/api/live`);

    ws.onopen = callbacks.onOpen;
    ws.onclose = callbacks.onClose;
    ws.onerror = callbacks.onError;
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            callbacks.onMessage(message);
        } catch (e) {
            console.error("Failed to parse WebSocket message:", e);
        }
    };

    return {
        sendAudio: (audioBlob: any) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'audio_input', payload: audioBlob }));
            }
        },
        close: () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
    };
};