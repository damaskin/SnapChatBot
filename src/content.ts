import { SnapchatDetector } from './utils/snapchat-detector';
import { ChatMessage, BotConfig, AIAgent } from './types';
import { geminiService } from './services/gemini';
import { huggingFaceService } from './services/huggingface';
import { simpleAIService } from './services/simple-ai';
import { firebaseService } from './services/firebase';

class SnapchatBot {
  private detector: SnapchatDetector;
  private isEnabled = false;
  private config: BotConfig | null = null;
  private currentAgent: AIAgent | null = null;
  private chatSessions: Map<string, ChatMessage[]> = new Map();

  constructor() {
    this.detector = SnapchatDetector.getInstance();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Загружаем конфигурацию из storage
      await this.loadConfig();
      
      // Инициализируем детектор
      this.detector.initialize();
      
      // Подписываемся на события
      this.setupEventListeners();
      
      console.log('Snapchat Bot initialized');
    } catch (error) {
      console.error('Failed to initialize Snapchat Bot:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['botConfig', 'firebaseConfig', 'geminiConfig']);
      
      if (result.botConfig) {
        this.config = result.botConfig;
        this.isEnabled = this.config?.isEnabled || false;
      }

      if (result.geminiConfig) {
        geminiService.initialize(result.geminiConfig);
      } else {
        // Инициализируем Gemini с настройками по умолчанию
        const defaultGeminiConfig = {
          apiKey: 'AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k',
          model: 'gemini-1.5-flash',
          maxOutputTokens: 1000,
          temperature: 0.7,
          topP: 0.95,
          topK: 40
        };
        geminiService.initialize(defaultGeminiConfig);
        console.log('Gemini initialized with default settings');
      }

      if (result.firebaseConfig) {
        await firebaseService.initialize(result.firebaseConfig);
      }

      // Загружаем активного агента
      if (this.config?.selectedAgentId) {
        await this.loadAgent(this.config.selectedAgentId);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  private async loadAgent(agentId: string): Promise<void> {
    try {
      const storedAgentsResult = await chrome.storage.sync.get('agents');
      const storedAgents: AIAgent[] = storedAgentsResult.agents || [];

      let agent = storedAgents.find(item => item.id === agentId) || null;

      if (!agent) {
        try {
          const firebaseAgents = await firebaseService.getAIAgents();
          agent = firebaseAgents.find(item => item.id === agentId) || null;
        } catch (firebaseError) {
          console.warn('Failed to load agent from Firebase, falling back to local storage only:', firebaseError);
        }
      }

      this.currentAgent = agent;
    } catch (error) {
      console.error('Failed to load agent:', error);
      this.currentAgent = null;
    }
  }

  private setupEventListeners(): void {
    // Слушаем новые сообщения
    document.addEventListener('snapchat-new-message', (event: any) => {
      this.handleNewMessage(event.detail);
    });

    // Слушаем изменения конфигурации
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.botConfig) {
        const previousConfig = this.config;
        this.config = changes.botConfig.newValue as BotConfig | null;
        this.isEnabled = this.config?.isEnabled || false;

        const previousAgentId = previousConfig?.selectedAgentId || null;
        const nextAgentId = this.config?.selectedAgentId || null;

        if (previousAgentId !== nextAgentId) {
          if (nextAgentId) {
            this.loadAgent(nextAgentId);
          } else {
            this.currentAgent = null;
          }
        }
      }
    });

    // Слушаем команды от popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sendResponse);
      return true; // Асинхронный ответ
    });
  }

  private async handleNewMessage(message: {
    text: string;
    sender: 'user' | 'other';
    timestamp: number;
    chatId: string;
  }): Promise<void> {
    if (!this.isEnabled || !this.config || !this.currentAgent) {
      return;
    }

    // Проверяем, нужно ли отвечать на это сообщение
    if (message.sender === 'user') {
      return; // Не отвечаем на свои сообщения
    }

    // Проверяем исключенных пользователей
    if (this.config.excludedUsers.includes(message.chatId)) {
      return;
    }

    // Анализируем сообщение с помощью ИИ
    try {
      const analysis = await geminiService.analyzeMessage(
        message.text, 
        this.config.keywords
      );

      if (!analysis.shouldRespond) {
        return;
      }

      // Добавляем сообщение в историю чата
      this.addMessageToHistory(message);

      // Генерируем ответ
      await this.generateAndSendResponse(message.chatId);

    } catch (error) {
      console.error('Error handling new message:', error);
    }
  }

  private addMessageToHistory(message: {
    text: string;
    sender: 'user' | 'other';
    timestamp: number;
    chatId: string;
  }): void {
    const chatId = message.chatId;
    if (!this.chatSessions.has(chatId)) {
      this.chatSessions.set(chatId, []);
    }

    const chatHistory = this.chatSessions.get(chatId)!;
    const chatMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      text: message.text,
      sender: message.sender,
      timestamp: message.timestamp,
      chatId: message.chatId,
      isRead: false
    };

    chatHistory.push(chatMessage);

    // Ограничиваем историю последними 50 сообщениями
    if (chatHistory.length > 50) {
      chatHistory.splice(0, chatHistory.length - 50);
    }
  }

  private async generateAndSendResponse(chatId: string): Promise<void> {
    if (!this.currentAgent) {
      console.error('No AI agent selected');
      return;
    }

    try {
      const chatHistory = this.chatSessions.get(chatId) || [];
      const unreadMessages = chatHistory.filter(msg => 
        msg.sender === 'other' && !msg.isRead
      );

      if (unreadMessages.length === 0) {
        return;
      }

      // Генерируем ответ с fallback
      let response;
      
      try {
        // Сначала пробуем Gemini
        response = await geminiService.generateResponse(
          unreadMessages,
          this.currentAgent,
          this.getChatContext(chatId)
        );
        console.log('Ответ от Gemini:', response);
      } catch (geminiError) {
        console.log('Gemini недоступен, пробуем Hugging Face...');
        
        try {
          // Пробуем Hugging Face
          response = await huggingFaceService.generateResponse(
            unreadMessages,
            this.currentAgent,
            this.getChatContext(chatId)
          );
          console.log('Ответ от Hugging Face:', response);
        } catch (hfError) {
          console.log('Hugging Face недоступен, используем простой ИИ...');
          
          // Используем простой ИИ как fallback
          response = await simpleAIService.generateResponse(
            unreadMessages,
            this.currentAgent,
            this.getChatContext(chatId)
          );
          console.log('Ответ от простого ИИ:', response);
        }
      }

      // Отправляем ответ
      const success = await this.detector.sendMessage(response);
      
      if (success) {
        // Отмечаем сообщения как прочитанные
        unreadMessages.forEach(msg => {
          msg.isRead = true;
        });

        // Сохраняем статистику
        await this.updateStatistics(chatId, response);
      }

    } catch (error) {
      console.error('Error generating response:', error);
    }
  }

  private getChatContext(chatId: string): string {
    const chatHistory = this.chatSessions.get(chatId) || [];
    const recentMessages = chatHistory.slice(-10);
    
    return recentMessages
      .map(msg => `${msg.sender}: ${msg.text}`)
      .join('\n');
  }

  private async updateStatistics(chatId: string, response: string): Promise<void> {
    try {
      // Обновляем статистику в локальном хранилище
      const result = await chrome.storage.local.get('botStatistics');
      const currentStats = result.botStatistics || {
        totalMessages: 0,
        totalReplies: 0,
        activeChats: 0,
        averageResponseTime: 0,
        successRate: 0,
        dailyStats: []
      };

      // Обновляем статистику
      const today = new Date().toISOString().split('T')[0];
      let dailyStat = currentStats.dailyStats.find((d: any) => d.date === today);
      
      if (!dailyStat) {
        dailyStat = {
          date: today,
          messages: 0,
          replies: 0,
          responseTime: 0
        };
        currentStats.dailyStats.push(dailyStat);
      }
      
      const updatedStats = {
        ...currentStats,
        totalReplies: (currentStats.totalReplies || 0) + 1,
        totalMessages: (currentStats.totalMessages || 0) + 1,
        lastActivity: Date.now(),
        dailyStats: currentStats.dailyStats.map((d: any) => 
          d.date === today 
            ? { ...d, replies: (d.replies || 0) + 1, messages: (d.messages || 0) + 1 }
            : d
        )
      };

      await chrome.storage.local.set({ botStatistics: updatedStats });
      console.log('Statistics updated in local storage');
    } catch (error) {
      console.error('Error updating statistics:', error);
    }
  }

  private async handleMessage(request: any, sendResponse: (response: any) => void): Promise<void> {
    switch (request.action) {
      case 'getStatus':
        sendResponse({
          isEnabled: this.isEnabled,
          hasAgent: !!this.currentAgent,
          activeChats: this.chatSessions.size
        });
        break;
        
      case 'toggleBot':
        this.isEnabled = request.enabled;
        if (this.config) {
          this.config.isEnabled = this.isEnabled;
          await chrome.storage.sync.set({ botConfig: this.config });
        }
        sendResponse({ success: true });
        break;
        
      case 'sendTestMessage':
        if (request.message && this.currentAgent) {
          try {
            const response = await geminiService.generateResponse(
              [{ 
                id: 'test', 
                text: request.message, 
                sender: 'other', 
                timestamp: Date.now(), 
                chatId: 'test',
                isRead: false 
              }],
              this.currentAgent
            );
            sendResponse({ success: true, response });
          } catch (error) {
            sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        } else {
          sendResponse({ success: false, error: 'No agent or message provided' });
        }
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  }
}

// Инициализируем бота
new SnapchatBot();
