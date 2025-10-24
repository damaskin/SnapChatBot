# Альтернативные бесплатные ИИ API

Поскольку Gemini API не работает с вашим ключом, вот несколько отличных альтернатив:

## 🆓 Бесплатные ИИ API

### 1. 🤖 Hugging Face Inference API
**Преимущества:**
- Полностью бесплатно
- Множество моделей
- Простая интеграция
- Хорошее качество

**Получение API ключа:**
1. Зарегистрируйтесь на [Hugging Face](https://huggingface.co/)
2. Перейдите в [Settings → Access Tokens](https://huggingface.co/settings/tokens)
3. Создайте новый токен
4. Используйте модели: `microsoft/DialoGPT-medium`, `facebook/blenderbot-400M-distill`

### 2. 🧠 Cohere API
**Преимущества:**
- Бесплатный tier: 1000 запросов/месяц
- Отличное качество
- Быстрые ответы
- Хорошая документация

**Получение API ключа:**
1. Зарегистрируйтесь на [Cohere](https://cohere.ai/)
2. Получите API ключ в дашборде
3. Используйте модель: `command`

### 3. 🎭 Anthropic Claude
**Преимущества:**
- Бесплатный tier: $5 кредитов
- Очень качественные ответы
- Длинный контекст
- Безопасность

**Получение API ключа:**
1. Зарегистрируйтесь на [Anthropic](https://console.anthropic.com/)
2. Получите API ключ
3. Используйте модель: `claude-3-haiku-20240307`

### 4. 🔥 Replicate API
**Преимущества:**
- Бесплатные модели
- Различные ИИ модели
- Простое использование
- Хорошая производительность

**Получение API ключа:**
1. Зарегистрируйтесь на [Replicate](https://replicate.com/)
2. Получите API токен
3. Используйте модели: `meta/llama-2-7b-chat`, `mistralai/mistral-7b-instruct-v0.1`

## 🛠 Быстрая интеграция

### Вариант 1: Hugging Face (Рекомендуется)
```typescript
// Простая интеграция с Hugging Face
const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${HF_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    inputs: message,
    parameters: {
      max_length: 100,
      temperature: 0.7
    }
  })
});
```

### Вариант 2: Cohere
```typescript
// Интеграция с Cohere
const response = await fetch('https://api.cohere.ai/v1/generate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${COHERE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'command',
    prompt: message,
    max_tokens: 100,
    temperature: 0.7
  })
});
```

## 🚀 Рекомендации

### Для быстрого старта:
1. **Hugging Face** - самый простой и бесплатный
2. **Cohere** - хорошее качество, простой API
3. **Claude** - лучшее качество, но ограниченный бесплатный tier

### Для продакшена:
1. **OpenAI GPT-3.5** - надежный, но платный
2. **Anthropic Claude** - качественный, умеренная цена
3. **Google Gemini** - когда заработает

## 🔧 Обновление расширения

Хотите, чтобы я обновил расширение для работы с одним из этих API? Выберите предпочтительный вариант:

1. **Hugging Face** - полностью бесплатно, много моделей
2. **Cohere** - хорошее качество, 1000 запросов/месяц
3. **Claude** - лучшее качество, $5 бесплатно
4. **Replicate** - различные модели, гибкость

## 📊 Сравнение API

| API | Бесплатно | Качество | Скорость | Простота |
|-----|-----------|----------|----------|----------|
| Hugging Face | ✅ Полностью | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Cohere | ✅ 1000/месяц | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Claude | ✅ $5 кредитов | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Replicate | ✅ Модели | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

## 🎯 Мой совет

Для вашего Snapchat бота рекомендую:

1. **Начните с Hugging Face** - полностью бесплатно и работает сразу
2. **Попробуйте Cohere** - если нужны более качественные ответы
3. **Переходите на Claude** - когда проект станет популярным

Какой API вы хотите попробовать? Я помогу интегрировать его в расширение!
