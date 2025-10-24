interface ChatListItemInfo {
  element: Element;
  chatId: string;
  title: string;
}

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
    // Ищем контейнер с сообщениями в Snapchat Web
    const selectors = [
      // Snapchat Web специфичные селекторы
      '[data-testid="message-list"]',
      '[data-testid="chat-messages"]',
      '.message-list',
      '.chat-messages',
      '[role="log"]',
      // Общие селекторы
      'main',
      '[data-testid="conversation"]',
      '.conversation',
      // Fallback
      'body'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log('SnapchatDetector: Найден контейнер сообщений:', selector);
        return element;
      }
    }

    console.log('SnapchatDetector: Контейнер сообщений не найден, используем body');
    return document.body;
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

    // Ищем сообщения в элементе - более широкий набор селекторов для Snapchat Web
    const messageSelectors = [
      '[data-testid="message"]',
      '[data-testid="chat-message"]',
      '.message',
      '.chat-message',
      '[role="listitem"]',
      '[data-testid="conversation-item"]',
      '.conversation-item',
      // Общие селекторы для текстовых элементов
      'div[class*="message"]',
      'div[class*="chat"]',
      'span[class*="text"]',
      'p[class*="text"]'
    ];

    let messageElements: NodeListOf<Element> | null = null;
    
    for (const selector of messageSelectors) {
      messageElements = element.querySelectorAll(selector);
      if (messageElements.length > 0) {
        console.log(`SnapchatDetector: Найдено ${messageElements.length} элементов с селектором: ${selector}`);
        break;
      }
    }
    
    if (!messageElements || messageElements.length === 0) {
      console.log('SnapchatDetector: Сообщения не найдены, пробуем поиск по всему элементу');
      // Если не нашли по селекторам, ищем все текстовые элементы
      messageElements = element.querySelectorAll('div, span, p');
    }
    
    messageElements.forEach((msgEl) => {
      const text = this.extractMessageText(msgEl);
      if (text && text.length > 0) {
        const sender = this.determineSender(msgEl);
        const timestamp = this.extractTimestamp(msgEl);
        const chatId = this.getCurrentChatId();

        console.log(`SnapchatDetector: Найдено сообщение: "${text}" от ${sender}`);
        
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

  getChatListItems(): ChatListItemInfo[] {
    const chatList = this.findChatList() || document;
    const selectors = [
      '[data-testid="conversation-list-item"]',
      '[data-testid="chat-list-item"]',
      '[data-testid="contact-item"]',
      '[role="listitem"]',
      '.conversation-item',
      '.chat-list-item'
    ];

    const items = new Map<Element, ChatListItemInfo>();
    let index = 0;

    selectors.forEach((selector) => {
      chatList.querySelectorAll(selector).forEach((element) => {
        if (!items.has(element)) {
          const title = this.extractChatTitle(element);
          const rawId = this.extractChatIdentifier(element);
          const chatId = rawId || this.createChatIdFromTitle(title, index);

          items.set(element, {
            element,
            chatId,
            title: title || chatId
          });

          index += 1;
        }
      });
    });

    return Array.from(items.values());
  }

  async openChat(element: Element): Promise<void> {
    const clickable = (element.querySelector('a, button, [role="link"], [data-testid*="conversation"]') as HTMLElement) ||
      (element as HTMLElement);

    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach((type) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, view: window });
      clickable.dispatchEvent(event);
    });

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  async waitForChatToLoad(timeout = 5000): Promise<boolean> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const container = this.findMessageContainer();
      if (container) {
        const hasMessages = container.querySelectorAll('div, span, p').length > 0;
        if (hasMessages) {
          return true;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return false;
  }

  async collectChatMessages(limit = 50): Promise<Array<{
    text: string;
    sender: 'user' | 'other';
    timestamp: number;
    chatId: string;
  }>> {
    const container = this.findMessageContainer();
    if (!container) {
      return [];
    }

    const messages = this.extractMessagesFromElement(container);
    if (limit > 0 && messages.length > limit) {
      return messages.slice(-limit);
    }

    return messages;
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

      let inputElement: HTMLElement | HTMLInputElement | HTMLTextAreaElement | null = null;

      for (const selector of inputSelectors) {
        inputElement = document.querySelector(selector) as HTMLElement | HTMLInputElement | HTMLTextAreaElement;
        if (inputElement) break;
      }

      if (!inputElement) {
        console.error('Не найдено поле ввода сообщения');
        return false;
      }

      // Вводим текст
      inputElement.focus();
      if ('value' in inputElement) {
        (inputElement as HTMLInputElement | HTMLTextAreaElement).value = text;
      } else {
        inputElement.textContent = text;
      }

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
        '.send-button'
      ];

      let sendButton: HTMLButtonElement | null = null;

      for (const selector of sendButtonSelectors) {
        sendButton = document.querySelector(selector) as HTMLButtonElement;
        if (sendButton) break;
      }

      if (!sendButton) {
        const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
        sendButton = buttons.find((button) => {
          const textContent = button.textContent || '';
          return /send|отправить/i.test(textContent);
        }) || null;
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

  private extractChatTitle(element: Element): string {
    const titleSelectors = [
      '[data-testid="conversation-title"]',
      '[data-testid="display-name"]',
      '[data-testid="contact-name"]',
      '[data-testid="conversation-title-text"]',
      'h3',
      'h2',
      'span',
      'div'
    ];

    for (const selector of titleSelectors) {
      const titleElement = element.querySelector(selector);
      if (titleElement && titleElement.textContent) {
        return titleElement.textContent.trim();
      }
    }

    const text = element.textContent?.trim() || '';
    return text.split('\n')[0]?.trim() || '';
  }

  private extractChatIdentifier(element: Element): string | null {
    const attributeCandidates = ['data-chat-id', 'data-id', 'data-testid', 'data-qa-id'];

    for (const attr of attributeCandidates) {
      const value = element.getAttribute(attr);
      if (value) {
        return value;
      }
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return ariaLabel;
    }

    return null;
  }

  private createChatIdFromTitle(title: string, index: number): string {
    if (title) {
      return `${title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-')}-${index}`;
    }

    return `chat-${index}`;
  }
}
