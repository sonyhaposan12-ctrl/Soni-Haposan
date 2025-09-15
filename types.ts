// Fix: Removed unused import from "./v1/types" which caused a name conflict for 'Role'.

export enum Role {
  USER = 'user',
  MODEL = 'model',
}

export interface ConversationItem {
  role: Role;
  text: string;
  type?: 'talkingPoints' | 'exampleAnswer';
  feedback?: string;
  rating?: 'Needs Improvement' | 'Good' | 'Excellent';
}

export type AppMode = 'copilot' | 'practice';
export type AppState = 'welcome' | 'session' | 'summary' | 'history';

export interface SavedSession {
  id: number; // Using timestamp as ID for simplicity and sorting
  date: string;
  jobTitle: string;
  companyName: string;
  mode: AppMode;
  conversation: ConversationItem[];
  summary: string;
}