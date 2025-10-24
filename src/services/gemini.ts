import { GeminiConfig, ChatMessage, AIAgent } from '../types';

class GeminiService {
  private config: GeminiConfig | null = null;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  initialize(config: GeminiConfig): void {
    this.config = config;
    console.log('Gemini service initialized with model:', config.model);
  }

  async testConnection(): Promise<boolean> {
    if (!this.config) {
      console.error('Gemini config not initialized');
      return false;
    }

    try {
      console.log('Testing Gemini connection...');
      const response = await this.callGeminiAPI({
        prompt: 'Привет! Это тест подключения к Gemini API.',
        temperature: 0.7,
        maxTokens: 50
      });
      
      console.log('Gemini test response:', response.content);
      return !!response.content && response.content.length > 0;
    } catch (error) {
      console.error('Gemini connection test failed:', error);
      return false;
    }
  }

  async analyzeMessage(messageText: string, keywords: string[]): Promise<{ shouldRespond: boolean; sentiment: string }> {
    if (!this.config) {
      throw new Error('Gemini config not initialized');
    }

    const prompt = `Сообщение: "${messageText}"
Ключевые слова для ответа: ${keywords.join(', ')}
Проанализируй сообщение и определи:
1. Нужно ли отвечать на это сообщение? Отвечать нужно, если сообщение содержит одно из ключевых слов или является вопросом, или требует реакции.
2. Определи общий сентимент сообщения (позитивный, негативный, нейтральный).
Ответ должен быть в формате JSON: {"shouldRespond": boolean, "sentiment": "string"}`;

    try {
      const response = await this.callGeminiAPI({
        prompt,
        temperature: 0.3,
        maxTokens: 100
      });
      
      const analysis = JSON.parse(response.content);
      return analysis;
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
    if (!this.config) {
      throw new Error('Gemini config not initialized');
    }

    const systemPrompt = `Ты - ИИ ассистент по имени ${agent.name}. Твоя личность: ${agent.personality}.
Твоя задача - вести диалог в Snapchat.
Дополнительный контекст чата: ${chatContext}
Правила:
- Отвечай в стиле ${agent.personality}
- Учитывай контекст предыдущих сообщений
- Будь кратким, но информативным
- Не упоминай, что ты ИИ
- Отвечай на том же языке, что и собеседник`;

    const conversationHistory = messages.map(msg => 
      `${msg.sender === 'user' ? 'Пользователь' : 'Ассистент'}: ${msg.text}`
    ).join('\n');

    const prompt = `${systemPrompt}\n\nИстория диалога:\n${conversationHistory}\n\nАссистент:`;

    try {
      const response = await this.callGeminiAPI({
        prompt,
        temperature: this.config.temperature,
        maxTokens: this.config.maxOutputTokens
      });
      
      return response.content;
    } catch (error) {
      console.error('Error generating response with Gemini:', error);
      throw error;
    }
  }

  private async callGeminiAPI(request: {
    prompt: string;
    temperature: number;
    maxTokens: number;
  }): Promise<{ content: string; metadata: any }> {
    if (!this.config) {
      throw new Error('Gemini config not initialized');
    }

    const payload = {
      contents: [{
        parts: [{
          text: request.prompt
        }]
      }],
      generationConfig: {
        temperature: request.temperature,
        topK: this.config.topK || 40,
        topP: this.config.topP || 0.95,
        maxOutputTokens: request.maxTokens,
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.config.apiKey
    };

    const url = `${this.baseUrl}/${this.config.model}:generateContent`;

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
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
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