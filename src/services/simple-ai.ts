import { ChatMessage, AIAgent } from '../types';

class SimpleAIService {
  private responses = [
    'Привет! Как дела? 😊',
    'Отлично! А у тебя как?',
    'Хорошо, спасибо! 👍',
    'Все супер! 🚀',
    'Нормально, работаю 💼',
    'Отлично! Как настроение? 😄',
    'Круто! Расскажи что нового?',
    'Супер! Чем занимаешься?',
    'Отлично! Как дела?',
    'Хорошо! Что планируешь?'
  ];

  private greetings = [
    'привет', 'hello', 'hi', 'hey', 'здравствуй', 'добро пожаловать'
  ];

  private questions = [
    'как дела', 'что делаешь', 'как поживаешь', 'как жизнь', 
    'что нового', 'как настроение', 'чем занимаешься'
  ];

  private thanks = [
    'спасибо', 'thanks', 'thank you', 'благодарю', 'спс'
  ];

  private goodbyes = [
    'пока', 'bye', 'до свидания', 'увидимся', 'до встречи'
  ];

  private positive = [
    'хорошо', 'отлично', 'супер', 'круто', 'класс', 'замечательно'
  ];

  async generateResponse(
    messages: ChatMessage[], 
    agent: AIAgent, 
    context: string = ''
  ): Promise<string> {
    const lastMessage = messages[messages.length - 1];
    const message = lastMessage.text.toLowerCase();

    // Анализируем сообщение и генерируем ответ
    let response = this.analyzeMessageForResponse(message);

    // Добавляем эмодзи в зависимости от личности агента
    response = this.addPersonalityEmojis(response, agent.personality);

    // Добавляем случайность для разнообразия
    if (Math.random() < 0.3) {
      response = this.addRandomVariation(response);
    }

    return response;
  }

  private analyzeMessageForResponse(message: string): string {
    // Приветствие
    if (this.greetings.some(g => message.includes(g))) {
      return this.getRandomResponse([
        'Привет! Как дела? 😊',
        'Привет! Рад тебя видеть! 👋',
        'Привет! Что нового?',
        'Привет! Как настроение?'
      ]);
    }

    // Вопросы о состоянии
    if (this.questions.some(q => message.includes(q))) {
      return this.getRandomResponse([
        'Отлично! А у тебя как?',
        'Хорошо, спасибо! А ты как?',
        'Все супер! Как сам?',
        'Нормально, работаю! А ты?'
      ]);
    }

    // Благодарность
    if (this.thanks.some(t => message.includes(t))) {
      return this.getRandomResponse([
        'Пожалуйста! Рад помочь! 😊',
        'Не за что! Всегда рад!',
        'Пожалуйста! Обращайся!',
        'Рад помочь! 😄'
      ]);
    }

    // Прощание
    if (this.goodbyes.some(g => message.includes(g))) {
      return this.getRandomResponse([
        'Пока! Увидимся! 👋',
        'До свидания! Было приятно!',
        'Пока! Хорошего дня!',
        'До встречи! 👋'
      ]);
    }

    // Позитивные слова
    if (this.positive.some(p => message.includes(p))) {
      return this.getRandomResponse([
        'Отлично! Рад за тебя! 🎉',
        'Супер! Это здорово!',
        'Круто! Продолжай в том же духе!',
        'Замечательно! 🚀'
      ]);
    }

    // Вопросы
    if (message.includes('?')) {
      return this.getRandomResponse([
        'Интересный вопрос! 🤔',
        'Хороший вопрос!',
        'Интересно! Расскажи больше',
        'Любопытно! Что думаешь?'
      ]);
    }

    // Дефолтный ответ
    return this.getRandomResponse([
      'Интересно! Расскажи больше 😊',
      'Понятно! Что еще?',
      'Хорошо! Продолжай',
      'Отлично! Что думаешь?'
    ]);
  }

  private addPersonalityEmojis(response: string, personality: string): string {
    const lowerPersonality = personality.toLowerCase();

    if (lowerPersonality.includes('веселый') || lowerPersonality.includes('радостный')) {
      return response + ' 😄🎉';
    }

    if (lowerPersonality.includes('дружелюбный') || lowerPersonality.includes('добрый')) {
      return response + ' 😊🤝';
    }

    if (lowerPersonality.includes('профессиональный') || lowerPersonality.includes('серьезный')) {
      return response.replace(/[😊😄🎉]/g, '') + ' 💼';
    }

    if (lowerPersonality.includes('креативный') || lowerPersonality.includes('творческий')) {
      return response + ' 🎨✨';
    }

    return response;
  }

  private addRandomVariation(response: string): string {
    const variations = [
      ' Кстати,',
      ' Кстати,',
      ' А знаешь что?',
      ' Кстати, интересно!',
      ' Кстати,'
    ];

    if (Math.random() < 0.5) {
      return response + variations[Math.floor(Math.random() * variations.length)];
    }

    return response;
  }

  private getRandomResponse(responses: string[]): string {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  async analyzeMessage(message: string, keywords: string[]): Promise<{
    shouldRespond: boolean;
    priority: 'low' | 'medium' | 'high';
    sentiment: 'positive' | 'neutral' | 'negative';
  }> {
    const lowerMessage = message.toLowerCase();
    
    // Проверяем ключевые слова
    const hasKeywords = keywords.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );

    // Простой анализ настроения
    const positiveWords = ['хорошо', 'отлично', 'супер', 'класс', 'спасибо', 'thanks', 'good', 'great'];
    const negativeWords = ['плохо', 'ужасно', 'проблема', 'bad', 'terrible', 'problem'];
    
    const isPositive = positiveWords.some(word => lowerMessage.includes(word));
    const isNegative = negativeWords.some(word => lowerMessage.includes(word));

    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (isPositive) sentiment = 'positive';
    else if (isNegative) sentiment = 'negative';

    return {
      shouldRespond: hasKeywords || message.length > 5,
      priority: hasKeywords ? 'high' : 'medium',
      sentiment
    };
  }

  async generatePersonalityPrompt(basePersonality: string): Promise<string> {
    return `${basePersonality}

Стиль общения: дружелюбный и отзывчивый
Темперамент: позитивный и оптимистичный  
Специализация: помощь и поддержка пользователей
Особенности речи: используй эмодзи, будь кратким но информативным
Примеры фраз: "Привет! Как дела? 😊", "Отлично! А у тебя как?", "Спасибо! Рад помочь! 👍"`;
  }

  async testConnection(): Promise<boolean> {
    // Простой ИИ всегда работает
    return true;
  }
}

export const simpleAIService = new SimpleAIService();
