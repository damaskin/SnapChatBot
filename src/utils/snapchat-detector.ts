import { ChatMessage } from '../types';

export interface ChatListItem {
  element: Element;
  chatId: string;
  title: string;
  statusText: string | null;
  hasUnread: boolean;
  lastActivityTime?: number;
}

export interface ActiveChatInfo {
  chatId: string;
  title: string | null;
}

export class SnapchatDetector {
  private static instance: SnapchatDetector;
  private activeChatId: string | null = null;
  private chatListItems: Map<Element, ChatListItem> = new Map();
  private messageContainer: Element | null = null;
  private observer: MutationObserver | null = null;

  static getInstance(): SnapchatDetector {
    if (!SnapchatDetector.instance) {
      SnapchatDetector.instance = new SnapchatDetector();
    }
    return SnapchatDetector.instance;
  }

  initialize(): void {
    console.log('SnapchatDetector: Инициализация детектора');
    this.findMessageContainer();
    this.setupChatListObserver();
  }

  private findMessageContainer(): Element | null {
    const selectors = [
      '[data-testid="message-list"]', '[data-testid="chat-messages"]', '.message-list', '.chat-messages', '[role="log"]',
      'main', '[data-testid="conversation"]', '.conversation', 'body'
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

  private setupChatListObserver(): void {
    const chatList = this.findChatList();
    if (!chatList) {
      console.log('SnapchatDetector: Список чатов не найден');
      return;
    }

    this.observer = new MutationObserver((mutations) => {
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

    this.observer.observe(chatList, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    console.log('SnapchatDetector: Наблюдатель за списком чатов настроен');
  }

  private findChatList(): Element | null {
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
      if (element) {
        console.log('SnapchatDetector: Найден список чатов:', selector);
        return element;
      }
    }

    return null;
  }

  private handleChatListChanges(nodes: NodeList): void {
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

  private processChatListChange(element: Element): void {
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

  getChatListItems(): ChatListItem[] {
    const chatList = this.findChatList();
    if (!chatList) {
      return [];
    }

    const items = new Map<Element, ChatListItem>();
    const chatElements = chatList.querySelectorAll('[role="listitem"], [data-testid*="list-item"], [data-testid*="conversation-list-item"], .conversation-item, .chat-list-item, .O4POs');

    chatElements.forEach((element, index) => {
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
    });

    this.chatListItems = items;
    return Array.from(items.values());
  }

  async openChat(element: Element, context?: { chatId?: string; title?: string | null }): Promise<void> {
    const clickable = (element.querySelector('a, button, [role="link"], [role="button"], [data-testid*="conversation"]') as HTMLElement) ||
      (element as HTMLElement);

    const derivedTitle = this.sanitizeChatTitle(context?.title ?? this.extractChatTitle(element));
    const derivedId = this.buildStableChatId(
      context?.chatId ?? this.extractChatIdentifier(element),
      derivedTitle,
      Date.now()
    );
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

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async waitForChatToLoad(): Promise<boolean> {
    const maxWaitTime = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const messages = this.extractMessagesFromElement(this.findMessageContainer() || document.body);
      if (messages.length > 0) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
  }

  async collectChatMessages(maxMessages: number = 50): Promise<Array<{
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
    return messages.slice(-maxMessages);
  }

  getActiveChatInfo(): ActiveChatInfo | null {
    if (!this.activeChatId) {
      return null;
    }

    const chatItem = Array.from(this.chatListItems.values())
      .find(item => item.chatId === this.activeChatId);

    return {
      chatId: this.activeChatId,
      title: chatItem?.title || null
    };
  }

  async fillMessageInput(text: string): Promise<{ success: boolean; composer: HTMLElement | null; input: HTMLElement | null }> {
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
        const composer = element.closest('[data-testid*="composer"], [data-testid*="chat"], .shMO3, .jh13h');
        return !!composer;
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.type === 'text' || element.tagName.toLowerCase() === 'textarea';
      }

      return false;
    });

    if (!inputElement) {
      return { success: false, composer: null, input: null };
    }

    inputElement.focus();

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

    const inputEvent = new InputEvent('input', { bubbles: true, data: text });
    inputElement.dispatchEvent(inputEvent);
    const changeEvent = new Event('change', { bubbles: true });
    inputElement.dispatchEvent(changeEvent);

    const composer = inputElement.closest('[data-testid*="composer"], [data-testid*="chat"], .shMO3, .jh13h, form, [role="form"]') as HTMLElement;

    return { success: true, composer, input: inputElement };
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
      return possibleButtons.find((button) => {
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
    }

    return null;
  }

  async sendMessage(text: string): Promise<boolean> {
    try {
      const { success, composer, input } = await this.fillMessageInput(text);

      if (!success) {
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
          input?.dispatchEvent(event);
        });
      }

      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  private extractMessagesFromElement(element: Element): Array<{ text: string; sender: 'user' | 'other'; timestamp: number; chatId: string; }> {
    const messages: Array<{ text: string; sender: 'user' | 'other'; timestamp: number; chatId: string; }> = [];
    const messageSelectors = [
      '[data-testid="message"]', '[data-testid="chat-message"]', '.message', '.chat-message', '[role="listitem"]',
      '[data-testid="conversation-item"]', '.conversation-item', 'div[class*="message"]', 'div[class*="chat"]', 'span[class*="text"]', 'p[class*="text"]'
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
      messageElements = element.querySelectorAll('div, span, p');
    }
    messageElements.forEach((msgEl) => {
      const text = this.extractMessageText(msgEl);
      if (text && text.length > 0) {
        const sender = this.determineSender(msgEl);
        const timestamp = this.extractTimestamp(msgEl);
        const chatId = this.getCurrentChatId();
        console.log(`SnapchatDetector: Найдено сообщение: "${text}" от ${sender}`);
        messages.push({ text, sender, timestamp, chatId });
      }
    });
    return messages;
  }

  private extractMessageText(element: Element): string {
    const textSelectors = [
      '[data-testid="message-text"]', '.message-text', '.chat-message-text', 'span', 'p', 'div'
    ];
    
    for (const selector of textSelectors) {
      const textElement = element.querySelector(selector);
      if (textElement && textElement.textContent) {
        return textElement.textContent.trim();
      }
    }
    
    return element.textContent?.trim() || '';
  }

  private determineSender(element: Element): 'user' | 'other' {
    const userIndicators = [
      '[data-testid*="user"]',
      '[class*="user"]',
      '[class*="sent"]',
      '[class*="outgoing"]',
      '[data-sender="self"]'
    ];

    for (const indicator of userIndicators) {
      if (element.closest(indicator)) {
        return 'user';
      }
    }

    const bubbleElement = element.closest('[data-testid*="message"], li, .KB4Aq, .chat-message, .message') || element;

    const resolveLabel = (node: Element | null): string | null => {
      if (!node) {
        return null;
      }

      const labelCandidate = node.querySelector('header .nonIntl, header span, [data-testid*="sender"]');
      const labelText = labelCandidate?.textContent?.trim();

      if (labelText && labelText.length > 0) {
        return labelText.toLowerCase();
      }

      const ariaLabel = node.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.trim().length > 0) {
        return ariaLabel.trim().toLowerCase();
      }

      return null;
    };

    const senderLabel = resolveLabel(bubbleElement);
    const userLabelIndicators = ['me', 'я'];

    if (senderLabel && userLabelIndicators.some(label => senderLabel === label || senderLabel.startsWith(`${label} `))) {
      return 'user';
    }

    const bubble = (bubbleElement.matches('.KB4Aq') ? bubbleElement : bubbleElement.querySelector('.KB4Aq')) as HTMLElement | null;

    const isUserColor = (color: string | null | undefined): boolean => {
      if (!color) {
        return false;
      }

      const normalized = color.toLowerCase();
      return normalized.includes('242, 60, 87') || normalized.includes('#f23c57');
    };

    const isOtherColor = (color: string | null | undefined): boolean => {
      if (!color) {
        return false;
      }

      const normalized = color.toLowerCase();
      return normalized.includes('14, 173, 255') || normalized.includes('#0eadff');
    };

    if (bubble) {
      const inlineStyle = bubble.getAttribute('style') || '';
      if (isUserColor(inlineStyle)) {
        return 'user';
      }
      if (isOtherColor(inlineStyle)) {
        return 'other';
      }

      try {
        const computed = window.getComputedStyle(bubble);
        if (isUserColor(computed.borderColor) || isUserColor(computed.backgroundColor)) {
          return 'user';
        }
        if (isOtherColor(computed.borderColor) || isOtherColor(computed.backgroundColor)) {
          return 'other';
        }
      } catch (error) {
        console.debug('SnapchatDetector: Не удалось получить вычисленные стили пузыря сообщения', error);
      }
    }

    return 'other';
  }

  private extractTimestamp(element: Element): number {
    const timeElement = element.querySelector('time, [data-testid*="time"], [class*="time"]');
    if (timeElement) {
      const datetime = timeElement.getAttribute('datetime');
      if (datetime) {
        const timestamp = Date.parse(datetime);
        if (!isNaN(timestamp)) {
          return timestamp;
        }
      }
    }
    
    return Date.now();
  }

  private getCurrentChatId(): string {
    if (this.activeChatId && !/^unknown$/i.test(this.activeChatId)) {
      return this.activeChatId;
    }

    const urlMatch = window.location.pathname.match(/\/chat\/([^\/]+)/);
    if (urlMatch) {
      this.activeChatId = urlMatch[1];
      return this.activeChatId;
    }

    const id = `chat-${Date.now()}`;
    this.activeChatId = id;
    return id;
  }

  private sanitizeChatTitle(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const normalizedOriginal = value.replace(/\s+/g, ' ').trim();
    if (!normalizedOriginal) {
      return '';
    }

    let text = normalizedOriginal;

    text = text.replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2');
    text = text.replace(/[·•]/g, ' · ');

    const separators = [' · ', ' • ', ' | ', ' — ', ' – '];
    for (const separator of separators) {
      const index = text.indexOf(separator);
      if (index > 0) {
        text = text.slice(0, index).trim();
        break;
      }
    }

    text = text.replace(/\b(received|opened|delivered|sent|pending|typing|just now|minutes ago|hours ago|days ago|tap to chat|viewed)\b.*$/i, '').trim();

    if (!text) {
      return normalizedOriginal;
    }

    return text;
  }

  private extractChatTitle(element: Element): string {
    const titleSelectors = [
      '[data-testid="chat-title"]',
      '[data-testid="conversation-title"]',
      '[id^="title-"]',
      '.mYSR9',
      '.mYSR9 .nonIntl',
      '.FiLwP span',
      '.chat-title',
      '.conversation-title',
      'h1',
      'h2',
      'h3',
      '[role="heading"]',
      '.title',
      '[class*="title"]'
    ];

    for (const selector of titleSelectors) {
      const titleElement = element.querySelector(selector);
      if (titleElement && titleElement.textContent) {
        const sanitized = this.sanitizeChatTitle(titleElement.textContent);
        if (sanitized) {
          return sanitized;
        }
      }
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      const sanitizedLabel = this.sanitizeChatTitle(ariaLabel);
      if (sanitizedLabel) {
        return sanitizedLabel;
      }
    }

    return this.sanitizeChatTitle(element.textContent);
  }

  private extractChatIdentifier(element: Element): string {
    const idSelectors = [
      '[data-testid*="chat"]', '[data-testid*="conversation"]', '[id*="chat"]', '[id*="conversation"]'
    ];
    
    for (const selector of idSelectors) {
      const idElement = element.querySelector(selector);
      if (idElement) {
        const id = idElement.getAttribute('data-testid') || idElement.getAttribute('id');
        if (id) {
          return id;
        }
      }
    }
    
    return `chat-${Date.now()}`;
  }

  private buildStableChatId(rawId: string, title: string, index: number): string {
    const sanitizedTitle = this.sanitizeChatTitle(title);
    const normalizedTitle = sanitizedTitle.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '');
    return `${rawId}-${normalizedTitle}-${index}`;
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

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.activeChatId = null;
    this.chatListItems.clear();
  }
}
