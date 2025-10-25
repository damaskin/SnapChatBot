interface ChatListItemInfo {
  element: Element;
  chatId: string;
  title: string;
  statusText: string | null;
  hasUnread: boolean;
  lastActivityTime?: number;
}

export class SnapchatDetector {
  private static instance: SnapchatDetector;
  private observers: MutationObserver[] = [];
  private isInitialized = false;
  private activeChatId: string | null = null;
  private activeChatTitle: string | null = null;

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
            this.handleChatListChanges(mutation.removedNodes);
            return;
          }

          if (mutation.type === 'attributes' || mutation.type === 'characterData') {
            const element = this.resolveChatListItemElement(mutation.target);
            if (element) {
              this.processChatListChange(element);
            }
          }
        });
      });

      observer.observe(chatList, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
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
      '[data-testid="conversation-list"]',
      '.chat-list',
      '.conversation-list',
      '.ReactVirtualized__Grid__innerScrollContainer',
      '[role="list"]'
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

  private handleChatListChanges(nodes: NodeList): void {
    // Обрабатываем изменения в списке чатов
    nodes.forEach((node) => {
      const element = this.resolveChatListItemElement(node);
      if (element) {
        this.processChatListChange(element);
      }
    });
  }

  private resolveChatListItemElement(node: Node | null): Element | null {
    if (!node) {
      return null;
    }

    const element = node instanceof Element ? node : node.parentElement;
    if (!element) {
      return null;
    }

    const selector = [
      '[role="listitem"]',
      '[data-testid*="list-item"]',
      '[data-testid*="conversation-list-item"]',
      '.conversation-item',
      '.chat-list-item',
      '.O4POs'
    ].join(',');

    return element.closest(selector);
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
    const activeChatId = this.getCurrentChatId();

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
        const chatId = activeChatId || this.getCurrentChatId();

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
      this.activeChatId = chatIdMatch[1];
      return this.activeChatId;
    }

    // Альтернативный способ - из атрибутов страницы
    const chatIdEl = document.querySelector('[data-chat-id]');
    if (chatIdEl) {
      const id = chatIdEl.getAttribute('data-chat-id');
      if (id && !/^unknown$/i.test(id)) {
        this.activeChatId = id;
        return id;
      }
    }

    if (this.activeChatId && !/^unknown$/i.test(this.activeChatId)) {
      return this.activeChatId;
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
    const statusInfo = this.extractChatStatus(element);
    const title = this.extractChatTitle(element);
    const chatId = this.extractChatIdentifier(element);

    const event = new CustomEvent('snapchat-chat-list-change', {
      detail: {
        element,
        chatId,
        title,
        statusText: statusInfo.text,
        hasUnread: statusInfo.hasUnread,
        lastActivityTime: statusInfo.lastActivityTime ?? null
      }
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
          const chatId = this.buildStableChatId(rawId, title, index);
          const statusInfo = this.extractChatStatus(element);

          items.set(element, {
            element,
            chatId,
            title: title || chatId,
            statusText: statusInfo.text,
            hasUnread: statusInfo.hasUnread,
            lastActivityTime: statusInfo.lastActivityTime
          });

          index += 1;
        }
      });
    });

    return Array.from(items.values());
  }

  async openChat(element: Element, context?: { chatId?: string; title?: string | null }): Promise<void> {
    const clickable = (element.querySelector('a, button, [role="link"], [role="button"], [data-testid*="conversation"]') as HTMLElement) ||
      (element as HTMLElement);

    const derivedTitle = context?.title ?? this.extractChatTitle(element);
    const derivedId = this.buildStableChatId(context?.chatId ?? this.extractChatIdentifier(element), derivedTitle, Date.now());
    this.activeChatId = derivedId;

    try {
      clickable.scrollIntoView({ behavior: 'auto', block: 'center' });
    } catch (error) {
      console.debug('SnapchatDetector: scrollIntoView не удался, продолжаем без прокрутки', error);
    }

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
          const title = this.getActiveChatTitle();
          if (title) {
            this.activeChatTitle = title;
          }
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
  private locateComposerElements(): { input: HTMLElement | null; composer: HTMLElement | null } {
    const candidateInputs = Array.from(document.querySelectorAll<HTMLElement>(
      '[placeholder], [data-testid], [contenteditable="true"], textarea, input'
    ));

    const inputElement = candidateInputs.find((element) => {
      const placeholder = (element.getAttribute('placeholder') || '').toLowerCase();
      const dataTestId = (element.getAttribute('data-testid') || '').toLowerCase();
      const role = (element.getAttribute('role') || '').toLowerCase();

      if (placeholder.includes('search')) {
        return false;
      }

      if (placeholder.includes('send a chat') || placeholder.includes('send a message') || placeholder.includes('type a message')) {
        return true;
      }

      if (dataTestId.includes('chat-input') || dataTestId.includes('composer') || dataTestId.includes('message-input')) {
        return true;
      }

      if (role === 'textbox' && element.isContentEditable) {
        const composerElement = element.closest('[data-testid*="composer"], [data-testid*="chat"], .shMO3, .jh13h');
        return !!composerElement;
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.type === 'text' || element.tagName.toLowerCase() === 'textarea';
      }

      return false;
    }) || null;

    const composer = inputElement
      ? inputElement.closest('[data-testid*="composer"], [data-testid*="chat"], .shMO3, .jh13h, form, [role="form"]') as HTMLElement | null
      : null;

    return { input: inputElement, composer };
  }

  private applyTextToInput(inputElement: HTMLElement, text: string): void {
    if (inputElement instanceof HTMLInputElement || inputElement instanceof HTMLTextAreaElement) {
      const prototype = Object.getPrototypeOf(inputElement);
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (valueSetter) {
        valueSetter.call(inputElement, text);
      } else {
        inputElement.value = text;
      }
    } else if (inputElement.isContentEditable) {
      inputElement.textContent = text;
    } else {
      inputElement.textContent = text;
    }
  }

  async fillMessageInput(text: string): Promise<{ success: boolean; composer: HTMLElement | null; input: HTMLElement | null }> {
    try {
      const { input, composer } = this.locateComposerElements();

      if (!input) {
        console.error('Не найдено поле ввода сообщения');
        return { success: false, composer: null, input: null };
      }

      input.focus();
      this.applyTextToInput(input, text);

      const inputEvent = new InputEvent('input', { bubbles: true, data: text });
      input.dispatchEvent(inputEvent);
      const changeEvent = new Event('change', { bubbles: true });
      input.dispatchEvent(changeEvent);

      return { success: true, composer, input };
    } catch (error) {
      console.error('Ошибка при заполнении поля ввода:', error);
      return { success: false, composer: null, input: null };
    }
  }

  private findSendButton(composer: HTMLElement | null): HTMLButtonElement | null {
    const sendButtonSelectors = [
      '[data-testid="send-button"]',
      'button[data-testid*="send"]',
      'button[aria-label*="send" i]',
      'button[type="submit"]'
    ];

    if (composer) {
      for (const selector of sendButtonSelectors) {
        const found = composer.querySelector(selector) as HTMLButtonElement | null;
        if (found) {
          return found;
        }
      }

      const possibleButtons = Array.from(composer.querySelectorAll('button')) as HTMLButtonElement[];
      const fallback = possibleButtons.find((button) => {
        if (!button.offsetParent) {
          return false;
        }

        const label = (button.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('attach') || label.includes('emoji') || label.includes('sticker')) {
          return false;
        }

        const hasArrowSvg = button.querySelector('svg path[d*="13.536"], svg path[d*="M13.5"], svg.zfQr6');
        if (hasArrowSvg) {
          return true;
        }

        const textContent = (button.textContent || '').trim();
        return textContent.length === 0;
      }) || null;

      if (fallback) {
        return fallback;
      }
    }

    for (const selector of sendButtonSelectors) {
      const found = document.querySelector(selector) as HTMLButtonElement | null;
      if (found && (!composer || composer.contains(found))) {
        return found;
      }
    }

    return null;
  }

  async sendMessage(text: string): Promise<boolean> {
    try {
      const { success, composer, input } = await this.fillMessageInput(text);

      if (!success || !input) {
        return false;
      }

      const sendButton = this.findSendButton(composer);

      if (sendButton) {
        ['mouseover', 'mousedown', 'mouseup', 'click'].forEach((eventType) => {
          const event = new MouseEvent(eventType, { bubbles: true, cancelable: true, view: window });
          sendButton.dispatchEvent(event);
        });
      } else {
        ['keydown', 'keypress', 'keyup'].forEach(eventType => {
          const event = new KeyboardEvent(eventType, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
          });
          input.dispatchEvent(event);
        });
      }

      return true;
    } catch (error) {
      console.error('Ошибка при отправке сообщения:', error);
      return false;
    }
  }

  getActiveChatInfo(): { chatId: string; title: string | null } {
    return {
      chatId: this.getCurrentChatId(),
      title: this.getActiveChatTitle()
    };
  }

  destroy(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.isInitialized = false;
    this.activeChatId = null;
    this.activeChatTitle = null;
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

  private buildStableChatId(rawId: string | null | undefined, title: string, index: number): string {
    const trimmedRaw = rawId?.trim();
    if (trimmedRaw && !/^unknown$/i.test(trimmedRaw)) {
      return trimmedRaw;
    }

    const normalizedTitle = title
      ? title
          .toLowerCase()
          .replace(/[^a-z0-9а-яё]+/gi, '-')
          .replace(/^-+|-+$/g, '')
      : '';

    if (normalizedTitle) {
      return normalizedTitle;
    }

    return `chat-${index}`;
  }

  private getActiveChatTitle(): string | null {
    const containerSelectors = [
      '[data-testid="conversation-header"]',
      '[data-testid="chat-header"]',
      '[data-testid="conversation-header-title"]',
      '[data-testid="conversation-title"]',
      'header',
      '[role="banner"]'
    ];

    for (const selector of containerSelectors) {
      const container = document.querySelector(selector);
      if (container) {
        const title = this.extractChatTitle(container);
        if (title) {
          return title;
        }
      }
    }

    return null;
  }

  private extractChatStatus(element: Element): { text: string | null; hasUnread: boolean; lastActivityTime?: number } {
    const statusSelectors = [
      '[id^="status-"]',
      '[data-testid*="status"]',
      '[class*="status"]',
      '[aria-label*="status" i]',
      '[aria-live]'
    ];

    let statusText: string | null = null;

    for (const selector of statusSelectors) {
      const candidate = element.querySelector(selector);
      if (candidate && candidate.textContent?.trim()) {
        statusText = candidate.textContent.trim();
        break;
      }
    }

    if (!statusText) {
      const keywords = [
        'new chat',
        'new snap',
        'new message',
        'received',
        'непрочитан',
        'непрочитано',
        'новое',
        'новый чат',
        'только что',
        'just now'
      ];

      const fallback = Array.from(element.querySelectorAll('span, div'))
        .find(node => {
          const text = node.textContent?.trim();
          if (!text) {
            return false;
          }

          const normalized = text.toLowerCase();
          return keywords.some(keyword => normalized.includes(keyword));
        });

      if (fallback && fallback.textContent) {
        statusText = fallback.textContent.trim();
      }
    }

    const timeElement = element.querySelector('time[datetime]');
    let lastActivityTime: number | undefined;
    if (timeElement) {
      const datetime = timeElement.getAttribute('datetime');
      if (datetime) {
        const parsed = Date.parse(datetime);
        if (!Number.isNaN(parsed)) {
          lastActivityTime = parsed;
        }
      }
    }

    const normalizedStatus = statusText?.toLowerCase() ?? '';
    const positiveKeywords = [
      'new chat',
      'new snap',
      'new message',
      'received',
      'непрочитано',
      'непрочитан',
      'новое сообщение',
      'новый чат',
      'получено'
    ];
    const negativeKeywords = [
      'opened',
      'просмотрено',
      'просмотрен',
      'viewed',
      'sent',
      'отправлено',
      'delivered',
      'seen',
      'прочитан',
      'прочитано'
    ];

    let hasUnread = positiveKeywords.some(keyword => normalizedStatus.includes(keyword));

    if (!hasUnread) {
      const indicatorSelectors = [
        '[data-testid*="unread"]',
        '[aria-label*="unread" i]',
        '[class*="unread"]',
        '[class*="New" i]',
        '[class*="Badge" i]'
      ];

      hasUnread = indicatorSelectors.some(selector => !!element.querySelector(selector));
    }

    if (!hasUnread && normalizedStatus && !negativeKeywords.some(keyword => normalizedStatus.includes(keyword))) {
      if (/(just now|только что|сейчас)/.test(normalizedStatus)) {
        hasUnread = true;
      }
    }

    return {
      text: statusText,
      hasUnread,
      lastActivityTime
    };
  }
}
