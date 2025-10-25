import { GeminiConfig, ChatMessage, AIAgent } from '../types';

class GeminiService {
  private config: GeminiConfig | null = null;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  initialize(config: GeminiConfig): void {
    this.config = config;
    console.log('Gemini service initialized with model:', config.model);
  }

  async testConnection(configOverride?: GeminiConfig): Promise<boolean> {
    try {
      const activeConfig = this.resolveConfig(configOverride);
      console.log('Testing Gemini connection...');
      const response = await this.callGeminiAPI({
        prompt: 'Привет! Это тест подключения к Gemini API.',
        temperature: 0.7,
        maxTokens: 50
      }, activeConfig);

      console.log('Gemini test response:', response.content);
      return !!response.content && response.content.length > 0;
    } catch (error) {
      console.error('Gemini connection test failed:', error);
      return false;
    }
  }

  async analyzeMessage(messageText: string, keywords: string[]): Promise<{ shouldRespond: boolean; sentiment: string }> {
    const prompt = `Сообщение: "${messageText}"
Ключевые слова для ответа: ${keywords.join(', ')}

ВАЖНО: Верни ТОЛЬКО валидный JSON без дополнительного текста!

Проанализируй сообщение и определи:
1. Нужно ли отвечать на это сообщение? Отвечать нужно, если сообщение содержит одно из ключевых слов или является вопросом, или требует реакции.
2. Определи общий сентимент сообщения (позитивный, негативный, нейтральный).

Формат ответа:
{"shouldRespond": true, "sentiment": "neutral"}`;

    try {
      const activeConfig = this.resolveConfig();
      const response = await this.callGeminiAPI({
        prompt,
        temperature: 0.3,
        maxTokens: 100
      }, activeConfig);

      const rawContent = response.content?.trim() ?? '';

      if (!rawContent) {
        console.warn('Gemini analysis returned empty content, skipping response analysis');
        return { shouldRespond: false, sentiment: 'neutral' };
      }

      try {
        const analysis = JSON.parse(rawContent);
        return analysis;
      } catch (parseError) {
        console.error('Error parsing Gemini response as JSON:', parseError);
        console.error('Raw response content:', rawContent);
        // Возвращаем безопасный анализ по умолчанию
        return { shouldRespond: false, sentiment: 'neutral' };
      }
    } catch (error) {
      console.error('Error analyzing message with Gemini:', error);
      return { shouldRespond: false, sentiment: 'neutral' };
    }
  }

  async generateResponse(
    messages: ChatMessage[],
    agent: AIAgent,
    chatContext: string = ''
  ): Promise<string> {
    const systemPrompt = `Ты - ИИ ассистент по имени ${agent.name}. Твоя личность: ${agent.personality}.
Твоя задача - вести диалог в Snapchat.
Дополнительный контекст чата: ${chatContext}
Правила:
- Отвечай в стиле ${agent.personality}
- Учитывай контекст предыдущих сообщений
- Будь кратким, но информативным
- Не упоминай, что ты ИИ
- Отвечай на том же языке, что и собеседник`;

    const conversationHistory = messages.map(msg => {
      const role = msg.sender === 'bot' ? 'Ассистент' : 'Пользователь';
      return `${role}: ${msg.text}`;
    }).join('\n');

    const prompt = `${systemPrompt}\n\nИстория диалога:\n${conversationHistory}\n\nАссистент:`;

    try {
      const activeConfig = this.resolveConfig();
      const response = await this.callGeminiAPI({
        prompt,
        temperature: activeConfig.temperature,
        maxTokens: activeConfig.maxOutputTokens
      }, activeConfig);

      return response.content;
    } catch (error) {
      console.error('Error generating response with Gemini:', error);
      throw error;
    }
  }

  private resolveConfig(configOverride?: GeminiConfig): GeminiConfig {
    const activeConfig = configOverride ?? this.config;

    if (!activeConfig) {
      throw new Error('Gemini config not initialized');
    }

    return activeConfig;
  }

  private async callGeminiAPI(request: {
    prompt: string;
    temperature: number;
    maxTokens: number;
  }, config: GeminiConfig): Promise<{ content: string; metadata: any }> {
    const payload = {
      contents: [{
        parts: [{
          text: request.prompt
        }]
      }],
      generationConfig: {
        temperature: request.temperature,
        topK: config.topK ?? 40,
        topP: config.topP ?? 0.95,
        maxOutputTokens: request.maxTokens,
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey
    };

    const url = `${this.baseUrl}/${config.model}:generateContent`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const content = parts
        .map((part: { text?: string }) => part?.text ?? '')
        .join('')
        .trim();

      return {
        content,
        metadata: {
          tokens: data.usageMetadata?.totalTokenCount || 0,
          processingTime: Date.now()
        }
      };
    } catch (error) {
      console.error('Ошибка вызова Gemini API:', error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();

