import { BotConfig, AIAgent } from './types';

class PopupController {
  private config: BotConfig | null = null;
  private agents: AIAgent[] = [];
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.loadConfig();
      await this.loadAgents();
      this.setupEventListeners();
      this.updateUI();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      this.showError('Ошибка инициализации');
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getConfig' });
      if (response.success) {
        this.config = response.config.botConfig;
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  private async loadAgents(): Promise<void> {
    try {
      // Загружаем агентов из Firebase через background script
      const response = await this.sendMessage({ action: 'getAgents' });
      if (response.success) {
        this.agents = response.agents;
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  }

  private setupEventListeners(): void {
    // Переключатель бота
    const botToggle = document.getElementById('botToggle') as HTMLInputElement;
    botToggle.addEventListener('change', (e) => {
      this.toggleBot((e.target as HTMLInputElement).checked);
    });

    // Кнопка настроек
    const openAdminBtn = document.getElementById('openAdmin');
    openAdminBtn?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('admin.html') });
    });

    // Кнопка теста
    const testBotBtn = document.getElementById('testBot');
    testBotBtn?.addEventListener('click', () => {
      this.toggleTestSection();
    });

    // Отправка тестового сообщения
    const sendTestBtn = document.getElementById('sendTest');
    const testMessageInput = document.getElementById('testMessage') as HTMLInputElement;
    
    sendTestBtn?.addEventListener('click', () => {
      this.sendTestMessage(testMessageInput.value);
    });

    testMessageInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendTestMessage(testMessageInput.value);
      }
    });

    // Ссылки в футере
    document.getElementById('helpLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/your-repo/help' });
    });

    document.getElementById('feedbackLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/your-repo/issues' });
    });
  }

  private async toggleBot(enabled: boolean): Promise<void> {
    try {
      const response = await this.sendMessage({
        action: 'toggleBot',
        isEnabled: enabled
      });

      if (response.success) {
        if (!this.config) {
          this.config = {
            isEnabled: enabled,
            autoReply: true,
            responseDelay: 2000,
            keywords: [],
            excludedUsers: []
          };
        } else {
          this.config.isEnabled = enabled;
        }

        this.updateStatusIndicator(enabled);
        this.showNotification(
          enabled ? 'Бот включен' : 'Бот выключен'
        );
      } else {
        throw new Error(response.error || 'Неизвестная ошибка');
      }
    } catch (error) {
      console.error('Failed to toggle bot:', error);
      this.showError('Ошибка переключения бота');
      
      // Возвращаем переключатель в исходное состояние
      const botToggle = document.getElementById('botToggle') as HTMLInputElement;
      botToggle.checked = !enabled;
    }
  }

  private toggleTestSection(): void {
    const testSection = document.getElementById('testSection');
    const testBotBtn = document.getElementById('testBot');
    
    if (testSection && testBotBtn) {
      const isVisible = testSection.style.display !== 'none';
      testSection.style.display = isVisible ? 'none' : 'block';
      testBotBtn.textContent = isVisible ? '🧪 Тест' : '❌ Закрыть';
    }
  }

  private async sendTestMessage(message: string): Promise<void> {
    if (!message.trim()) {
      this.showError('Введите тестовое сообщение');
      return;
    }

    const testResponse = document.getElementById('testResponse');
    if (testResponse) {
      testResponse.innerHTML = '<div class="loading">Генерация ответа...</div>';
    }

    try {
      const response = await this.sendMessage({
        action: 'sendTestMessage',
        message: message.trim()
      });

      if (testResponse) {
        if (response.success) {
          testResponse.innerHTML = `
            <div class="response-success">
              <strong>Ответ ИИ:</strong><br>
              ${response.response}
            </div>
          `;
        } else {
          testResponse.innerHTML = `
            <div class="response-error">
              <strong>Ошибка:</strong> ${response.error}
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('Test message failed:', error);
      if (testResponse) {
        testResponse.innerHTML = `
          <div class="response-error">
            <strong>Ошибка:</strong> Не удалось отправить тестовое сообщение
          </div>
        `;
      }
    }
  }

  private updateUI(): void {
    this.updateStatusIndicator();
    this.updateBotToggle();
    this.updateAgentInfo();
    this.updateStatistics();
  }

  private updateStatusIndicator(enabled?: boolean): void {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusDot = statusIndicator?.querySelector('.status-dot');
    const statusText = statusIndicator?.querySelector('.status-text');
    
    if (statusIndicator && statusDot && statusText) {
      const isEnabled = enabled !== undefined ? enabled : this.config?.isEnabled;
      
      if (isEnabled) {
        statusIndicator.className = 'status-indicator active';
        statusDot.className = 'status-dot active';
        statusText.textContent = 'Активен';
      } else {
        statusIndicator.className = 'status-indicator inactive';
        statusDot.className = 'status-dot inactive';
        statusText.textContent = 'Неактивен';
      }
    }
  }

  private updateBotToggle(): void {
    const botToggle = document.getElementById('botToggle') as HTMLInputElement;
    if (botToggle && this.config) {
      botToggle.checked = this.config.isEnabled;
    }
  }

  private updateAgentInfo(): void {
    const currentAgentEl = document.getElementById('currentAgent');
    if (currentAgentEl) {
      const selectedAgent = this.agents.find(agent => 
        agent.id === this.config?.selectedAgentId
      );
      
      if (selectedAgent) {
        currentAgentEl.textContent = selectedAgent.name;
        currentAgentEl.className = 'info-value active';
      } else {
        currentAgentEl.textContent = 'Не выбран';
        currentAgentEl.className = 'info-value inactive';
      }
    }
  }

  private async updateStatistics(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getStatistics' });
      if (response.success && response.statistics) {
        const stats = response.statistics;

        this.updateElement('totalMessages', stats.totalMessages || 0);
        this.updateElement('totalReplies', stats.totalReplies || 0);
        this.updateElement('activeChats', stats.activeChats || 0);
        this.updateElement('successRate', `${Math.round(stats.successRate || 0)}%`);
      }
    } catch (error) {
      console.error('Failed to update statistics:', error);
    }
  }

  private updateElement(id: string, value: string | number): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = String(value);
    }
  }

  private showNotification(message: string): void {
    // Создаем временное уведомление
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  private showError(message: string): void {
    this.showNotification(`❌ ${message}`);
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

// Инициализируем popup при загрузке
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
