import { ChatMessage, AIAgent } from '../types';

interface HuggingFaceConfig {
  apiKey: string;
  model: string;
  maxLength: number;
  temperature: number;
}

class HuggingFaceService {
  private config: HuggingFaceConfig | null = null;
  private baseUrl = 'https://api-inference.huggingface.co/models';

  initialize(config: HuggingFaceConfig): void {
    this.config = config;
  }

  async generateResponse(
    messages: ChatMessage[], 
    agent: AIAgent, 
    context: string = ''
  ): Promise<string> {
    if (!this.config) {
      throw new Error('Hugging Face not initialized');
    }

    try {
      // Берем последнее сообщение для ответа
      const lastMessage = messages[messages.length - 1];
      const prompt = this.buildPrompt(lastMessage.text, agent, context);

      const response = await fetch(`${this.baseUrl}/${this.config.model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_length: this.config.maxLength,
            temperature: this.config.temperature,
            do_sample: true,
            return_full_text: false
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        return data[0].generated_text || 'Извините, не могу сформулировать ответ.';
      } else if (data.generated_text) {
        return data.generated_text;
      } else {
        return 'Извините, не могу сформулировать ответ.';
      }
    } catch (error) {
      console.error('Hugging Face API error:', error);
      throw new Error('Ошибка при генерации ответа от ИИ');
    }
  }

  private buildPrompt(message: string, agent: AIAgent, context: string): string {
    return `${agent.systemPrompt}

Контекст: ${context}
Личность: ${agent.personality}

Пользователь: ${message}
${agent.name}:`;
  }

  async analyzeMessage(message: string, keywords: string[]): Promise<{
    shouldRespond: boolean;
    priority: 'low' | 'medium' | 'high';
    sentiment: 'positive' | 'neutral' | 'negative';
  }> {
    // Простой анализ на основе ключевых слов
    const hasKeywords = keywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );

    const shouldRespond = hasKeywords || message.length > 10;
    
    // Простой анализ настроения
    const positiveWords = ['хорошо', 'отлично', 'супер', 'класс', 'спасибо', 'thanks', 'good', 'great'];
    const negativeWords = ['плохо', 'ужасно', 'проблема', 'bad', 'terrible', 'problem'];
    
    const isPositive = positiveWords.some(word => 
      message.toLowerCase().includes(word)
    );
    const isNegative = negativeWords.some(word => 
      message.toLowerCase().includes(word)
    );

    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (isPositive) sentiment = 'positive';
    else if (isNegative) sentiment = 'negative';

    return {
      shouldRespond,
      priority: shouldRespond ? 'medium' : 'low',
      sentiment
    };
  }

  async generatePersonalityPrompt(basePersonality: string): Promise<string> {
    // Возвращаем базовую личность с небольшими улучшениями
    return `${basePersonality}

Стиль общения: дружелюбный и отзывчивый
Темперамент: позитивный и оптимистичный
Специализация: помощь и поддержка пользователей
Особенности речи: используй эмодзи, будь кратким но информативным`;
  }

  async testConnection(): Promise<boolean> {
    if (!this.config) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/${this.config.model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: 'Привет! Это тест подключения.',
          parameters: {
            max_length: 50,
            temperature: 0.7,
            do_sample: true,
            return_full_text: false
          }
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Hugging Face connection test failed:', error);
      return false;
    }
  }
}

export const huggingFaceService = new HuggingFaceService();
