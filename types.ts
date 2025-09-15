// Fix: Removed unused import from "./v1/types" which caused a name conflict for 'Role'.

export enum Role {
  USER = 'user',
  MODEL = 'model',
}

export interface ConversationItem {
  role: Role;
  text: string;
  type?: 'talkingPoints' | 'exampleAnswer';
}

export type AppMode = 'copilot' | 'practice';
export type AppState = 'welcome' | 'session' | 'summary';