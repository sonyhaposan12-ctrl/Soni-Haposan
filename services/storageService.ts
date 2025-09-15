import { SavedSession } from '../types';

const SESSIONS_STORAGE_KEY = 'interviewCopilotSessions';

export const getSessions = (): SavedSession[] => {
    try {
        const savedSessionsJson = localStorage.getItem(SESSIONS_STORAGE_KEY);
        if (savedSessionsJson) {
            const sessions: SavedSession[] = JSON.parse(savedSessionsJson);
            // Sort by ID (timestamp), newest first
            return sessions.sort((a, b) => b.id - a.id);
        }
    } catch (error) {
        console.error("Failed to parse sessions from localStorage", error);
    }
    return [];
};

export const saveSession = (session: SavedSession): void => {
    const existingSessions = getSessions();
    const updatedSessions = [session, ...existingSessions.filter(s => s.id !== session.id)];
    try {
        localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updatedSessions));
    } catch (error) {
        console.error("Failed to save session to localStorage", error);
    }
};

export const clearSessions = (): void => {
    try {
        localStorage.removeItem(SESSIONS_STORAGE_KEY);
    } catch (error) {
        console.error("Failed to clear sessions from localStorage", error);
    }
};
