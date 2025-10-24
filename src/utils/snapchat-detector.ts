export class SnapchatDetector {
  private static instance: SnapchatDetector;
  private observers: MutationObserver[] = [];
  private isInitialized = false;

  static getInstance(): SnapchatDetector {
    if (!SnapchatDetector.instance) {
      SnapchatDetector.instance = new SnapchatDetector();
    }
    return SnapchatDetector.instance;
  }

  initialize(): void {
    if (this.isInitialized) return;
    
    this.setupMessageObserver();
    this.setupChatListObserver();
    this.isInitialized = true;
  }

  private setupMessageObserver(): void {
    // Отслеживаем изменения в области сообщений
    const messageContainer = this.findMessageContainer();
    if (messageContainer) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            this.handleNewMessages(mutation.addedNodes);
          }
        });
      });

      observer.observe(messageContainer, {
        childList: true,
        subtree: true
      });

      this.observers.push(observer);
    }
  }

  private setupChatListObserver(): void {
    // Отслеживаем изменения в списке чатов
    const chatList = this.findChatList();
    if (chatList) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            this.handleChatListChanges(mutation.addedNodes);
          }
        });
      });

      observer.observe(chatList, {
        childList: true,
        subtree: true
      });

      this.observers.push(observer);
    }
  }

  private findMessageContainer(): Element | null {
    // Ищем контейнер с сообщениями в Snapchat
    const selectors = [
      '[data-testid="message-list"]',
      '.message-list',
      '[role="log"]',
      '.chat-messages',
      '[data-testid="chat-messages"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    // Fallback - ищем по структуре
    return document.querySelector('main') || document.body;
  }

  private findChatList(): Element | null {
    // Ищем список чатов
    const selectors = [
      '[data-testid="chat-list"]',
      '.chat-list',
      '[role="list"]',
      '.conversation-list'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    return null;
  }

  private handleNewMessages(addedNodes: NodeList): void {
    addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const messages = this.extractMessagesFromElement(element);
        
        messages.forEach(message => {
          this.processNewMessage(message);
        });
      }
    });
  }

  private handleChatListChanges(addedNodes: NodeList): void {
    // Обрабатываем изменения в списке чатов
    addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        this.processChatListChange(element);
      }
    });
  }

  private extractMessagesFromElement(element: Element): Array<{
    text: string;
    sender: 'user' | 'other';
    timestamp: number;
    chatId: string;
  }> {
    const messages: Array<{
      text: string;
      sender: 'user' | 'other';
      timestamp: number;
      chatId: string;
    }> = [];

    // Ищем сообщения в элементе
    const messageElements = element.querySelectorAll('[data-testid="message"], .message, [role="listitem"]');
    
    messageElements.forEach((msgEl) => {
      const text = this.extractMessageText(msgEl);
      if (text) {
        const sender = this.determineSender(msgEl);
        const timestamp = this.extractTimestamp(msgEl);
        const chatId = this.getCurrentChatId();

        messages.push({
          text,
          sender,
          timestamp,
          chatId
        });
      }
    });

    return messages;
  }

  private extractMessageText(element: Element): string | null {
    // Извлекаем текст сообщения
    const textSelectors = [
      '[data-testid="message-text"]',
      '.message-text',
      '.text',
      'p',
      'span'
    ];

    for (const selector of textSelectors) {
      const textEl = element.querySelector(selector);
      if (textEl && textEl.textContent?.trim()) {
        return textEl.textContent.trim();
      }
    }

    return element.textContent?.trim() || null;
  }

  private determineSender(element: Element): 'user' | 'other' {
    // Определяем отправителя сообщения
    const userIndicators = [
      '[data-testid="own-message"]',
      '.own-message',
      '.sent-message',
      '.user-message'
    ];

    for (const indicator of userIndicators) {
      if (element.closest(indicator) || element.matches(indicator)) {
        return 'user';
      }
    }

    // Проверяем по классам
    const classList = element.className.toLowerCase();
    if (classList.includes('own') || classList.includes('sent') || classList.includes('user')) {
      return 'user';
    }

    return 'other';
  }

  private extractTimestamp(element: Element): number {
    // Извлекаем временную метку
    const timeSelectors = [
      '[data-testid="timestamp"]',
      '.timestamp',
      'time',
      '[datetime]'
    ];

    for (const selector of timeSelectors) {
      const timeEl = element.querySelector(selector);
      if (timeEl) {
        const datetime = timeEl.getAttribute('datetime');
        if (datetime) {
          return new Date(datetime).getTime();
        }
      }
    }

    return Date.now();
  }

  private getCurrentChatId(): string {
    // Получаем ID текущего чата из URL или других источников
    const url = window.location.href;
    const chatIdMatch = url.match(/chat\/([^\/]+)/);
    if (chatIdMatch) {
      return chatIdMatch[1];
    }

    // Альтернативный способ - из атрибутов страницы
    const chatIdEl = document.querySelector('[data-chat-id]');
    if (chatIdEl) {
      return chatIdEl.getAttribute('data-chat-id') || 'unknown';
    }

    return 'unknown';
  }

  private processNewMessage(message: {
    text: string;
    sender: 'user' | 'other';
    timestamp: number;
    chatId: string;
  }): void {
    // Отправляем событие о новом сообщении
    const event = new CustomEvent('snapchat-new-message', {
      detail: message
    });
    document.dispatchEvent(event);
  }

  private processChatListChange(element: Element): void {
    // Обрабатываем изменения в списке чатов
    const event = new CustomEvent('snapchat-chat-list-change', {
      detail: { element }
    });
    document.dispatchEvent(event);
  }

  // Методы для отправки сообщений
  async sendMessage(text: string): Promise<boolean> {
    try {
      // Ищем поле ввода сообщения
      const inputSelectors = [
        '[data-testid="message-input"]',
        'input[type="text"]',
        'textarea',
        '[contenteditable="true"]',
        '.message-input'
      ];

      let inputElement: HTMLInputElement | HTMLTextAreaElement | null = null;

      for (const selector of inputSelectors) {
        inputElement = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
        if (inputElement) break;
      }

      if (!inputElement) {
        console.error('Не найдено поле ввода сообщения');
        return false;
      }

      // Вводим текст
      inputElement.focus();
      inputElement.value = text;
      
      // Триггерим события для React/Vue
      const events = ['input', 'change', 'keyup'];
      events.forEach(eventType => {
        const event = new Event(eventType, { bubbles: true });
        inputElement!.dispatchEvent(event);
      });

      // Ищем кнопку отправки
      const sendButtonSelectors = [
        '[data-testid="send-button"]',
        'button[type="submit"]',
        '.send-button',
        'button:contains("Send")'
      ];

      let sendButton: HTMLButtonElement | null = null;

      for (const selector of sendButtonSelectors) {
        sendButton = document.querySelector(selector) as HTMLButtonElement;
        if (sendButton) break;
      }

      if (sendButton) {
        sendButton.click();
      } else {
        // Пробуем отправить через Enter
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        });
        inputElement.dispatchEvent(enterEvent);
      }

      return true;
    } catch (error) {
      console.error('Ошибка при отправке сообщения:', error);
      return false;
    }
  }

  destroy(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.isInitialized = false;
  }
}
