export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot' | 'other';
  timestamp: number;
  chatId: string;
  isRead: boolean;
}

export interface ChatSession {
  id: string;
  chatId: string;
  messages: ChatMessage[];
  lastActivity: number;
  isActive: boolean;
  aiAgentId?: string;
}

export interface AIAgent {
  id: string;
  name: string;
  personality: string;
  systemPrompt: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BotConfig {
  isEnabled: boolean;
  autoReply: boolean;
  responseDelay: number; // в миллисекундах
  selectedAgentId?: string;
  keywords: string[];
  excludedUsers: string[];
}

export interface Statistics {
  totalMessages: number;
  totalReplies: number;
  activeChats: number;
  averageResponseTime: number;
  successRate: number;
  dailyStats: DailyStats[];
  queueLength?: number;
  totalErrors?: number;
  lastMessageAt?: number;
  lastResponseAt?: number;
  lastError?: string | null;
}

export interface DailyStats {
  date: string;
  messages: number;
  replies: number;
  responseTime: number;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  temperature: number;
  topP?: number;
  topK?: number;
}

export interface HuggingFaceConfig {
  apiKey: string;
  model: string;
  maxLength: number;
  temperature: number;
}
