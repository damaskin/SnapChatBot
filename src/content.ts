import { SnapchatDetector } from './utils/snapchat-detector';
import { ChatMessage, BotConfig, AIAgent } from './types';
import { geminiService } from './services/gemini';
import { huggingFaceService } from './services/huggingface';
import { simpleAIService } from './services/simple-ai';
import { firebaseService } from './services/firebase';

type TestPipelineStep =
  | 'detectUnread'
  | 'openChat'
  | 'readMessages'
  | 'sendToAI'
  | 'insertReply'
  | 'sendMessage'
  | 'fullPipeline';

interface TestPipelineContext {
  chatId?: string;
  title?: string | null;
  messages?: ChatMessage[];
  aiResponse?: string;
}

interface TestStepResult {
  success: boolean;
  logs: string[];
  error?: string;
  step?: TestPipelineStep;
  data?: Record<string, unknown>;
}

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
  private testContext: TestPipelineContext = {};
  private readonly logPrefix = 'Snapchat Bot:';

  constructor() {
    console.log(`${this.logPrefix} Content script загружен на`, window.location.href);
    // Устанавливаем флаг загрузки для тестирования
    (window as any).snapchatBotLoaded = true;
    this.detector = SnapchatDetector.getInstance();
    this.initialize();
  }

  private log(message: string, details?: Record<string, unknown>): void {
    if (details && Object.keys(details).length > 0) {
      console.log(`${this.logPrefix} ${message}`, details);
    } else {
      console.log(`${this.logPrefix} ${message}`);
    }
  }

  private async initialize(): Promise<void> {
    try {
      this.log('Инициализация', { url: window.location.href });
      
      // Проверяем, что мы на Snapchat
      if (!this.isSnapchatPage()) {
        this.log('Не на странице Snapchat, пропускаем инициализацию');
        return;
      }
      
      // Ждем загрузки страницы
      if (document.readyState !== 'complete') {
        this.log('Страница еще загружается, ждем...');
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
      
      this.log('Конфигурация загружена', { isEnabled: this.isEnabled });

      if (this.isEnabled) {
        // Инициализируем детектор
        this.detector.initialize();

        // Подписываемся на события
        this.setupEventListeners();

        this.log('Бот активирован и готов к работе');
        this.startChatProcessing();
      } else {
        this.log('Бот отключен в конфигурации');
      }

      this.log('Инициализация завершена успешно');
    } catch (error) {
      console.error(`${this.logPrefix} Ошибка инициализации:`, error);
    }
  }

  private isSnapchatPage(): boolean {
    const isSnapchat = window.location.hostname.includes('snapchat.com') ||
                       window.location.hostname.includes('web.snapchat.com');

    this.log('Проверка страницы', {
      hostname: window.location.hostname,
      url: window.location.href,
      isSnapchat
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
        this.log('Gemini инициализирован сохраненной конфигурацией (модель обновлена до gemini-2.5-flash)');
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
        this.log('Gemini инициализирован настройками по умолчанию');
      }

      if (result.firebaseConfig) {
        await firebaseService.initialize(result.firebaseConfig);
      }

      // Загружаем активного агента
      if (this.config?.selectedAgentId) {
        await this.loadAgent(this.config.selectedAgentId);
      }
    } catch (error) {
      console.error(`${this.logPrefix} Failed to load config:`, error);
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
          console.warn(`${this.logPrefix} Не удалось загрузить агента из Firebase, используем локальное хранилище:`, firebaseError);
        }
      }

      this.currentAgent = agent;
    } catch (error) {
      console.error(`${this.logPrefix} Failed to load agent:`, error);
      this.currentAgent = null;
    }
  }

  private setupEventListeners(): void {
    // Слушаем новые сообщения
    document.addEventListener('snapchat-new-message', (event: any) => {
      this.handleNewMessage(event.detail);
    });

    document.addEventListener('snapchat-chat-list-change', (event: any) => {
      const detail = event?.detail;

      if (detail) {
        if (detail.chatId || detail.title) {
          this.updateChatMetadata(detail.chatId, detail.title);
        }

        const normalizedId = this.normalizeIdentifier(detail?.chatId);
        if (normalizedId) {
          this.processedChats.delete(normalizedId);
        }

        const normalizedTitle = this.normalizeIdentifier(detail?.title);
        if (normalizedTitle) {
          this.processedChats.delete(normalizedTitle);
        }
      }

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
      this.log('Пропускаем пустое сообщение');
      return;
    }

    if (this.isSystemMessage(message.text)) {
      this.log('Пропускаем системное сообщение', { text: message.text });
      return;
    }

    const activeChatInfo = this.detector.getActiveChatInfo();
    if (activeChatInfo) {
      this.updateChatMetadata(activeChatInfo.chatId, activeChatInfo.title);
    } else {
      this.updateChatMetadata(message.chatId, null);
    }

    const knownTitle = this.getKnownChatTitle(message.chatId) || activeChatInfo?.title || null;

    if (this.isChatExcluded(message.chatId) || (knownTitle && this.isChatExcluded(knownTitle))) {
      this.log('Пропускаем чат из списка исключений', { chatId: message.chatId, title: knownTitle });
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
        this.log('Решено не отвечать на сообщение', { chatId: message.chatId });
        return;
      }

      const queueLength = this.enqueueChatResponse(message.chatId, message.timestamp);
      this.log('Сообщение добавлено в очередь ответа', { chatId: message.chatId, queueLength });

      await this.updateStatistics({
        queueLength,
        activeChats: this.chatSessions.size
      });
    } catch (error) {
      console.error(`${this.logPrefix} Ошибка обработки входящего сообщения:`, error);
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

  private addBotResponseToHistory(chatId: string, text: string): void {
    const history = this.chatSessions.get(chatId) || [];
    const responseMessage: ChatMessage = {
      id: `${chatId}-bot-${Date.now()}`,
      text,
      sender: 'bot',
      timestamp: Date.now(),
      chatId,
      isRead: true
    };

    history.push(responseMessage);

    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }

    this.chatSessions.set(chatId, history);
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

    if (this.config.autoReply === false) {
      this.log('Автоответ отключен в настройках, пропускаем сообщение', { chatId: message.chatId });
      return false;
    }

    const text = message.text.trim();
    const normalizedText = text.toLowerCase();
    const keywords = (this.config.keywords || []).map(keyword => keyword.toLowerCase());

    const hasKeyword = keywords.some(keyword => keyword.length > 0 && normalizedText.includes(keyword));
    const isQuestion = normalizedText.includes('?') || /\b(кто|что|когда|где|почему|зачем|как|можешь|можно|куда|сколько)\b/.test(normalizedText);
    const isGreeting = /^(привет|hi|hello|hey|здравствуй|добрый|ку|салют)/.test(normalizedText);

    if (hasKeyword || isQuestion || isGreeting) {
      this.log('Решено ответить по эвристике', {
        chatId: message.chatId,
        hasKeyword,
        isQuestion,
        isGreeting
      });
      return true;
    }

    if (!this.canUseGeminiAnalysis()) {
      this.log('Gemini анализ недоступен, отвечаем по умолчанию', { chatId: message.chatId });
      return true;
    }

    this.registerAnalysisRequest();

    try {
      const analysis = await geminiService.analyzeMessage(message.text, this.config.keywords);
      this.log('Результат анализа Gemini', {
        chatId: message.chatId,
        shouldRespond: analysis.shouldRespond,
        sentiment: analysis.sentiment
      });

      if (analysis.shouldRespond === false) {
        this.log('Gemini рекомендует не отвечать на сообщение', { chatId: message.chatId });
      }

      return analysis.shouldRespond ?? true;
    } catch (error) {
      console.error(`${this.logPrefix} Error analyzing message with Gemini:`, error);
      this.handleGeminiRateLimit(error);
      await this.updateStatistics({
        lastError: error instanceof Error ? error.message : String(error),
        errorOccurred: true
      });
      this.log('Ошибка анализа Gemini, отвечаем по умолчанию', { chatId: message.chatId });
      return true;
    }
  }

  private async generateAndSendResponse(
    chatId: string,
    lastMessageTimestamp?: number
  ): Promise<{ success: boolean; responseTimeMs?: number; error?: string; shouldRetry?: boolean; retryAfterMs?: number }> {
    if (!this.currentAgent) {
      console.error(`${this.logPrefix} No AI agent selected`);
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

      const recentConversation = chatHistory.slice(-50);
      const conversationForAI: ChatMessage[] = recentConversation.map(message => ({
        ...message,
        sender: message.sender === 'other' ? 'user' : 'bot'
      }));

      this.log('Отправляем историю в Gemini', {
        chatId,
        totalMessages: conversationForAI.length,
        unreadMessages: unreadMessages.length
      });

      const latestTimestamp = lastMessageTimestamp ?? unreadMessages[unreadMessages.length - 1].timestamp ?? Date.now();

      let response: string | null = null;

      try {
        response = await geminiService.generateResponse(
          conversationForAI,
          this.currentAgent,
          this.getChatContext(chatId)
        );
        this.log('Получен ответ от Gemini', { chatId, hasResponse: !!response });
      } catch (geminiError) {
        this.handleGeminiRateLimit(geminiError);
        this.log('Gemini недоступен, пробуем Hugging Face', { chatId });

        try {
          response = await huggingFaceService.generateResponse(
            conversationForAI,
            this.currentAgent,
            this.getChatContext(chatId)
          );
          this.log('Получен ответ от Hugging Face', { chatId, hasResponse: !!response });
        } catch (hfError) {
          this.log('Hugging Face недоступен, используем простой ИИ', { chatId });

          response = await simpleAIService.generateResponse(
            conversationForAI,
            this.currentAgent,
            this.getChatContext(chatId)
          );
          this.log('Получен ответ от простого ИИ', { chatId, hasResponse: !!response });
        }
      }

      if (!response) {
        this.log('Не удалось получить ответ ни от одной модели', { chatId });
        return { success: false, error: 'Не удалось сгенерировать ответ' };
      }

      const delay = this.config?.responseDelay || 0;
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      this.log('Пробуем отправить сообщение', { chatId, textLength: response.length });

      const success = await this.detector.sendMessage(response);

      if (success) {
        unreadMessages.forEach(msg => {
          msg.isRead = true;
        });

        const responseTimeMs = Date.now() - latestTimestamp;
        this.processedChats.add(this.normalizeIdentifier(chatId));

        this.addBotResponseToHistory(chatId, response);
        this.log('Сообщение успешно отправлено', { chatId, responseTimeMs });

        return { success: true, responseTimeMs };
      }

      this.log('Не удалось отправить сообщение', { chatId });
      return { success: false, error: 'Не удалось отправить сообщение' };
    } catch (error) {
      console.error(`${this.logPrefix} Ошибка генерации ответа:`, error);
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

    const normalized = combined
      .map(value => this.normalizeIdentifier(value))
      .filter(value => value.length > 0);

    return Array.from(new Set(normalized));
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

    const excluded = this.getExcludedIdentifiers();

    return excluded.some(identifier =>
      normalized === identifier || (identifier.length > 0 && normalized.includes(identifier))
    );
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
        console.error(`${this.logPrefix} Ошибка обработки очереди ответов:`, error);
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
        this.log('Достигнут лимит ответов, устанавливаем паузу', { waitTime });
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
        this.log('Повторная попытка ответа запланирована', { chatId: task.chatId, retryDelay });
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
    console.warn(`${this.logPrefix} Получен ответ о превышении лимита, блокируем анализ на ${retryAfterMs} мс`);
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

      case 'runTestStep':
        this.runTestStep(request.step as TestPipelineStep)
          .then((result) => {
            sendResponse(result);
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            sendResponse({ success: false, error: message, logs: [`❌ Ошибка выполнения шага: ${message}`] });
          });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  }

  private resetTestContext(): void {
    this.testContext = {};
  }

  private async runTestStep(step: TestPipelineStep): Promise<TestStepResult> {
    if (step === 'fullPipeline') {
      this.resetTestContext();
      const aggregateLogs: string[] = [];
      const steps: TestPipelineStep[] = ['detectUnread', 'openChat', 'readMessages', 'sendToAI', 'insertReply', 'sendMessage'];

      for (const currentStep of steps) {
        const result = await this.executeTestStep(currentStep);
        aggregateLogs.push(...result.logs);

        if (!result.success) {
          return { ...result, logs: aggregateLogs, step: currentStep };
        }
      }

      aggregateLogs.push('✅ Полный сценарий выполнен успешно.');
      return { success: true, logs: aggregateLogs, step };
    }

    return this.executeTestStep(step);
  }

  private async executeTestStep(step: TestPipelineStep): Promise<TestStepResult> {
    switch (step) {
      case 'detectUnread':
        return this.testDetectUnreadChats();
      case 'openChat':
        return this.testOpenChat();
      case 'readMessages':
        return this.testReadMessages();
      case 'sendToAI':
        return this.testSendContextToAI();
      case 'insertReply':
        return this.testInsertAIResponse();
      case 'sendMessage':
        return this.testSendPreparedMessage();
      default:
        return {
          success: false,
          logs: ['❌ Неизвестный шаг тестового сценария.'],
          error: 'Unknown test step'
        };
    }
  }

  private async testDetectUnreadChats(): Promise<TestStepResult> {
    const logs: string[] = ['ℹ️ Поиск чатов с новыми сообщениями...'];
    const chatItems = this.detector.getChatListItems();

    if (chatItems.length === 0) {
      logs.push('❌ Не удалось обнаружить список чатов.');
      return { success: false, logs, error: 'Chat list not found' };
    }

    const processedItems = chatItems
      .map((item) => {
        this.updateChatMetadata(item.chatId, item.title);
        return item;
      })
      .filter((item) => {
        const skip = this.shouldSkipChat(item.chatId, item.title);
        if (skip) {
          logs.push(`⚠️ Чат пропущен (в исключениях): ${item.title || item.chatId}`);
        }
        return !skip;
      });

    if (processedItems.length === 0) {
      logs.push('❌ Нет доступных чатов для обработки.');
      return { success: false, logs, error: 'No available chats' };
    }

    const prioritized = [...processedItems].sort((a, b) => {
      if (a.hasUnread !== b.hasUnread) {
        return Number(b.hasUnread) - Number(a.hasUnread);
      }

      const aTime = a.lastActivityTime ?? 0;
      const bTime = b.lastActivityTime ?? 0;
      return bTime - aTime;
    });

    const target = prioritized[0];

    this.testContext.chatId = target.chatId;
    this.testContext.title = target.title;
    this.testContext.messages = undefined;
    this.testContext.aiResponse = undefined;

    logs.push(`✅ Найден чат для обработки: ${target.title || target.chatId}${target.hasUnread ? ' (есть новые сообщения)' : ''}`);

    return {
      success: true,
      logs,
      data: {
        chatId: target.chatId,
        title: target.title,
        hasUnread: target.hasUnread,
        lastActivityTime: target.lastActivityTime ?? null
      }
    };
  }

  private async testOpenChat(): Promise<TestStepResult> {
    const logs: string[] = ['ℹ️ Открываем выбранный чат...'];
    const chatId = this.testContext.chatId;
    const title = this.testContext.title;

    if (!chatId && !title) {
      logs.push('❌ Сначала выполните поиск чата с новыми сообщениями.');
      return { success: false, logs, error: 'Chat not selected' };
    }

    const chatItems = this.detector.getChatListItems();
    const normalizedChatId = this.normalizeIdentifier(chatId || '');
    const normalizedTitle = this.normalizeIdentifier(title || '');

    const target = chatItems.find((item) => {
      const itemId = this.normalizeIdentifier(item.chatId);
      const itemTitle = this.normalizeIdentifier(item.title);
      return (normalizedChatId && itemId === normalizedChatId) || (normalizedTitle && itemTitle === normalizedTitle);
    });

    if (!target) {
      logs.push('❌ Не удалось найти чат в списке. Возможно, он был обновлен.');
      return { success: false, logs, error: 'Chat element not found' };
    }

    await this.detector.openChat(target.element, { chatId: target.chatId, title: target.title });
    const isLoaded = await this.detector.waitForChatToLoad();

    if (!isLoaded) {
      logs.push('❌ Чат не загрузился за отведенное время.');
      return { success: false, logs, error: 'Chat did not load' };
    }

    const activeChatInfo = this.detector.getActiveChatInfo();
    if (activeChatInfo) {
      this.updateChatMetadata(activeChatInfo.chatId, activeChatInfo.title);
      this.testContext.chatId = activeChatInfo.chatId;
      this.testContext.title = activeChatInfo.title;
    }

    logs.push(`✅ Чат открыт: ${this.testContext.title || this.testContext.chatId || 'неизвестно'}`);

    return {
      success: true,
      logs,
      data: {
        chatId: this.testContext.chatId || chatId,
        title: this.testContext.title || title
      }
    };
  }

  private async testReadMessages(): Promise<TestStepResult> {
    const logs: string[] = ['ℹ️ Читаем сообщения из открытого диалога...'];
    const messages = await this.detector.collectChatMessages(50);

    if (messages.length === 0) {
      logs.push('❌ Не удалось получить сообщения из диалога.');
      return { success: false, logs, error: 'No messages in chat' };
    }

    const activeChatInfo = this.detector.getActiveChatInfo();
    if (activeChatInfo) {
      this.testContext.chatId = activeChatInfo.chatId;
      this.testContext.title = activeChatInfo.title;
    }

    const resolvedChatId = this.testContext.chatId || messages[messages.length - 1]?.chatId || 'unknown';
    const now = Date.now();

    const chatMessages: ChatMessage[] = messages.map((message, index) => ({
      id: `${resolvedChatId}-${message.timestamp || now}-${index}`,
      text: message.text,
      sender: message.sender === 'user' ? 'user' : 'other',
      timestamp: message.timestamp || now,
      chatId: resolvedChatId,
      isRead: message.sender !== 'other'
    }));

    this.testContext.messages = chatMessages;

    const preview = chatMessages[chatMessages.length - 1]?.text || '';
    logs.push(`✅ Получено сообщений: ${chatMessages.length}. Последнее: "${preview.slice(0, 60)}"`);

    return {
      success: true,
      logs,
      data: {
        messages: chatMessages.length,
        lastMessagePreview: preview
      }
    };
  }

  private async testSendContextToAI(): Promise<TestStepResult> {
    const logs: string[] = ['ℹ️ Отправляем контекст в Gemini...'];

    if (!this.currentAgent) {
      const selectedAgentId = this.config?.selectedAgentId;
      if (selectedAgentId) {
        await this.loadAgent(selectedAgentId);
      }
    }

    if (!this.currentAgent) {
      logs.push('❌ Не выбран активный AI агент.');
      return { success: false, logs, error: 'AI agent not configured' };
    }

    if (!this.testContext.messages || this.testContext.messages.length === 0) {
      logs.push('❌ Нет сообщений для анализа. Сначала прочитайте контекст чата.');
      return { success: false, logs, error: 'No messages to analyze' };
    }

    try {
      const response = await geminiService.generateResponse(this.testContext.messages, this.currentAgent);
      const trimmed = (response || '').trim();

      if (!trimmed) {
        logs.push('❌ Gemini вернул пустой ответ.');
        return { success: false, logs, error: 'Empty response from Gemini' };
      }

      this.testContext.aiResponse = trimmed;
      logs.push(`✅ Получен ответ ИИ (${trimmed.length} символов).`);

      return {
        success: true,
        logs,
        data: {
          responsePreview: trimmed.slice(0, 120)
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Gemini error';
      logs.push(`❌ Ошибка при обращении к Gemini: ${message}`);
      return { success: false, logs, error: message };
    }
  }

  private async testInsertAIResponse(): Promise<TestStepResult> {
    const logs: string[] = ['ℹ️ Вставляем ответ ИИ в поле сообщения...'];
    const text = (this.testContext.aiResponse || '').trim();

    if (!text) {
      logs.push('❌ Нет сгенерированного ответа для вставки.');
      return { success: false, logs, error: 'AI response is empty' };
    }

    const result = await this.detector.fillMessageInput(text);

    if (!result.success) {
      logs.push('❌ Не удалось найти или заполнить поле ввода сообщения.');
      return { success: false, logs, error: 'Failed to fill message input' };
    }

    logs.push('✅ Ответ вставлен в поле ввода.');

    return {
      success: true,
      logs,
      data: {
        length: text.length
      }
    };
  }

  private async testSendPreparedMessage(): Promise<TestStepResult> {
    const logs: string[] = ['ℹ️ Отправляем подготовленное сообщение...'];
    const text = (this.testContext.aiResponse || '').trim();

    if (!text) {
      logs.push('❌ Нет подготовленного ответа для отправки.');
      return { success: false, logs, error: 'AI response missing' };
    }

    const sent = await this.detector.sendMessage(text);

    if (!sent) {
      logs.push('❌ Не удалось отправить сообщение через интерфейс Snapchat.');
      return { success: false, logs, error: 'Failed to send message' };
    }

    logs.push('✅ Сообщение отправлено собеседнику.');

    return {
      success: true,
      logs,
      data: {
        chatId: this.testContext.chatId || null,
        title: this.testContext.title || null
      }
    };
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
    if (this.isChatExcluded(chatId) || this.isChatExcluded(title)) {
      this.log('Чат пропущен по списку исключений', { chatId, title });
      return true;
    }

    const knownTitle = this.getKnownChatTitle(chatId);
    if (knownTitle && this.isChatExcluded(knownTitle)) {
      this.log('Чат пропущен по известному названию из исключений', { chatId, title: knownTitle });
      return true;
    }

    return false;
  }

  private async processPendingChats(): Promise<void> {
    if (!this.isEnabled || this.isProcessingChats) {
      return;
    }

    this.isProcessingChats = true;

    try {
      const chatItems = this.detector.getChatListItems();
      this.log('Начинаем обход чатов', { totalChats: chatItems.length });
      const prioritizedChatItems = [...chatItems].sort((a, b) => {
        if (a.hasUnread !== b.hasUnread) {
          return Number(b.hasUnread) - Number(a.hasUnread);
        }

        const aTime = a.lastActivityTime ?? 0;
        const bTime = b.lastActivityTime ?? 0;
        return bTime - aTime;
      });

      for (const chatItem of prioritizedChatItems) {
        const normalizedListId = this.normalizeIdentifier(chatItem.chatId);
        const shouldForceProcess = chatItem.hasUnread;

        if (!shouldForceProcess && (this.processedChats.has(normalizedListId) || this.queuedChats.has(normalizedListId))) {
          continue;
        }

        if (shouldForceProcess) {
          this.processedChats.delete(normalizedListId);
          if (chatItem.title) {
            this.processedChats.delete(this.normalizeIdentifier(chatItem.title));
          }
        }

        this.updateChatMetadata(chatItem.chatId, chatItem.title);

        if (this.shouldSkipChat(chatItem.chatId, chatItem.title)) {
          this.processedChats.add(normalizedListId);
          continue;
        }

        await this.detector.openChat(chatItem.element, { chatId: chatItem.chatId, title: chatItem.title });
        const isLoaded = await this.detector.waitForChatToLoad();

        if (!isLoaded) {
          this.log('Не удалось загрузить чат', { chatId: chatItem.chatId, title: chatItem.title });
          continue;
        }

        const activeChatInfo = this.detector.getActiveChatInfo();
        if (activeChatInfo) {
          this.updateChatMetadata(activeChatInfo.chatId, activeChatInfo.title);
        }

        const messages = await this.detector.collectChatMessages(50);
        this.log('Собраны сообщения из чата', {
          chatId: activeChatInfo?.chatId || chatItem.chatId,
          collectedMessages: messages.length
        });

        if (messages.length === 0) {
          this.log('Сообщения в чате не найдены', { chatId: chatItem.chatId, title: chatItem.title });
          this.processedChats.add(normalizedListId);
          continue;
        }

        const lastMessage = messages[messages.length - 1];
        const resolvedChatId = lastMessage?.chatId || activeChatInfo?.chatId || chatItem.chatId;

        const resolvedTitle = chatItem.title || activeChatInfo?.title || this.getKnownChatTitle(resolvedChatId);
        this.updateChatMetadata(resolvedChatId, resolvedTitle);

        this.syncChatHistory(resolvedChatId, messages);
        this.log('История чата синхронизирована', {
          chatId: resolvedChatId,
          storedMessages: (this.chatSessions.get(resolvedChatId) || []).length
        });

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

          this.log('Чат выбран для ответа', {
            chatId: resolvedChatId,
            title: resolvedTitle,
            unreadMessages: messages.filter(msg => msg.sender === 'other').length
          });

          const queueLength = this.enqueueChatResponse(resolvedChatId, lastMessage.timestamp);
          this.log('Чат добавлен в очередь на ответ', { chatId: resolvedChatId, queueLength });
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
      console.error(`${this.logPrefix} Ошибка при обработке чатов:`, error);
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

  private getKnownChatTitle(chatId: string): string | null {
    const metadata = this.chatMetadata.get(chatId);
    return metadata?.title || null;
  }

  private updateChatMetadata(chatId: string, title: string | null): void {
    this.chatMetadata.set(chatId, { id: chatId, title });
  }

  private hasUnansweredMessage(chatId: string): boolean {
    const messages = this.chatSessions.get(chatId) || [];
    return messages.some(msg => msg.sender === 'other' && !msg.isRead);
  }
}

// Инициализируем бота
new SnapchatBot();
