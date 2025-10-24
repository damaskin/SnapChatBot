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

      const response = await this.sendMessage({
        action: 'testGemini',
        config: {
          apiKey: 'AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k',
          model: 'gemini-1.5-flash',
          maxOutputTokens: 1000,
          temperature: 0.7,
          topP: 0.95,
          topK: 40
        }
      });

      if (response.success && response.result) {
        this.isConnected = true;
        this.updateConnectionStatus('success', 'Подключение успешно!');
        this.addLog('info', '✅ Подключение к Gemini API установлено');
      } else {
        this.isConnected = false;
        this.updateConnectionStatus('error', 'Ошибка подключения');
        this.addLog('error', `❌ Ошибка подключения: ${response.error || 'Неизвестная ошибка'}`);
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

  private async sendMessage(message: any): Promise<any> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response' });
        }
      });
    });
  }
}

// Инициализируем контроллер тестирования
new GeminiTestController();
