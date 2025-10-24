import { BotConfig, FirebaseConfig, GeminiConfig, AIAgent, Statistics } from './types';
import { firebaseService } from './services/firebase';
import { geminiService } from './services/gemini';

class AdminController {
  private currentTab = 'config';
  private agents: AIAgent[] = [];
  private statistics: Statistics | null = null;
  private logs: Array<{ timestamp: number; level: string; message: string }> = [];

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.loadConfig();
      await this.loadAgents();
      await this.loadStatistics();
      this.setupEventListeners();
      this.setupTabs();
      this.updateUI();
    } catch (error) {
      console.error('Failed to initialize admin:', error);
      this.showError('Ошибка инициализации админ панели');
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getConfig' });
      if (response.success) {
        this.populateConfigForm(response.config);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  private async loadAgents(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getAgents' });
      if (response.success) {
        this.agents = response.agents;
        this.renderAgents();
        // Обновляем отображение выбранного агента после загрузки
        this.updateSelectedAgentUI();
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  }

  private async loadStatistics(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getStatistics' });
      if (response.success) {
        this.statistics = response.statistics;
        this.updateStatisticsUI();
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  }

  private setupEventListeners(): void {
    // Сохранение конфигурации
    document.getElementById('saveConfig')?.addEventListener('click', () => {
      this.saveConfig();
    });

    // Переключение бота
    document.getElementById('botEnabled')?.addEventListener('change', (e) => {
      this.toggleBot((e.target as HTMLInputElement).checked);
    });

    // Тестирование подключений
    document.getElementById('testFirebase')?.addEventListener('click', () => {
      this.testFirebaseConnection();
    });

    document.getElementById('testGemini')?.addEventListener('click', () => {
      this.testGeminiConnection();
    });


    // Управление ключевыми словами
    document.getElementById('addKeyword')?.addEventListener('click', () => {
      this.addKeyword();
    });

    document.getElementById('keywordInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addKeyword();
      }
    });

    // Управление исключенными пользователями
    document.getElementById('addExcludedUser')?.addEventListener('click', () => {
      this.addExcludedUser();
    });

    document.getElementById('excludedUserInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addExcludedUser();
      }
    });

    // Создание агента
    document.getElementById('createAgent')?.addEventListener('click', () => {
      this.showAgentModal();
    });

    document.getElementById('saveAgent')?.addEventListener('click', () => {
      this.saveAgent();
    });

    document.getElementById('cancelAgent')?.addEventListener('click', () => {
      this.hideAgentModal();
    });

    document.getElementById('modal-close')?.addEventListener('click', () => {
      this.hideAgentModal();
    });

    // Управление логами
    document.getElementById('clearLogs')?.addEventListener('click', () => {
      this.clearLogs();
    });

    document.getElementById('exportLogs')?.addEventListener('click', () => {
      this.exportLogs();
    });

    // Температура Gemini
    const temperatureSlider = document.getElementById('geminiTemperature') as HTMLInputElement;
    const temperatureValue = document.querySelector('.range-value');
    if (temperatureSlider && temperatureValue) {
      temperatureSlider.addEventListener('input', (e) => {
        temperatureValue.textContent = (e.target as HTMLInputElement).value;
      });
    }

    // Top P Gemini
    const topPSlider = document.getElementById('geminiTopP') as HTMLInputElement;
    const topPValue = document.querySelectorAll('.range-value')[1];
    if (topPSlider && topPValue) {
      topPSlider.addEventListener('input', (e) => {
        topPValue.textContent = (e.target as HTMLInputElement).value;
      });
    }
  }

  private setupTabs(): void {
    const tabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        if (tabId) {
          this.switchTab(tabId);
        }
      });
    });
  }

  private switchTab(tabId: string): void {
    // Убираем активный класс со всех табов
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    // Активируем выбранный таб
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(tabId)?.classList.add('active');

    this.currentTab = tabId;

    // Загружаем данные для таба
    if (tabId === 'statistics') {
      this.loadStatistics();
    } else if (tabId === 'logs') {
      this.loadLogs();
    }
  }

  private populateConfigForm(config: any): void {
    // Основные настройки
    const botEnabled = document.getElementById('botEnabled') as HTMLInputElement;
    const autoReply = document.getElementById('autoReply') as HTMLInputElement;
    const responseDelay = document.getElementById('responseDelay') as HTMLInputElement;

    if (config.botConfig) {
      botEnabled.checked = config.botConfig.isEnabled || false;
      autoReply.checked = config.botConfig.autoReply || false;
      responseDelay.value = config.botConfig.responseDelay || 2000;
    }

    // Firebase настройки
    if (config.firebaseConfig) {
      (document.getElementById('firebaseApiKey') as HTMLInputElement).value = config.firebaseConfig.apiKey || '';
      (document.getElementById('firebaseAuthDomain') as HTMLInputElement).value = config.firebaseConfig.authDomain || '';
      (document.getElementById('firebaseProjectId') as HTMLInputElement).value = config.firebaseConfig.projectId || '';
      (document.getElementById('firebaseStorageBucket') as HTMLInputElement).value = config.firebaseConfig.storageBucket || '';
      (document.getElementById('firebaseMessagingSenderId') as HTMLInputElement).value = config.firebaseConfig.messagingSenderId || '';
      (document.getElementById('firebaseAppId') as HTMLInputElement).value = config.firebaseConfig.appId || '';
    }

    // Gemini настройки - устанавливаем по умолчанию
    const geminiApiKey = document.getElementById('geminiApiKey') as HTMLInputElement;
    const geminiModel = document.getElementById('geminiModel') as HTMLSelectElement;
    const geminiMaxTokens = document.getElementById('geminiMaxTokens') as HTMLInputElement;
    const geminiTemperature = document.getElementById('geminiTemperature') as HTMLInputElement;
    const geminiTopP = document.getElementById('geminiTopP') as HTMLInputElement;
    const geminiTopK = document.getElementById('geminiTopK') as HTMLInputElement;

    if (geminiApiKey) geminiApiKey.value = config.geminiConfig?.apiKey || 'AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k';
    if (geminiModel) geminiModel.value = config.geminiConfig?.model || 'gemini-2.5-flash';
    if (geminiMaxTokens) geminiMaxTokens.value = (config.geminiConfig?.maxOutputTokens || 1000).toString();
    if (geminiTemperature) geminiTemperature.value = (config.geminiConfig?.temperature || 0.7).toString();
    if (geminiTopP) geminiTopP.value = (config.geminiConfig?.topP || 0.8).toString();
    if (geminiTopK) geminiTopK.value = (config.geminiConfig?.topK || 40).toString();

    // Ключевые слова
    this.renderKeywords(config.botConfig?.keywords || []);
    
    // Исключенные пользователи
    this.renderExcludedUsers(config.botConfig?.excludedUsers || []);
  }

  private async saveConfig(): Promise<void> {
    try {
      const config = this.collectConfigData();
      const response = await this.sendMessage({ 
        action: 'saveConfig', 
        config 
      });

      if (response.success) {
        this.showSuccess('Настройки сохранены');
      } else {
        throw new Error(response.error || 'Ошибка сохранения');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      this.showError('Ошибка сохранения настроек');
    }
  }

  private collectConfigData(): any {
    const activeAgentId = this.getSelectedAgentId();

    return {
      botConfig: {
        isEnabled: (document.getElementById('botEnabled') as HTMLInputElement).checked,
        autoReply: (document.getElementById('autoReply') as HTMLInputElement).checked,
        responseDelay: parseInt((document.getElementById('responseDelay') as HTMLInputElement).value),
        keywords: this.getKeywords(),
        excludedUsers: this.getExcludedUsers(),
        selectedAgentId: activeAgentId || null
      },
      firebaseConfig: {
        apiKey: (document.getElementById('firebaseApiKey') as HTMLInputElement)?.value || '',
        authDomain: (document.getElementById('firebaseAuthDomain') as HTMLInputElement)?.value || '',
        projectId: (document.getElementById('firebaseProjectId') as HTMLInputElement)?.value || '',
        storageBucket: (document.getElementById('firebaseStorageBucket') as HTMLInputElement)?.value || '',
        messagingSenderId: (document.getElementById('firebaseMessagingSenderId') as HTMLInputElement)?.value || '',
        appId: (document.getElementById('firebaseAppId') as HTMLInputElement)?.value || ''
      },
      geminiConfig: {
        apiKey: (document.getElementById('geminiApiKey') as HTMLInputElement)?.value || '',
        model: (document.getElementById('geminiModel') as HTMLSelectElement)?.value || 'gemini-2.5-flash',
        maxOutputTokens: parseInt((document.getElementById('geminiMaxTokens') as HTMLInputElement)?.value || '1000'),
        temperature: parseFloat((document.getElementById('geminiTemperature') as HTMLInputElement)?.value || '0.7'),
        topP: parseFloat((document.getElementById('geminiTopP') as HTMLInputElement)?.value || '0.8'),
        topK: parseInt((document.getElementById('geminiTopK') as HTMLInputElement)?.value || '40')
      },
      huggingFaceConfig: {
        apiKey: (document.getElementById('hfApiKey') as HTMLInputElement)?.value || '',
        model: (document.getElementById('hfModel') as HTMLSelectElement)?.value || 'microsoft/DialoGPT-medium',
        maxLength: parseInt((document.getElementById('hfMaxLength') as HTMLInputElement)?.value || '100'),
        temperature: parseFloat((document.getElementById('hfTemperature') as HTMLInputElement)?.value || '0.7')
      }
    };
  }

  private async testFirebaseConnection(): Promise<void> {
    try {
      // Проверяем, что элементы Firebase существуют
      const firebaseApiKey = document.getElementById('firebaseApiKey') as HTMLInputElement;
      const firebaseAuthDomain = document.getElementById('firebaseAuthDomain') as HTMLInputElement;
      const firebaseProjectId = document.getElementById('firebaseProjectId') as HTMLInputElement;
      const firebaseStorageBucket = document.getElementById('firebaseStorageBucket') as HTMLInputElement;
      const firebaseMessagingSenderId = document.getElementById('firebaseMessagingSenderId') as HTMLInputElement;
      const firebaseAppId = document.getElementById('firebaseAppId') as HTMLInputElement;

      if (!firebaseApiKey || !firebaseAuthDomain || !firebaseProjectId || 
          !firebaseStorageBucket || !firebaseMessagingSenderId || !firebaseAppId) {
        this.showError('Элементы конфигурации Firebase не найдены');
        return;
      }

      const config = {
        apiKey: firebaseApiKey.value,
        authDomain: firebaseAuthDomain.value,
        projectId: firebaseProjectId.value,
        storageBucket: firebaseStorageBucket.value,
        messagingSenderId: firebaseMessagingSenderId.value,
        appId: firebaseAppId.value
      };

      const response = await this.sendMessage({ 
        action: 'testConnection',
        type: 'firebase',
        config 
      });

      if (response.success && response.result.firebase) {
        this.showSuccess('Firebase подключение успешно');
      } else {
        this.showError('Ошибка подключения к Firebase');
      }
    } catch (error) {
      console.error('Firebase test failed:', error);
      this.showError('Ошибка тестирования Firebase');
    }
  }

  private async testGeminiConnection(): Promise<void> {
    const testButton = document.getElementById('testGemini') as HTMLButtonElement | null;
    const originalText = testButton?.textContent || null;

    try {
      if (testButton) {
        testButton.disabled = true;
        testButton.textContent = 'Проверяем...';
      }

      const apiKeyInput = document.getElementById('geminiApiKey') as HTMLInputElement | null;
      const modelSelect = document.getElementById('geminiModel') as HTMLSelectElement | null;
      const maxTokensInput = document.getElementById('geminiMaxTokens') as HTMLInputElement | null;
      const temperatureInput = document.getElementById('geminiTemperature') as HTMLInputElement | null;
      const topPInput = document.getElementById('geminiTopP') as HTMLInputElement | null;
      const topKInput = document.getElementById('geminiTopK') as HTMLInputElement | null;

      const config = {
        apiKey: apiKeyInput?.value?.trim() || 'AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k',
        model: modelSelect?.value || 'gemini-2.5-flash',
        maxOutputTokens: parseInt(maxTokensInput?.value || '1000', 10) || 1000,
        temperature: parseFloat(temperatureInput?.value || '0.7') || 0.7,
        topP: parseFloat(topPInput?.value || '0.95') || 0.95,
        topK: parseInt(topKInput?.value || '40', 10) || 40
      };

      const response = await this.sendMessage({
        action: 'testGemini',
        config
      });

      if (response.success && response.result) {
        this.showSuccess('Gemini подключение успешно');
      } else {
        this.showError('Ошибка подключения к Gemini');
      }
    } catch (error) {
      console.error('Gemini test failed:', error);
      this.showError('Ошибка тестирования Gemini');
    } finally {
      if (testButton) {
        testButton.disabled = false;
        if (originalText !== null) {
          testButton.textContent = originalText;
        }
      }
    }
  }

  private async testHuggingFaceConnection(): Promise<void> {
    try {
      // Проверяем, что элементы существуют
      const hfApiKey = document.getElementById('hfApiKey') as HTMLInputElement;
      const hfModel = document.getElementById('hfModel') as HTMLSelectElement;
      const hfMaxLength = document.getElementById('hfMaxLength') as HTMLInputElement;
      const hfTemperature = document.getElementById('hfTemperature') as HTMLInputElement;

      if (!hfApiKey || !hfModel || !hfMaxLength || !hfTemperature) {
        this.showError('Элементы конфигурации Hugging Face не найдены');
        return;
      }

      const config = {
        apiKey: hfApiKey.value,
        model: hfModel.value,
        maxLength: parseInt(hfMaxLength.value) || 100,
        temperature: parseFloat(hfTemperature.value) || 0.7
      };

      const response = await this.sendMessage({ 
        action: 'testHuggingFace',
        config 
      });

      if (response.success && response.result) {
        this.showSuccess('Hugging Face подключение успешно');
      } else {
        this.showError('Ошибка подключения к Hugging Face');
      }
    } catch (error) {
      console.error('Hugging Face test failed:', error);
      this.showError('Ошибка тестирования Hugging Face');
    }
  }

  private switchAIProvider(provider: string): void {
    const huggingFaceConfig = document.getElementById('huggingfaceConfig');
    const geminiConfig = document.getElementById('geminiConfig');
    
    if (provider === 'huggingface') {
      huggingFaceConfig!.style.display = 'block';
      geminiConfig!.style.display = 'none';
    } else if (provider === 'gemini') {
      huggingFaceConfig!.style.display = 'none';
      geminiConfig!.style.display = 'block';
    }
  }

  private addKeyword(): void {
    const input = document.getElementById('keywordInput') as HTMLInputElement;
    const keyword = input.value.trim();
    
    if (keyword) {
      const keywords = this.getKeywords();
      if (!keywords.includes(keyword)) {
        keywords.push(keyword);
        this.renderKeywords(keywords);
        input.value = '';
        this.saveConfig(); // Сохраняем изменения
      }
    }
  }

  private removeKeyword(keyword: string): void {
    const keywords = this.getKeywords().filter(k => k !== keyword);
    this.renderKeywords(keywords);
    this.saveConfig(); // Сохраняем изменения
  }

  private getKeywords(): string[] {
    const keywordsList = document.getElementById('keywordsList');
    const items = keywordsList?.querySelectorAll<HTMLElement>('.keyword-item');
    return Array.from(items || [])
      .map(item => item.dataset.keyword?.trim())
      .filter((keyword): keyword is string => Boolean(keyword));
  }

  private renderKeywords(keywords: string[]): void {
    const container = document.getElementById('keywordsList');
    if (container) {
      container.innerHTML = keywords.map(keyword => `
        <div class="keyword-item" data-keyword="${keyword}">
          <span>${keyword}</span>
          <button class="btn-remove" data-keyword="${keyword}">&times;</button>
        </div>
      `).join('');

      // Добавляем обработчики событий
      container.querySelectorAll('.btn-remove').forEach(button => {
        button.addEventListener('click', (e) => {
          const keyword = (e.currentTarget as HTMLElement).getAttribute('data-keyword');
          if (keyword) {
            this.removeKeywordFromList(keyword);
          }
        });
      });
    }
  }

  private addExcludedUser(): void {
    const input = document.getElementById('excludedUserInput') as HTMLInputElement;
    const user = input.value.trim();
    
    if (user) {
      const users = this.getExcludedUsers();
      if (!users.includes(user)) {
        users.push(user);
        this.renderExcludedUsers(users);
        input.value = '';
        this.saveConfig(); // Сохраняем изменения
      }
    }
  }

  private removeExcludedUser(user: string): void {
    const users = this.getExcludedUsers().filter(u => u !== user);
    this.renderExcludedUsers(users);
    this.saveConfig(); // Сохраняем изменения
  }

  private getExcludedUsers(): string[] {
    const usersList = document.getElementById('excludedUsersList');
    const items = usersList?.querySelectorAll<HTMLElement>('.excluded-user-item');
    return Array.from(items || [])
      .map(item => item.dataset.user?.trim())
      .filter((user): user is string => Boolean(user));
  }

  private renderExcludedUsers(users: string[]): void {
    const container = document.getElementById('excludedUsersList');
    if (container) {
      container.innerHTML = users.map(user => `
        <div class="excluded-user-item" data-user="${user}">
          <span>${user}</span>
          <button class="btn-remove" data-user="${user}">&times;</button>
        </div>
      `).join('');
      
      // Добавляем обработчики событий
      container.querySelectorAll('.btn-remove').forEach(button => {
        button.addEventListener('click', (e) => {
          const user = (e.currentTarget as HTMLElement).getAttribute('data-user');
          if (user) {
            this.removeExcludedUserFromList(user);
          }
        });
      });
    }
  }

  private getSelectedAgentId(): string | undefined {
    const activeAgent = this.agents.find(agent => agent.isActive);
    return activeAgent?.id;
  }

  private showAgentModal(): void {
    const modal = document.getElementById('agentModal');
    if (modal) {
      modal.style.display = 'block';
    }
  }

  private hideAgentModal(): void {
    const modal = document.getElementById('agentModal');
    if (modal) {
      modal.style.display = 'none';
      this.clearAgentForm();
    }
  }

  private clearAgentForm(): void {
    (document.getElementById('agentName') as HTMLInputElement).value = '';
    (document.getElementById('agentPersonality') as HTMLTextAreaElement).value = '';
    (document.getElementById('agentSystemPrompt') as HTMLTextAreaElement).value = '';
    (document.getElementById('saveAgent') as HTMLElement).removeAttribute('data-agent-id');
  }

  private async saveAgent(): Promise<void> {
    try {
      const name = (document.getElementById('agentName') as HTMLInputElement).value.trim();
      const personality = (document.getElementById('agentPersonality') as HTMLTextAreaElement).value.trim();
      const systemPrompt = (document.getElementById('agentSystemPrompt') as HTMLTextAreaElement).value.trim();

      if (!name || !personality || !systemPrompt) {
        this.showError('Заполните все поля');
        return;
      }

      const saveButton = document.getElementById('saveAgent') as HTMLElement;
      const editingAgentId = saveButton.getAttribute('data-agent-id');

      if (editingAgentId) {
        const existingAgent = this.agents.find(agent => agent.id === editingAgentId);

        if (!existingAgent) {
          this.showError('Агент не найден для обновления');
          return;
        }

        const updatedAgent: AIAgent = {
          ...existingAgent,
          name,
          personality,
          systemPrompt,
          updatedAt: Date.now()
        };

        const response = await this.sendMessage({
          action: 'updateAgent',
          agent: updatedAgent
        });

        if (response.success) {
          this.showSuccess('Агент обновлен');
          this.hideAgentModal();
          await this.loadAgents();
        } else {
          throw new Error(response.error || 'Ошибка обновления агента');
        }
      } else {
        const agent: Omit<AIAgent, 'id'> = {
          name,
          personality,
          systemPrompt,
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        const response = await this.sendMessage({
          action: 'createAgent',
          agent
        });

        if (response.success) {
          this.showSuccess('Агент создан и активирован');
          this.hideAgentModal();
          await this.loadAgents();
          // Обновляем UI после создания агента
          this.updateSelectedAgentUI();
        } else {
          throw new Error(response.error || 'Ошибка создания агента');
        }
      }
    } catch (error) {
      console.error('Failed to save agent:', error);
      this.showError('Ошибка сохранения агента');
    }
  }

  private renderAgents(): void {
    const container = document.getElementById('agentsGrid');
    if (container) {
      container.innerHTML = this.agents.map(agent => `
        <div class="agent-card" data-agent-id="${agent.id}">
          <div class="agent-header">
            <h3>${agent.name}</h3>
            <div class="agent-status ${agent.isActive ? 'active' : 'inactive'}">
              ${agent.isActive ? 'Активен' : 'Неактивен'}
            </div>
          </div>
          <div class="agent-content">
            <p><strong>Личность:</strong> ${agent.personality}</p>
            <p><strong>Системный промпт:</strong> ${agent.systemPrompt.substring(0, 100)}...</p>
          </div>
          <div class="agent-actions">
            <button class="btn btn-small edit-agent" data-agent-id="${agent.id}">Редактировать</button>
            <button class="btn btn-small delete-agent" data-agent-id="${agent.id}">Удалить</button>
            <button class="btn btn-small toggle-agent" data-agent-id="${agent.id}">
              ${agent.isActive ? 'Деактивировать' : 'Активировать'}
            </button>
          </div>
        </div>
      `).join('');
      
      // Добавляем обработчики событий для кнопок агентов
      container.querySelectorAll('.edit-agent').forEach(button => {
        button.addEventListener('click', (e) => {
          const agentId = (e.target as HTMLElement).getAttribute('data-agent-id');
          if (agentId) {
            this.editAgent(agentId);
          }
        });
      });
      
      container.querySelectorAll('.delete-agent').forEach(button => {
        button.addEventListener('click', (e) => {
          const agentId = (e.target as HTMLElement).getAttribute('data-agent-id');
          if (agentId) {
            this.deleteAgent(agentId);
          }
        });
      });
      
      container.querySelectorAll('.toggle-agent').forEach(button => {
        button.addEventListener('click', (e) => {
          const agentId = (e.target as HTMLElement).getAttribute('data-agent-id');
          if (agentId) {
            this.toggleAgent(agentId);
          }
        });
      });
    }
    
    // Обновляем отображение выбранного агента
    this.updateSelectedAgentUI();
  }

  private updateSelectedAgentUI(): void {
    const activeAgent = this.agents.find(agent => agent.isActive);
    const agentStatusElement = document.getElementById('agentStatus');
    
    if (agentStatusElement) {
      if (activeAgent) {
        agentStatusElement.textContent = `Выбран: ${activeAgent.name}`;
        agentStatusElement.className = 'status-enabled';
      } else {
        agentStatusElement.textContent = 'Не выбран';
        agentStatusElement.className = 'status-disabled';
      }
    }
  }

  // Публичные методы для вызова из HTML
  public editAgent(agentId: string): void {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      // Заполняем форму редактирования
      (document.getElementById('agentName') as HTMLInputElement).value = agent.name;
      (document.getElementById('agentPersonality') as HTMLTextAreaElement).value = agent.personality;
      (document.getElementById('agentSystemPrompt') as HTMLTextAreaElement).value = agent.systemPrompt;
      
      // Сохраняем ID для обновления
      (document.getElementById('saveAgent') as HTMLElement).setAttribute('data-agent-id', agentId);
      
      this.showAgentModal();
    }
  }

  public async deleteAgent(agentId: string): Promise<void> {
    if (confirm('Вы уверены, что хотите удалить этого агента?')) {
      try {
        const response = await this.sendMessage({
          action: 'deleteAgent',
          agentId
        });

        if (response.success) {
          this.showSuccess('Агент удален');
          await this.loadAgents();
        } else {
          throw new Error(response.error || 'Ошибка удаления агента');
        }
      } catch (error) {
        console.error('Failed to delete agent:', error);
        this.showError('Ошибка удаления агента');
      }
    }
  }

  public async toggleAgent(agentId: string): Promise<void> {
    try {
      const response = await this.sendMessage({
        action: 'toggleAgent',
        agentId
      });

      if (response.success) {
        this.showSuccess(response.isActive ? 'Агент активирован' : 'Агент деактивирован');
        await this.loadAgents();
      } else {
        throw new Error(response.error || 'Ошибка активации агента');
      }
    } catch (error) {
      console.error('Failed to toggle agent:', error);
      this.showError('Ошибка активации агента');
    }
  }

  private updateStatisticsUI(): void {
    if (!this.statistics) return;

    document.getElementById('totalMessages')!.textContent = String(this.statistics.totalMessages);
    document.getElementById('totalReplies')!.textContent = String(this.statistics.totalReplies);
    document.getElementById('activeChats')!.textContent = String(this.statistics.activeChats);
    document.getElementById('successRate')!.textContent = `${Math.round(this.statistics.successRate)}%`;
    document.getElementById('queueLength')!.textContent = String(this.statistics.queueLength ?? 0);
    document.getElementById('totalErrors')!.textContent = String(this.statistics.totalErrors ?? 0);
    document.getElementById('lastResponseAt')!.textContent = this.formatTimestamp(this.statistics.lastResponseAt);
  }

  private formatTimestamp(timestamp?: number): string {
    if (!timestamp) {
      return '—';
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return date.toLocaleString();
  }

  private async loadLogs(): Promise<void> {
    // Загружаем логи из storage или Firebase
    this.logs = [
      { timestamp: Date.now(), level: 'info', message: 'Система запущена' },
      { timestamp: Date.now() - 1000, level: 'info', message: 'Бот активирован' },
      { timestamp: Date.now() - 2000, level: 'warning', message: 'Медленное подключение к OpenAI' }
    ];
    this.renderLogs();
  }

  private renderLogs(): void {
    const container = document.getElementById('logsContainer');
    if (container) {
      container.innerHTML = this.logs.map(log => `
        <div class="log-entry ${log.level}">
          <span class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</span>
          <span class="log-level">${log.level.toUpperCase()}</span>
          <span class="log-message">${log.message}</span>
        </div>
      `).join('');
    }
  }

  private clearLogs(): void {
    this.logs = [];
    this.renderLogs();
  }

  private exportLogs(): void {
    const logData = this.logs.map(log => ({
      timestamp: new Date(log.timestamp).toISOString(),
      level: log.level,
      message: log.message
    }));

    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snapchat-bot-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private updateUI(): void {
    // Обновляем интерфейс
  }

  private showSuccess(message: string): void {
    this.showNotification(message, 'success');
  }

  private showError(message: string): void {
    this.showNotification(message, 'error');
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
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

  // Публичные методы для вызова из HTML
  public removeKeywordFromList(keyword: string): void {
    this.removeKeyword(keyword);
  }

  public removeExcludedUserFromList(user: string): void {
    this.removeExcludedUser(user);
  }


  private async toggleBot(isEnabled: boolean): Promise<void> {
    try {
      const response = await this.sendMessage({ 
        action: 'toggleBot', 
        isEnabled 
      });

      if (response.success) {
        this.showSuccess(`Бот ${isEnabled ? 'включен' : 'выключен'}`);
        this.updateBotStatusUI();
      } else {
        this.showError('Ошибка переключения бота');
      }
    } catch (error) {
      console.error('Toggle bot failed:', error);
      this.showError('Ошибка переключения бота');
    }
  }

  private updateBotStatusUI(): void {
    const statusElement = document.getElementById('botStatus');
    if (statusElement) {
      const isEnabled = (document.getElementById('botEnabled') as HTMLInputElement).checked;
      statusElement.textContent = isEnabled ? 'Включен' : 'Выключен';
      statusElement.className = isEnabled ? 'status-enabled' : 'status-disabled';
    }
  }
}

// Инициализируем админ панель
const adminController = new AdminController();

// Делаем контроллер доступным глобально для вызовов из HTML
(window as any).adminController = adminController;
