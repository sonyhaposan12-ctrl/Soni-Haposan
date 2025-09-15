
export enum Role {
  USER = 'user',
  MODEL = 'model',
}

export interface ConversationItem {
  role: Role;
  text: string;
}

export type AppMode = 'copilot' | 'practice';
export type AppState = 'welcome' | 'session' | 'summary';
