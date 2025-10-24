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
  private processedChats: Set<string> = new Set();
  private isProcessingChats = false;
  private chatProcessingInterval: number | null = null;
  private pendingResponseQueue: Array<{ chatId: string; lastMessageTimestamp?: number; attempts?: number }> = [];
  private queueProcessingTimer: number | null = null;
  private queuedChats: Set<string> = new Set();
  private isQueueProcessing = false;
  private lastResponseTimestamp = 0;
  private rateLimitWindowStart = 0;
  private responsesInCurrentWindow = 0;
  private analysisWindowStart = 0;
  private analysisRequestsInWindow = 0;
  private analysisBlockedUntil = 0;
  private readonly RATE_LIMIT_WINDOW_MS = 60_000;
  private readonly RESPONSE_RATE_LIMIT_PER_MINUTE = 8;
  private readonly MIN_RESPONSE_INTERVAL_MS = 8_000;
  private readonly ANALYSIS_RATE_LIMIT_PER_MINUTE = 6;
  private readonly defaultExcludedUsers = ['my ai', 'team snapchat'];
  private chatMetadata: Map<string, { id: string; title?: string | null }> = new Map();

  constructor() {
    console.log('Snapchat Bot: Content script загружен на', window.location.href);
    // Устанавливаем флаг загрузки для тестирования
    (window as any).snapchatBotLoaded = true;
    this.detector = SnapchatDetector.getInstance();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      console.log('Snapchat Bot: Инициализация на', window.location.href);
      
      // Проверяем, что мы на Snapchat
      if (!this.isSnapchatPage()) {
        console.log('Snapchat Bot: Не на странице Snapchat, пропускаем инициализацию');
        return;
      }
      
      // Ждем загрузки страницы
      if (document.readyState !== 'complete') {
        console.log('Snapchat Bot: Страница еще загружается, ждем...');
        await new Promise(resolve => {
          if (document.readyState === 'complete') {
            resolve(void 0);
          } else {
            window.addEventListener('load', resolve);
          }
        });
      }
      
      // Дополнительная задержка для загрузки React компонентов
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Загружаем конфигурацию из storage
      await this.loadConfig();
      
      console.log('Snapchat Bot: Конфигурация загружена, isEnabled:', this.isEnabled);
      
      if (this.isEnabled) {
        // Инициализируем детектор
        this.detector.initialize();

        // Подписываемся на события
        this.setupEventListeners();

        console.log('Snapchat Bot: Бот активирован и готов к работе');
        this.startChatProcessing();
      } else {
        console.log('Snapchat Bot: Бот отключен в конфигурации');
      }

      console.log('Snapchat Bot: Инициализация завершена успешно');
    } catch (error) {
      console.error('Snapchat Bot: Ошибка инициализации:', error);
    }
  }

  private isSnapchatPage(): boolean {
    const isSnapchat = window.location.hostname.includes('snapchat.com') || 
                       window.location.hostname.includes('web.snapchat.com');
    
    console.log('Snapchat Bot: Проверка страницы:', {
      hostname: window.location.hostname,
      url: window.location.href,
      isSnapchat: isSnapchat
    });
    
    return isSnapchat;
  }

  private async loadConfig(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get(['botConfig', 'firebaseConfig', 'geminiConfig']);
      
      if (result.botConfig) {
        this.config = result.botConfig;
        this.isEnabled = this.config?.isEnabled || false;
      }

      if (result.geminiConfig && result.geminiConfig.apiKey) {
        // Используем сохраненную конфигурацию, но принудительно устанавливаем правильную модель
        const config = {
          ...result.geminiConfig,
          model: 'gemini-2.5-flash' // Принудительно используем правильную модель
        };
        geminiService.initialize(config);
        console.log('Gemini initialized with saved config (model updated to gemini-2.5-flash)');
      } else {
        // Инициализируем Gemini с настройками по умолчанию
        const defaultGeminiConfig = {
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

    document.addEventListener('snapchat-chat-list-change', () => {
      if (this.isEnabled) {
        this.processPendingChats();
      }
    });

    // Слушаем изменения конфигурации
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.botConfig) {
        const previousConfig = this.config;
        this.config = changes.botConfig.newValue as BotConfig | null;
        this.isEnabled = this.config?.isEnabled || false;

        const previousAgentId = previousConfig?.selectedAgentId || null;
        const nextAgentId = this.config?.selectedAgentId || null;

        const wasEnabled = previousConfig?.isEnabled || false;
        if (!wasEnabled && this.isEnabled) {
          this.startChatProcessing();
        } else if (wasEnabled && !this.isEnabled) {
          this.stopChatProcessing();
        }

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

    if (message.sender === 'user') {
      return; // Не отвечаем на свои сообщения
    }

    if (!message.text || message.text.trim().length === 0) {
      console.log('Snapchat Bot: Пропускаем пустое сообщение');
      return;
    }

    if (this.isSystemMessage(message.text)) {
      console.log('Snapchat Bot: Пропускаем системное сообщение:', message.text);
      return;
    }

    const activeChatInfo = this.detector.getActiveChatInfo();
    if (activeChatInfo) {
      this.updateChatMetadata(activeChatInfo.chatId, activeChatInfo.title);
    } else {
      this.updateChatMetadata(message.chatId);
    }

    const knownTitle = this.getKnownChatTitle(message.chatId) || activeChatInfo?.title || null;

    if (this.isChatExcluded(message.chatId) || (knownTitle && this.isChatExcluded(knownTitle))) {
      console.log('Snapchat Bot: Пропускаем чат из списка исключений:', knownTitle || message.chatId);
      return;
    }

    this.addMessageToHistory(message);

    await this.updateStatistics({
      messageReceived: true,
      activeChats: this.chatSessions.size
    });

    try {
      const shouldRespond = await this.shouldRespondToIncomingMessage(message);

      if (!shouldRespond) {
        console.log('Snapchat Bot: Решено не отвечать на сообщение', message.chatId);
        return;
      }

      const queueLength = this.enqueueChatResponse(message.chatId, message.timestamp);
      console.log('Snapchat Bot: Сообщение добавлено в очередь ответа', { chatId: message.chatId, queueLength });

      await this.updateStatistics({
        queueLength,
        activeChats: this.chatSessions.size
      });
    } catch (error) {
      console.error('Error handling new message:', error);
      await this.updateStatistics({
        lastError: error instanceof Error ? error.message : String(error),
        errorOccurred: true
      });
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
      isRead: message.sender !== 'other'
    };

    chatHistory.push(chatMessage);

    // Ограничиваем историю последними 50 сообщениями
    if (chatHistory.length > 50) {
      chatHistory.splice(0, chatHistory.length - 50);
    }
  }

  private async shouldRespondToIncomingMessage(message: {
    text: string;
    sender: 'user' | 'other';
    timestamp: number;
    chatId: string;
  }): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    const text = message.text.trim();
    const normalizedText = text.toLowerCase();
    const keywords = (this.config.keywords || []).map(keyword => keyword.toLowerCase());

    const hasKeyword = keywords.some(keyword => keyword.length > 0 && normalizedText.includes(keyword));
    const isQuestion = normalizedText.includes('?') || /\b(кто|что|когда|где|почему|зачем|как|можешь|можно|куда|сколько)\b/.test(normalizedText);
    const isGreeting = /^(привет|hi|hello|hey|здравствуй|добрый|ку|салют)/.test(normalizedText);

    if (hasKeyword || isQuestion || isGreeting) {
      return true;
    }

    if (!this.canUseGeminiAnalysis()) {
      return false;
    }

    this.registerAnalysisRequest();

    try {
      const analysis = await geminiService.analyzeMessage(message.text, this.config.keywords);
      return !!analysis.shouldRespond;
    } catch (error) {
      console.error('Error analyzing message with Gemini:', error);
      this.handleGeminiRateLimit(error);
      await this.updateStatistics({
        lastError: error instanceof Error ? error.message : String(error),
        errorOccurred: true
      });
      return false;
    }
  }

  private async generateAndSendResponse(
    chatId: string,
    lastMessageTimestamp?: number
  ): Promise<{ success: boolean; responseTimeMs?: number; error?: string; shouldRetry?: boolean; retryAfterMs?: number }> {
    if (!this.currentAgent) {
      console.error('No AI agent selected');
      return { success: false, error: 'No AI agent selected' };
    }

    try {
      const chatHistory = this.chatSessions.get(chatId) || [];
      const unreadMessages = chatHistory.filter(msg =>
        msg.sender === 'other' && !msg.isRead
      );

      if (unreadMessages.length === 0) {
        return { success: false, error: 'No unread messages' };
      }

      const latestTimestamp = lastMessageTimestamp ?? unreadMessages[unreadMessages.length - 1].timestamp ?? Date.now();

      let response: string | null = null;

      try {
        response = await geminiService.generateResponse(
          unreadMessages,
          this.currentAgent,
          this.getChatContext(chatId)
        );
        console.log('Ответ от Gemini:', response);
      } catch (geminiError) {
        this.handleGeminiRateLimit(geminiError);
        console.log('Gemini недоступен, пробуем Hugging Face...');

        try {
          response = await huggingFaceService.generateResponse(
            unreadMessages,
            this.currentAgent,
            this.getChatContext(chatId)
          );
          console.log('Ответ от Hugging Face:', response);
        } catch (hfError) {
          console.log('Hugging Face недоступен, используем простой ИИ...');

          response = await simpleAIService.generateResponse(
            unreadMessages,
            this.currentAgent,
            this.getChatContext(chatId)
          );
          console.log('Ответ от простого ИИ:', response);
        }
      }

      if (!response) {
        return { success: false, error: 'Не удалось сгенерировать ответ' };
      }

      const delay = this.config?.responseDelay || 0;
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const success = await this.detector.sendMessage(response);

      if (success) {
        unreadMessages.forEach(msg => {
          msg.isRead = true;
        });

        const responseTimeMs = Date.now() - latestTimestamp;
        this.processedChats.add(this.normalizeIdentifier(chatId));

        return { success: true, responseTimeMs };
      }

      return { success: false, error: 'Не удалось отправить сообщение' };
    } catch (error) {
      console.error('Error generating response:', error);
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry = this.isRateLimitError(error);
      const retryAfterMs = shouldRetry ? this.extractRetryAfterMs(message) : undefined;

      if (shouldRetry && retryAfterMs) {
        this.analysisBlockedUntil = Date.now() + retryAfterMs;
      }

      return {
        success: false,
        error: message,
        shouldRetry,
        retryAfterMs
      };
    }
  }

  private getChatContext(chatId: string): string {
    const chatHistory = this.chatSessions.get(chatId) || [];
    const recentMessages = chatHistory.slice(-10);

    return recentMessages
      .map(msg => `${msg.sender}: ${msg.text}`)
      .join('\n');
  }

  private canUseGeminiAnalysis(): boolean {
    const now = Date.now();

    if (now < this.analysisBlockedUntil) {
      return false;
    }

    if (now - this.analysisWindowStart >= this.RATE_LIMIT_WINDOW_MS) {
      this.analysisWindowStart = now;
      this.analysisRequestsInWindow = 0;
    }

    return this.analysisRequestsInWindow < this.ANALYSIS_RATE_LIMIT_PER_MINUTE;
  }

  private registerAnalysisRequest(): void {
    const now = Date.now();

    if (now - this.analysisWindowStart >= this.RATE_LIMIT_WINDOW_MS) {
      this.analysisWindowStart = now;
      this.analysisRequestsInWindow = 0;
    }

    this.analysisRequestsInWindow += 1;
  }

  private getExcludedIdentifiers(): string[] {
    const configExcluded = this.config?.excludedUsers ?? [];
    const combined = [...this.defaultExcludedUsers, ...configExcluded];

    return combined
      .map(value => this.normalizeIdentifier(value))
      .filter(value => value.length > 0);
  }

  private normalizeIdentifier(value: string | undefined | null): string {
    if (!value) {
      return '';
    }

    return value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, ' ').replace(/\s+/g, '').trim();
  }

  private isChatExcluded(identifier: string | undefined | null): boolean {
    const normalized = this.normalizeIdentifier(identifier);

    if (!normalized) {
      return false;
    }

    return this.getExcludedIdentifiers().includes(normalized);
  }

  private updateChatMetadata(chatId: string | undefined | null, title?: string | undefined | null): void {
    const normalizedId = this.normalizeIdentifier(chatId);
    const normalizedTitle = this.normalizeIdentifier(title);

    if (normalizedId) {
      const existing = this.chatMetadata.get(normalizedId) || { id: chatId ?? '', title: title ?? null };
      this.chatMetadata.set(normalizedId, {
        id: chatId ?? existing.id,
        title: title ?? existing.title ?? null
      });
    }

    if (normalizedTitle) {
      const existingByTitle = this.chatMetadata.get(normalizedTitle) || { id: chatId ?? '', title: title ?? null };
      this.chatMetadata.set(normalizedTitle, {
        id: chatId ?? existingByTitle.id,
        title: title ?? existingByTitle.title ?? null
      });
    }
  }

  private getKnownChatTitle(identifier: string | undefined | null): string | null {
    const normalized = this.normalizeIdentifier(identifier);

    if (!normalized) {
      return null;
    }

    const metadata = this.chatMetadata.get(normalized);
    return metadata?.title ?? null;
  }

  private enqueueChatResponse(chatId: string, lastMessageTimestamp?: number): number {
    const normalizedId = this.normalizeIdentifier(chatId);

    if (this.queuedChats.has(normalizedId)) {
      return this.pendingResponseQueue.length;
    }

    this.pendingResponseQueue.push({ chatId, lastMessageTimestamp, attempts: 0 });
    this.queuedChats.add(normalizedId);

    if (this.queueProcessingTimer === null && !this.isQueueProcessing) {
      this.scheduleQueueProcessing(0);
    }

    return this.pendingResponseQueue.length;
  }

  private scheduleQueueProcessing(delay = 0): void {
    if (this.queueProcessingTimer !== null) {
      window.clearTimeout(this.queueProcessingTimer);
    }

    this.queueProcessingTimer = window.setTimeout(() => {
      this.queueProcessingTimer = null;
      this.processResponseQueue().catch(error => {
        console.error('Snapchat Bot: Ошибка обработки очереди ответов:', error);
      });
    }, Math.max(delay, 0));
  }

  private async processResponseQueue(): Promise<void> {
    if (this.isQueueProcessing) {
      return;
    }

    this.isQueueProcessing = true;

    try {
      if (!this.isEnabled) {
        this.pendingResponseQueue = [];
        this.queuedChats.clear();
        await this.updateStatistics({ queueLength: 0 });
        return;
      }

      if (this.pendingResponseQueue.length === 0) {
        await this.updateStatistics({ queueLength: 0 });
        return;
      }

      const now = Date.now();

      if (now - this.rateLimitWindowStart >= this.RATE_LIMIT_WINDOW_MS) {
        this.rateLimitWindowStart = now;
        this.responsesInCurrentWindow = 0;
      }

      if (this.responsesInCurrentWindow >= this.RESPONSE_RATE_LIMIT_PER_MINUTE) {
        const waitTime = Math.max(this.RATE_LIMIT_WINDOW_MS - (now - this.rateLimitWindowStart), this.MIN_RESPONSE_INTERVAL_MS);
        console.log('Snapchat Bot: Достигнут лимит ответов, ожидаем', waitTime, 'мс');
        this.scheduleQueueProcessing(waitTime);
        await this.updateStatistics({ queueLength: this.pendingResponseQueue.length });
        return;
      }

      if (this.lastResponseTimestamp > 0) {
        const timeSinceLast = now - this.lastResponseTimestamp;
        if (timeSinceLast < this.MIN_RESPONSE_INTERVAL_MS) {
          const waitTime = this.MIN_RESPONSE_INTERVAL_MS - timeSinceLast;
          this.scheduleQueueProcessing(waitTime);
          await this.updateStatistics({ queueLength: this.pendingResponseQueue.length });
          return;
        }
      }

      const task = this.pendingResponseQueue.shift();

      if (!task) {
        await this.updateStatistics({ queueLength: 0 });
        return;
      }

      const normalizedId = this.normalizeIdentifier(task.chatId);
      this.queuedChats.delete(normalizedId);

      const result = await this.generateAndSendResponse(task.chatId, task.lastMessageTimestamp);

      if (result.success) {
        this.responsesInCurrentWindow += 1;
        this.lastResponseTimestamp = Date.now();

        await this.updateStatistics({
          replySent: true,
          responseTimeMs: result.responseTimeMs,
          queueLength: this.pendingResponseQueue.length,
          activeChats: this.chatSessions.size
        });

        if (this.pendingResponseQueue.length > 0) {
          this.scheduleQueueProcessing(this.MIN_RESPONSE_INTERVAL_MS);
        } else {
          await this.updateStatistics({ queueLength: 0 });
        }

        return;
      }

      const attempts = (task.attempts ?? 0) + 1;
      const errorMessage = result.error || 'Неизвестная ошибка';
      const shouldRetry = result.shouldRetry && attempts < 3;

      if (shouldRetry) {
        const retryDelay = Math.max(result.retryAfterMs ?? this.RATE_LIMIT_WINDOW_MS, this.MIN_RESPONSE_INTERVAL_MS);
        this.pendingResponseQueue.push({ ...task, attempts });
        this.queuedChats.add(normalizedId);
        await this.updateStatistics({
          queueLength: this.pendingResponseQueue.length,
          lastError: errorMessage,
          errorOccurred: true
        });
        console.log('Snapchat Bot: Повторная попытка ответа через', retryDelay, 'мс');
        this.scheduleQueueProcessing(retryDelay);
        return;
      }

      await this.updateStatistics({
        queueLength: this.pendingResponseQueue.length,
        lastError: errorMessage,
        errorOccurred: true
      });

      this.processedChats.add(normalizedId);

      if (this.pendingResponseQueue.length > 0) {
        this.scheduleQueueProcessing(this.MIN_RESPONSE_INTERVAL_MS);
      } else {
        await this.updateStatistics({ queueLength: 0 });
      }
    } finally {
      this.isQueueProcessing = false;
    }
  }

  private handleGeminiRateLimit(error: unknown): void {
    if (!this.isRateLimitError(error)) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const retryAfterMs = this.extractRetryAfterMs(message) ?? this.RATE_LIMIT_WINDOW_MS;
    this.analysisBlockedUntil = Date.now() + retryAfterMs;
    console.warn('Snapchat Bot: Получен ответ о превышении лимита, блокируем анализ на', retryAfterMs, 'мс');
  }

  private isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();

    return normalized.includes('429') ||
           normalized.includes('too many requests') ||
           normalized.includes('resource_exhausted') ||
           normalized.includes('quota');
  }

  private extractRetryAfterMs(message: string): number | undefined {
    const retryInfoMatch = message.match(/retry(?: in)?\s+([0-9.]+)s/i);
    if (retryInfoMatch && retryInfoMatch[1]) {
      const seconds = parseFloat(retryInfoMatch[1]);
      if (!Number.isNaN(seconds)) {
        return Math.ceil(seconds * 1000);
      }
    }

    const retryDelayMatch = message.match(/retryDelay"?\s*:?\s*"?(\d+)s"?/i);
    if (retryDelayMatch && retryDelayMatch[1]) {
      const seconds = parseInt(retryDelayMatch[1], 10);
      if (!Number.isNaN(seconds)) {
        return seconds * 1000;
      }
    }

    return undefined;
  }

  private async updateStatistics(update: {
    messageReceived?: boolean;
    replySent?: boolean;
    responseTimeMs?: number;
    queueLength?: number;
    lastError?: string | null;
    errorOccurred?: boolean;
    activeChats?: number;
  }): Promise<void> {
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

      let totalMessages = currentStats.totalMessages || 0;
      let totalReplies = currentStats.totalReplies || 0;
      let totalErrors = currentStats.totalErrors || 0;
      let averageResponseTime = currentStats.averageResponseTime || 0;

      if (update.messageReceived) {
        totalMessages += 1;
      }

      if (update.replySent) {
        const repliesBefore = currentStats.totalReplies || 0;
        totalReplies += 1;

        if (update.responseTimeMs !== undefined) {
          const totalResponseTime = averageResponseTime * repliesBefore;
          averageResponseTime = Math.round((totalResponseTime + update.responseTimeMs) / (repliesBefore + 1));
        }
      }

      if (update.errorOccurred) {
        totalErrors += 1;
      }

      const queueLength = update.queueLength ?? currentStats.queueLength ?? 0;
      const lastError = update.lastError === undefined
        ? (currentStats.lastError ?? null)
        : update.lastError;
      const successRate = totalMessages > 0
        ? Math.round((totalReplies / totalMessages) * 100)
        : 0;

      const today = new Date().toISOString().split('T')[0];
      const dailyStats = [...(currentStats.dailyStats || [])];
      let dailyStat = dailyStats.find((d: any) => d.date === today);

      if (!dailyStat) {
        dailyStat = { date: today, messages: 0, replies: 0, responseTime: 0 };
        dailyStats.push(dailyStat);
      }

      if (update.messageReceived) {
        dailyStat.messages = (dailyStat.messages || 0) + 1;
      }

      if (update.replySent) {
        const repliesBefore = dailyStat.replies || 0;
        dailyStat.replies = repliesBefore + 1;

        if (update.responseTimeMs !== undefined) {
          const totalDailyResponseTime = (dailyStat.responseTime || 0) * repliesBefore;
          dailyStat.responseTime = Math.round((totalDailyResponseTime + update.responseTimeMs) / (repliesBefore + 1));
        }
      }

      const updatedStats = {
        ...currentStats,
        totalMessages,
        totalReplies,
        activeChats: update.activeChats ?? currentStats.activeChats ?? this.chatSessions.size,
        averageResponseTime,
        successRate,
        dailyStats,
        queueLength,
        totalErrors,
        lastMessageAt: update.messageReceived ? Date.now() : (currentStats.lastMessageAt || 0),
        lastResponseAt: update.replySent ? Date.now() : (currentStats.lastResponseAt || 0),
        lastError
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
        if (this.isEnabled) {
          this.startChatProcessing();
        } else {
          this.stopChatProcessing();
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

  private startChatProcessing(): void {
    if (this.chatProcessingInterval !== null) {
      window.clearInterval(this.chatProcessingInterval);
    }

    this.processedChats.clear();
    this.pendingResponseQueue = [];
    this.queuedChats.clear();
    this.responsesInCurrentWindow = 0;
    this.lastResponseTimestamp = 0;
    this.rateLimitWindowStart = 0;
    this.analysisWindowStart = 0;
    this.analysisRequestsInWindow = 0;
    this.analysisBlockedUntil = 0;

    if (this.queueProcessingTimer !== null) {
      window.clearTimeout(this.queueProcessingTimer);
      this.queueProcessingTimer = null;
    }

    void this.updateStatistics({ queueLength: 0, activeChats: this.chatSessions.size });

    this.chatProcessingInterval = window.setInterval(() => {
      this.processPendingChats();
    }, 15000);

    this.processPendingChats();
  }

  private stopChatProcessing(): void {
    if (this.chatProcessingInterval !== null) {
      window.clearInterval(this.chatProcessingInterval);
      this.chatProcessingInterval = null;
    }

    if (this.queueProcessingTimer !== null) {
      window.clearTimeout(this.queueProcessingTimer);
      this.queueProcessingTimer = null;
    }

    this.pendingResponseQueue = [];
    this.queuedChats.clear();
    void this.updateStatistics({ queueLength: 0, activeChats: this.chatSessions.size });
  }

  private shouldSkipChat(chatId: string, title: string): boolean {
    return this.isChatExcluded(chatId) || this.isChatExcluded(title);
  }

  private async processPendingChats(): Promise<void> {
    if (!this.isEnabled || this.isProcessingChats) {
      return;
    }

    this.isProcessingChats = true;

    try {
      const chatItems = this.detector.getChatListItems();

      for (const chatItem of chatItems) {
        const normalizedListId = this.normalizeIdentifier(chatItem.chatId);

        if (this.processedChats.has(normalizedListId) || this.queuedChats.has(normalizedListId)) {
          continue;
        }

        this.updateChatMetadata(chatItem.chatId, chatItem.title);

        if (this.shouldSkipChat(chatItem.chatId, chatItem.title)) {
          this.processedChats.add(normalizedListId);
          continue;
        }

        await this.detector.openChat(chatItem.element, { chatId: chatItem.chatId, title: chatItem.title });
        const isLoaded = await this.detector.waitForChatToLoad();

        if (!isLoaded) {
          continue;
        }

        const activeChatInfo = this.detector.getActiveChatInfo();
        if (activeChatInfo) {
          this.updateChatMetadata(activeChatInfo.chatId, activeChatInfo.title);
        }

        const messages = await this.detector.collectChatMessages(50);

        if (messages.length === 0) {
          this.processedChats.add(normalizedListId);
          continue;
        }

        const lastMessage = messages[messages.length - 1];
        const resolvedChatId = lastMessage?.chatId || activeChatInfo?.chatId || chatItem.chatId;

        const resolvedTitle = chatItem.title || activeChatInfo?.title || this.getKnownChatTitle(resolvedChatId);
        this.updateChatMetadata(resolvedChatId, resolvedTitle);

        this.syncChatHistory(resolvedChatId, messages);

        if (!this.hasUnansweredMessage(resolvedChatId)) {
          this.processedChats.add(normalizedListId);
          this.processedChats.add(this.normalizeIdentifier(resolvedChatId));
          continue;
        }

        if (lastMessage && lastMessage.sender === 'other') {
          const shouldRespond = await this.shouldRespondToIncomingMessage({
            text: lastMessage.text,
            sender: 'other',
            timestamp: lastMessage.timestamp || Date.now(),
            chatId: resolvedChatId
          });

          if (!shouldRespond) {
            this.processedChats.add(normalizedListId);
            continue;
          }

          const queueLength = this.enqueueChatResponse(resolvedChatId, lastMessage.timestamp);
          await this.updateStatistics({
            queueLength,
            activeChats: this.chatSessions.size
          });
        } else {
          this.processedChats.add(this.normalizeIdentifier(resolvedChatId));
          this.processedChats.add(normalizedListId);
        }
      }
    } catch (error) {
      console.error('Snapchat Bot: Ошибка при обработке чатов:', error);
    } finally {
      this.isProcessingChats = false;
    }
  }

  private syncChatHistory(chatId: string, messages: Array<{
    text: string;
    sender: 'user' | 'other';
    timestamp: number;
    chatId: string;
  }>): void {
    const existingHistory = this.chatSessions.get(chatId) || [];
    const updatedHistory = [...existingHistory];

    messages.forEach((message, index) => {
      if (!message.text) {
        return;
      }

      const duplicate = updatedHistory.find(existingMessage =>
        existingMessage.sender === message.sender &&
        existingMessage.text === message.text &&
        Math.abs(existingMessage.timestamp - message.timestamp) < 5000
      );

      if (!duplicate) {
        updatedHistory.push({
          id: `${chatId}-${message.timestamp || Date.now()}-${index}`,
          text: message.text,
          sender: message.sender,
          timestamp: message.timestamp || Date.now(),
          chatId,
          isRead: message.sender !== 'other'
        });
      }
    });

    updatedHistory.sort((a, b) => a.timestamp - b.timestamp);

    if (updatedHistory.length > 50) {
      updatedHistory.splice(0, updatedHistory.length - 50);
    }

    this.chatSessions.set(chatId, updatedHistory);
  }

  private hasUnansweredMessage(chatId: string): boolean {
    const history = this.chatSessions.get(chatId) || [];

    if (history.length === 0) {
      return false;
    }

    const lastIncoming = [...history].reverse().find(message => message.sender === 'other');
    if (!lastIncoming) {
      return false;
    }

    const lastOutgoing = [...history].reverse().find(message => message.sender === 'user');

    if (!lastOutgoing) {
      return true;
    }

    return lastIncoming.timestamp >= lastOutgoing.timestamp;
  }

  private isSystemMessage(text: string): boolean {
    const systemMessages = [
      'Ask My AI',
      'Click to install',
      'to always have access',
      'Click the Camera to send Snaps',
      'Create Bitmoji',
      'No Stories',
      'Spotlight',
      'Snapchat',
      'Welcome to Snapchat',
      'Get started',
      'Install',
      'Download',
      'Update',
      'New feature',
      'Try it now',
      'Typing...',
      'just now',
      'now',
      'typing',
      'online',
      'offline',
      'last seen',
      'seen',
      'delivered',
      'sent'
    ];
    
    const lowerText = text.toLowerCase().trim();
    return systemMessages.some(msg => lowerText.includes(msg.toLowerCase())) || 
           text.length < 3 || 
           /^[.,!?]+$/.test(text) ||
           /^[A-Z\s]+$/.test(text) ||
           /^(now|typing|online|offline|seen|delivered|sent)$/i.test(lowerText);
  }
}

// Инициализируем бота
new SnapchatBot();
