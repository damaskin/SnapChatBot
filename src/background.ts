import { firebaseService } from './services/firebase';
import { BotConfig, FirebaseConfig, GeminiConfig, AIAgent } from './types';

class BackgroundService {
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      console.log('Background: Начинаем инициализацию background service');
      
      // Инициализируем Firebase при запуске
      await this.loadFirebaseConfig();
      
      // Устанавливаем слушатели
      this.setupListeners();
      
      this.isInitialized = true;
      console.log('Background: Background service initialized successfully');
    } catch (error) {
      console.error('Background: Failed to initialize background service:', error);
    }
  }

  private async loadFirebaseConfig(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['firebaseConfig', 'geminiConfig']);
      
      if (result.firebaseConfig) {
        console.log('Loading Firebase config...');
        await firebaseService.initialize(result.firebaseConfig);
        console.log('Firebase config loaded successfully');
      } else {
        console.log('No Firebase config found, using local storage for statistics');
      }
      
      if (result.geminiConfig) {
        console.log('Loading Gemini config...');
        const { geminiService } = await import('./services/gemini');
        geminiService.initialize(result.geminiConfig);
        console.log('Gemini config loaded successfully');
      } else {
        console.log('No Gemini config found, initializing with default settings');
        const { geminiService } = await import('./services/gemini');
        const defaultGeminiConfig: GeminiConfig = {
          apiKey: 'AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k',
          model: 'gemini-2.5-flash',
          maxOutputTokens: 1000,
          temperature: 0.7,
          topP: 0.95,
          topK: 40
        };
        geminiService.initialize(defaultGeminiConfig);
        console.log('Gemini initialized with default settings');
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      // Не прерываем работу расширения из-за ошибок конфигурации
    }
  }

  private setupListeners(): void {
    console.log('Background: Настраиваем слушатели...');
    
    // Слушаем установку расширения
    chrome.runtime.onInstalled.addListener((details) => {
      console.log('Background: Расширение установлено/обновлено:', details.reason);
      this.handleInstall(details);
    });

    // Слушаем сообщения от content scripts и popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Background: Получено сообщение:', request.action, 'от', sender.tab?.url || 'popup');
      this.handleMessage(request, sender, sendResponse);
      return true; // Асинхронный ответ
    });
    
    console.log('Background: Слушатели настроены успешно');

    // Слушаем изменения вкладок
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });

    // Слушаем активацию вкладок
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabActivation(activeInfo);
    });
  }

  private async handleInstall(details: chrome.runtime.InstalledDetails): Promise<void> {
    if (details.reason === 'install') {
      // Первая установка - создаем дефолтную конфигурацию
      await this.createDefaultConfig();
      
      // Открываем страницу настройки
      chrome.tabs.create({
        url: chrome.runtime.getURL('admin.html')
      });
    } else if (details.reason === 'update') {
      // Обновление - проверяем совместимость конфигурации
      await this.checkConfigCompatibility();
    }
  }

  private async createDefaultConfig(): Promise<void> {
    const defaultConfig: BotConfig = {
      isEnabled: false,
      autoReply: true,
      responseDelay: 2000,
      keywords: ['привет', 'hello', 'как дела', 'что делаешь'],
      excludedUsers: []
    };

    await chrome.storage.sync.set({
      botConfig: defaultConfig,
      isFirstRun: true
    });
  }

  private async checkConfigCompatibility(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get('botConfig');
      if (result.botConfig) {
        // Проверяем и обновляем конфигурацию при необходимости
        const config = result.botConfig as BotConfig;
        
        // Добавляем новые поля если их нет
        if (config.responseDelay === undefined) {
          config.responseDelay = 2000;
        }
        
        await chrome.storage.sync.set({ botConfig: config });
      }
    } catch (error) {
      console.error('Error checking config compatibility:', error);
    }
  }

  private async handleMessage(
    request: any, 
    sender: chrome.runtime.MessageSender, 
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      console.log('Background: Получено сообщение:', request.action, 'от', sender.tab?.url || 'unknown');
      
      switch (request.action) {
        case 'getConfig':
          const config = await this.getConfig();
          sendResponse({ success: true, config });
          break;

        case 'saveConfig':
          await this.saveConfig(request.config);
          sendResponse({ success: true });
          break;

        case 'getStatistics':
          const stats = await this.getStatistics();
          sendResponse({ success: true, statistics: stats });
          break;

        case 'testConnection':
          const connectionResult = await this.testConnections();
          sendResponse({ success: true, result: connectionResult });
          break;

         case 'testGemini': {
           console.log('Background: Получен запрос testGemini с конфигурацией:', request.config);
           const geminiResult = await this.testGeminiConnection(request.config);
           console.log('Background: Результат тестирования Gemini:', geminiResult);
           sendResponse({ success: true, result: geminiResult });
           break;
         }

         case 'testHuggingFace': {
           const hfResult = await this.testHuggingFaceConnection(request.config);
           sendResponse({ success: true, result: hfResult });
           break;
         }

        case 'exportData':
          const exportData = await this.exportData();
          sendResponse({ success: true, data: exportData });
          break;

        case 'importData':
          await this.importData(request.data);
          sendResponse({ success: true });
          break;

        case 'createAgent':
          await this.createAgent(request.agent);
          sendResponse({ success: true });
          break;

        case 'getAgents':
          const agents = await this.getAgents();
          sendResponse({ success: true, agents });
          break;

        case 'updateAgent':
          await this.updateAgent(request.agent);
          sendResponse({ success: true });
          break;

        case 'deleteAgent':
          await this.deleteAgent(request.agentId);
          sendResponse({ success: true });
          break;

        case 'toggleAgent': {
          const isActive = await this.toggleAgent(request.agentId);
          sendResponse({ success: true, isActive });
          break;
        }

        case 'toggleBot': {
          const isEnabled = typeof request.isEnabled === 'boolean'
            ? request.isEnabled
            : request.enabled;

          if (typeof isEnabled !== 'boolean') {
            throw new Error('Invalid bot toggle state');
          }

          await this.toggleBot(isEnabled);
          sendResponse({ success: true, isEnabled });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleTabUpdate(
    tabId: number, 
    changeInfo: chrome.tabs.TabChangeInfo, 
    tab: chrome.tabs.Tab
  ): Promise<void> {
    // Проверяем, загрузилась ли страница Snapchat
    if (changeInfo.status === 'complete' && tab.url) {
      if (this.isSnapchatUrl(tab.url)) {
        // Инжектируем content script если нужно
        await this.ensureContentScript(tabId);
      }
    }
  }

  private async handleTabActivation(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url && this.isSnapchatUrl(tab.url)) {
        // Обновляем статус бота для активной вкладки
        await this.updateBotStatus(activeInfo.tabId);
      }
    } catch (error) {
      console.error('Error handling tab activation:', error);
    }
  }

  private isSnapchatUrl(url: string): boolean {
    return url.includes('web.snapchat.com') || url.includes('app.snapchat.com');
  }

  private async ensureContentScript(tabId: number): Promise<void> {
    try {
      // Проверяем, загружен ли content script
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => (window as any).snapchatBotLoaded
      });

      if (!results[0]?.result) {
        // Инжектируем content script
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
      }
    } catch (error) {
      console.error('Error injecting content script:', error);
    }
  }

  private async updateBotStatus(tabId: number): Promise<void> {
    try {
      const result = await chrome.storage.sync.get('botConfig');
      const config = result.botConfig as BotConfig;
      
      if (config) {
        await chrome.tabs.sendMessage(tabId, {
          action: 'updateStatus',
          isEnabled: config.isEnabled
        });
      }
    } catch (error) {
      console.error('Error updating bot status:', error);
    }
  }

  private async getConfig(): Promise<any> {
    const result = await chrome.storage.sync.get([
      'botConfig',
      'firebaseConfig',
      'geminiConfig'
    ]);
    return result;
  }

  private async saveConfig(config: any): Promise<void> {
    if (config?.botConfig && config.botConfig.selectedAgentId === null) {
      delete config.botConfig.selectedAgentId;
    }

    await chrome.storage.sync.set(config);

    if (config?.geminiConfig) {
      const { geminiService } = await import('./services/gemini');
      geminiService.initialize(config.geminiConfig);
    }
  }

  private async updateStatistics(update: any): Promise<void> {
    try {
      const result = await chrome.storage.local.get('botStatistics');
      const currentStats = result.botStatistics || {
        totalMessages: 0,
        totalReplies: 0,
        activeChats: 0,
        averageResponseTime: 0,
        successRate: 0,
        dailyStats: [],
        queueLength: 0,
        totalErrors: 0,
        lastMessageAt: 0,
        lastResponseAt: 0,
        lastError: null
      };

      // Обновляем статистику
      const updatedStats = {
        ...currentStats,
        ...update,
        lastUpdated: Date.now()
      };

      await chrome.storage.local.set({ botStatistics: updatedStats });
      console.log('Statistics updated in local storage');
    } catch (error) {
      console.error('Error updating statistics:', error);
    }
  }

  private async getStatistics(): Promise<any> {
    try {
      // Сначала пробуем Firebase
      try {
        const firebaseStats = await firebaseService.getStatistics();
        if (firebaseStats) {
          console.log('Loading statistics from Firebase');
          return firebaseStats;
        }
      } catch (firebaseError) {
        console.log('Firebase statistics failed, trying local storage:', firebaseError instanceof Error ? firebaseError.message : 'Unknown error');
      }

      // Fallback на локальное хранение
      const result = await chrome.storage.local.get('botStatistics');
      
      if (result.botStatistics) {
        console.log('Loading statistics from local storage');
        return result.botStatistics;
      }
      
      // Возвращаем дефолтную статистику
      const defaultStats = {
        totalMessages: 0,
        totalReplies: 0,
        activeChats: 0,
        averageResponseTime: 0,
        successRate: 0,
        dailyStats: [],
        queueLength: 0,
        totalErrors: 0,
        lastMessageAt: 0,
        lastResponseAt: 0,
        lastError: null
      };
      
      // Сохраняем дефолтную статистику
      await chrome.storage.local.set({ botStatistics: defaultStats });
      
      return defaultStats;
    } catch (error) {
      console.error('Error getting statistics:', error);
      // Возвращаем дефолтную статистику при ошибке
      return {
        totalMessages: 0,
        totalReplies: 0,
        activeChats: 0,
        averageResponseTime: 0,
        successRate: 0,
        dailyStats: [],
        queueLength: 0,
        totalErrors: 0,
        lastMessageAt: 0,
        lastResponseAt: 0,
        lastError: null
      };
    }
  }

  private async testConnections(): Promise<{
    firebase: boolean;
    gemini: boolean;
  }> {
    const result = { firebase: false, gemini: false };

    try {
      // Тестируем Firebase
      const firebaseResult = await chrome.storage.sync.get('firebaseConfig');
      if (firebaseResult.firebaseConfig) {
        result.firebase = true;
      }
    } catch (error) {
      console.error('Firebase connection test failed:', error);
    }

    try {
      // Тестируем Gemini
      const geminiResult = await chrome.storage.sync.get('geminiConfig');
      if (geminiResult.geminiConfig?.apiKey) {
        result.gemini = true;
      }
    } catch (error) {
      console.error('Gemini connection test failed:', error);
    }

    return result;
  }

   private async testGeminiConnection(config?: GeminiConfig): Promise<boolean> {
     try {
       console.log('Background: Начинаем тестирование Gemini с конфигурацией:', config);
       
       const { geminiService } = await import('./services/gemini');
       console.log('Background: Gemini сервис импортирован');

       let effectiveConfig: GeminiConfig | null = null;

       if (config?.apiKey) {
         effectiveConfig = config;
         console.log('Background: Используем переданную конфигурацию');
       } else {
         const storedConfig = await chrome.storage.sync.get('geminiConfig');
         if (storedConfig.geminiConfig) {
           effectiveConfig = storedConfig.geminiConfig as GeminiConfig;
           console.log('Background: Используем сохраненную конфигурацию');
         }
       }

       if (!effectiveConfig) {
         effectiveConfig = {
           apiKey: 'AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k',
           model: 'gemini-2.5-flash',
           maxOutputTokens: 1000,
           temperature: 0.7,
           topP: 0.95,
           topK: 40
         };
         console.log('Background: Используем конфигурацию по умолчанию');
       }

       console.log('Background: Инициализируем Gemini сервис с конфигурацией:', effectiveConfig);
       // Инициализируем сервис с конфигурацией
       geminiService.initialize(effectiveConfig);
       
       console.log('Background: Тестируем подключение к Gemini API');
       // Тестируем подключение
       const result = await geminiService.testConnection();
       console.log('Background: Результат тестирования Gemini:', result);
       
       return result;
     } catch (error) {
       console.error('Background: Gemini test failed:', error);
       return false;
     }
   }

   private async testHuggingFaceConnection(config?: any): Promise<boolean> {
     try {
       const { huggingFaceService } = await import('./services/huggingface');

       if (!config) {
         const storedConfig = await chrome.storage.sync.get('huggingFaceConfig');
         config = storedConfig.huggingFaceConfig;
       }

       if (!config?.apiKey) {
         console.error('Hugging Face API key not provided');
         return false;
       }

       huggingFaceService.initialize(config);
       return await huggingFaceService.testConnection();
     } catch (error) {
       console.error('Hugging Face test failed:', error);
       return false;
     }
   }

  private async exportData(): Promise<any> {
    const result = await chrome.storage.sync.get(null);
    return {
      timestamp: Date.now(),
      version: chrome.runtime.getManifest().version,
      data: result
    };
  }

  private async importData(data: any): Promise<void> {
    if (data && data.data) {
      await chrome.storage.sync.set(data.data);
    } else {
      throw new Error('Invalid data format');
    }
  }

  private async persistAgents(agents: AIAgent[]): Promise<void> {
    await chrome.storage.sync.set({ agents });
    await this.syncSelectedAgentFromAgents(agents);
  }

  private async syncSelectedAgentFromAgents(agents: AIAgent[]): Promise<void> {
    const activeAgent = agents.find(agent => agent.isActive);
    await this.updateSelectedAgentId(activeAgent ? activeAgent.id : null);
  }

  private async updateSelectedAgentId(agentId: string | null): Promise<void> {
    const result = await chrome.storage.sync.get('botConfig');
    const existingConfig = result.botConfig as BotConfig | undefined;

    const botConfig: BotConfig = existingConfig ?? {
      isEnabled: false,
      autoReply: true,
      responseDelay: 2000,
      keywords: [],
      excludedUsers: []
    };

    if (agentId) {
      botConfig.selectedAgentId = agentId;
    } else {
      delete botConfig.selectedAgentId;
    }

    await chrome.storage.sync.set({ botConfig });
  }

  // Методы для работы с агентами
  private async createAgent(agentData: Omit<AIAgent, 'id'>): Promise<void> {
    const agent: AIAgent = {
      ...agentData,
      id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    const result = await chrome.storage.sync.get('agents');
    const agents: AIAgent[] = result.agents || [];

    const shouldActivate = agent.isActive || agents.length === 0;
    const timestamp = Date.now();

    const updatedAgents = agents.map(existingAgent => {
      if (shouldActivate && existingAgent.isActive) {
        return { ...existingAgent, isActive: false, updatedAt: timestamp };
      }
      return existingAgent;
    });

    updatedAgents.push({
      ...agent,
      isActive: shouldActivate,
      updatedAt: timestamp
    });

    await this.persistAgents(updatedAgents);
    console.log('Agent created:', agent.name, 'Active:', shouldActivate);
  }

  private async getAgents(): Promise<AIAgent[]> {
    const result = await chrome.storage.sync.get('agents');
    return result.agents || [];
  }

  private async updateAgent(agent: AIAgent): Promise<void> {
    const result = await chrome.storage.sync.get('agents');
    const agents: AIAgent[] = result.agents || [];
    const index = agents.findIndex(a => a.id === agent.id);

    if (index !== -1) {
      agents[index] = { ...agent, updatedAt: Date.now() };
      await this.persistAgents(agents);
      console.log('Agent updated:', agent.name);
    }
  }

  private async deleteAgent(agentId: string): Promise<void> {
    const result = await chrome.storage.sync.get('agents');
    const agents: AIAgent[] = result.agents || [];
    const filteredAgents = agents.filter(a => a.id !== agentId);

    await this.persistAgents(filteredAgents);
    console.log('Agent deleted:', agentId);
  }

  private async toggleAgent(agentId: string): Promise<boolean> {
    const result = await chrome.storage.sync.get('agents');
    const agents: AIAgent[] = result.agents || [];
    const targetAgent = agents.find(a => a.id === agentId);

    if (!targetAgent) {
      throw new Error('Agent not found');
    }

    const shouldActivate = !targetAgent.isActive;

    const updatedAgents = agents.map(agent => {
      if (agent.id === agentId) {
        return { ...agent, isActive: shouldActivate, updatedAt: Date.now() };
      }

      if (shouldActivate && agent.isActive) {
        return { ...agent, isActive: false, updatedAt: Date.now() };
      }

      return agent;
    });

    await this.persistAgents(updatedAgents);
    console.log('Agent toggled:', targetAgent.name, 'Active:', shouldActivate);

    return shouldActivate;
  }

  private async toggleBot(isEnabled: boolean): Promise<void> {
    const result = await chrome.storage.sync.get('botConfig');
    const existingConfig = result.botConfig as BotConfig | undefined;
    const config: BotConfig = existingConfig
      ? { ...existingConfig }
      : {
        isEnabled,
        autoReply: true,
        responseDelay: 2000,
        keywords: [],
        excludedUsers: []
      };

    config.isEnabled = isEnabled;

    await chrome.storage.sync.set({ botConfig: config });
    console.log('Bot toggled:', isEnabled ? 'enabled' : 'disabled');
  }
}

// Инициализируем background service
new BackgroundService();
