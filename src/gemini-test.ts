import { GeminiConfig } from './types';
import { geminiService } from './services/gemini';

class GeminiTestController {
  private logs: Array<{ timestamp: string; level: string; message: string }> = [];
  private isConnected = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.addLog('info', 'Инициализация системы тестирования Gemini');
      await this.loadConfiguration();
      this.setupEventListeners();
      this.addLog('info', 'Система тестирования готова к работе');
    } catch (error) {
      this.addLog('error', `Ошибка инициализации: ${error}`);
    }
  }

  private async loadConfiguration(): Promise<void> {
    try {
      // Загружаем конфигурацию из background script
      const response = await this.sendMessage({ action: 'getConfig' });
      
      if (response.success && response.config) {
        const config = response.config;
        
        // Отображаем конфигурацию
        this.updateConfigDisplay(config);
        this.addLog('info', 'Конфигурация загружена успешно');
      } else {
        // Используем настройки по умолчанию
        const defaultConfig = {
          apiKey: 'AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k',
          model: 'gemini-1.5-flash',
          maxOutputTokens: 1000,
          temperature: 0.7,
          topP: 0.95,
          topK: 40
        };
        
        this.updateConfigDisplay({ geminiConfig: defaultConfig });
        this.addLog('info', 'Используется конфигурация по умолчанию');
      }
    } catch (error) {
      this.addLog('error', `Ошибка загрузки конфигурации: ${error}`);
    }
  }

  private updateConfigDisplay(config: any): void {
    const geminiConfig = config.geminiConfig || {
      apiKey: 'AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k',
      model: 'gemini-1.5-flash',
      maxOutputTokens: 1000,
      temperature: 0.7,
      topP: 0.95,
      topK: 40
    };

    document.getElementById('apiKeyDisplay')!.textContent = 
      geminiConfig.apiKey ? `${geminiConfig.apiKey.substring(0, 20)}...` : 'Не установлен';
    document.getElementById('modelDisplay')!.textContent = geminiConfig.model || 'Не установлен';
    document.getElementById('maxTokensDisplay')!.textContent = geminiConfig.maxOutputTokens?.toString() || 'Не установлен';
    document.getElementById('temperatureDisplay')!.textContent = geminiConfig.temperature?.toString() || 'Не установлен';
    document.getElementById('topPDisplay')!.textContent = geminiConfig.topP?.toString() || 'Не установлен';
    document.getElementById('topKDisplay')!.textContent = geminiConfig.topK?.toString() || 'Не установлен';
  }

  private setupEventListeners(): void {
    // Тест подключения
    document.getElementById('testConnection')?.addEventListener('click', () => {
      this.testConnection();
    });

    // Тест сообщения
    document.getElementById('sendTestMessage')?.addEventListener('click', () => {
      this.sendTestMessage();
    });

    // Очистка логов
    document.getElementById('clearLogs')?.addEventListener('click', () => {
      this.clearLogs();
    });

    // Очистка ответа
    document.getElementById('clearResponse')?.addEventListener('click', () => {
      this.clearResponse();
    });
  }

  private async testConnection(): Promise<void> {
    try {
      this.updateConnectionStatus('pending', 'Тестирование подключения...');
      this.addLog('info', 'Начинаем тест подключения к Gemini API');

      // Проверяем, что Chrome extension доступен
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        this.addLog('error', '❌ Chrome extension API недоступен');
        this.updateConnectionStatus('error', 'Chrome extension API недоступен');
        return;
      }

      this.addLog('info', '✅ Chrome extension API доступен');

      const config = {
        apiKey: 'AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k',
        model: 'gemini-1.5-flash',
        maxOutputTokens: 1000,
        temperature: 0.7,
        topP: 0.95,
        topK: 40
      };

      this.addLog('info', `📤 Отправляем запрос в background script с конфигурацией: ${JSON.stringify(config)}`);

      const response = await this.sendMessage({
        action: 'testGemini',
        config: config
      });

      this.addLog('info', `📥 Получен ответ от background script: ${JSON.stringify(response)}`);

      if (response.success && response.result) {
        this.isConnected = true;
        this.updateConnectionStatus('success', 'Подключение успешно!');
        this.addLog('info', '✅ Подключение к Gemini API установлено');
      } else {
        this.addLog('warning', '⚠️ Background script не ответил, пробуем прямое подключение к API');
        
        // Пробуем прямое подключение к Gemini API
        const directResult = await this.testDirectConnection(config);
        
        if (directResult) {
          this.isConnected = true;
          this.updateConnectionStatus('success', 'Прямое подключение успешно!');
          this.addLog('info', '✅ Прямое подключение к Gemini API установлено');
        } else {
          this.isConnected = false;
          this.updateConnectionStatus('error', 'Ошибка подключения');
          this.addLog('error', `❌ Ошибка подключения: ${response.error || 'Неизвестная ошибка'}`);
        }
      }
    } catch (error) {
      this.isConnected = false;
      this.updateConnectionStatus('error', 'Ошибка подключения');
      this.addLog('error', `❌ Исключение при тестировании: ${error}`);
    }
  }

  private async sendTestMessage(): Promise<void> {
    if (!this.isConnected) {
      this.addLog('warning', '⚠️ Сначала выполните тест подключения');
      return;
    }

    try {
      const message = (document.getElementById('testMessage') as HTMLTextAreaElement).value.trim();
      
      if (!message) {
        this.addLog('warning', '⚠️ Введите тестовое сообщение');
        return;
      }

      this.updateResponseStatus('pending', 'Генерация ответа...');
      this.addLog('info', `📤 Отправляем тестовое сообщение: "${message}"`);

      // Создаем тестового агента
      const testAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        personality: 'дружелюбный и полезный',
        systemPrompt: 'Ты - тестовый ИИ агент для проверки работы Gemini API.',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Создаем тестовое сообщение
      const testMessage = {
        id: 'test-message',
        text: message,
        sender: 'other' as const,
        timestamp: Date.now(),
        chatId: 'test-chat',
        isRead: false
      };

      this.addLog('info', '🤖 Инициализируем Gemini сервис...');
      
      // Инициализируем Gemini сервис
      const geminiConfig: GeminiConfig = {
        apiKey: 'AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k',
        model: 'gemini-1.5-flash',
        maxOutputTokens: 1000,
        temperature: 0.7,
        topP: 0.95,
        topK: 40
      };

      geminiService.initialize(geminiConfig);
      this.addLog('info', '✅ Gemini сервис инициализирован');

      this.addLog('info', '🧠 Генерируем ответ через Gemini...');
      const startTime = Date.now();
      
      const response = await geminiService.generateResponse(
        [testMessage],
        testAgent,
        'Тестовый контекст чата'
      );

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      this.addLog('info', `✅ Ответ получен за ${responseTime}мс`);
      this.addLog('info', `📥 Ответ: "${response}"`);

      // Отображаем ответ
      document.getElementById('responseDisplay')!.textContent = response;
      this.updateResponseStatus('success', `Ответ получен (${responseTime}мс)`);

    } catch (error) {
      this.updateResponseStatus('error', 'Ошибка генерации');
      this.addLog('error', `❌ Ошибка генерации ответа: ${error}`);
      
      // Отображаем ошибку
      document.getElementById('responseDisplay')!.textContent = 
        `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`;
    }
  }

  private updateConnectionStatus(status: 'pending' | 'success' | 'error', text: string): void {
    const indicator = document.getElementById('connectionStatus')!;
    const textElement = document.getElementById('connectionText')!;
    
    indicator.className = `status-indicator status-${status}`;
    textElement.textContent = text;
  }

  private updateResponseStatus(status: 'pending' | 'success' | 'error', text: string): void {
    const indicator = document.getElementById('responseStatus')!;
    const textElement = document.getElementById('responseText')!;
    
    indicator.className = `status-indicator status-${status}`;
    textElement.textContent = text;
  }

  private addLog(level: 'info' | 'error' | 'warning', message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.push({ timestamp, level, message });
    
    const logContainer = document.getElementById('logContainer')!;
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    logEntry.innerHTML = `
      <span class="log-timestamp">[${timestamp}]</span>
      <span class="log-level-${level}">[${level.toUpperCase()}]</span>
      <span>${message}</span>
    `;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  private clearLogs(): void {
    this.logs = [];
    document.getElementById('logContainer')!.innerHTML = `
      <div class="log-entry">
        <span class="log-timestamp">[${new Date().toLocaleTimeString()}]</span>
        <span class="log-level-info">[INFO]</span>
        <span>Логи очищены</span>
      </div>
    `;
  }

  private clearResponse(): void {
    document.getElementById('responseDisplay')!.textContent = 'Ответ появится здесь...';
    this.updateResponseStatus('pending', 'Готов к генерации ответа');
  }

  private async testDirectConnection(config: any): Promise<boolean> {
    try {
      this.addLog('info', '🔗 Тестируем прямое подключение к Gemini API');
      
      const payload = {
        contents: [{
          parts: [{
            text: 'Hello, this is a test connection to Gemini API.'
          }]
        }],
        generationConfig: {
          temperature: config.temperature || 0.7,
          topK: config.topK || 40,
          topP: config.topP || 0.95,
          maxOutputTokens: config.maxOutputTokens || 1000,
        }
      };

      const headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey
      };

      this.addLog('info', `📡 Отправляем запрос к Gemini API: ${config.model}`);
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      this.addLog('info', `📥 Получен ответ от Gemini API: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        this.addLog('info', `✅ Gemini API ответил успешно: ${JSON.stringify(data).substring(0, 100)}...`);
        return true;
      } else {
        const errorText = await response.text();
        this.addLog('error', `❌ Gemini API ошибка: HTTP ${response.status} - ${response.statusText} - ${errorText}`);
        return false;
      }
    } catch (error) {
      this.addLog('error', `❌ Ошибка прямого подключения: ${error}`);
      return false;
    }
  }

  private async sendMessage(message: any): Promise<any> {
    return new Promise((resolve) => {
      this.addLog('info', `🔄 Отправляем сообщение: ${JSON.stringify(message)}`);
      
      // Добавляем таймаут
      const timeout = setTimeout(() => {
        this.addLog('error', '⏰ Таймаут ожидания ответа от background script (10 секунд)');
        resolve({ success: false, error: 'Timeout waiting for response' });
      }, 10000);

      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          this.addLog('error', `❌ Ошибка Chrome runtime: ${chrome.runtime.lastError.message}`);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          this.addLog('info', `📥 Получен ответ: ${JSON.stringify(response)}`);
          resolve(response || { success: false, error: 'No response' });
        }
      });
    });
  }
}

// Инициализируем контроллер тестирования
new GeminiTestController();
