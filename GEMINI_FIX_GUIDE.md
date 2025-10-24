# 🔧 Исправление Gemini API

## Проблема
Ваш API ключ `AIzaSyB1fsG5NFKa7uMl50JrcToCO-fhJNPIV_k` не работает, потому что:
1. **Gemini API не активирован** в Google Cloud Console
2. **Нет доступа к Generative Language API**
3. **Требуется настройка проекта**

## 🛠 Пошаговое решение

### Шаг 1: Активация Gemini API

1. **Откройте Google Cloud Console**
   - Перейдите на [console.cloud.google.com](https://console.cloud.google.com/)

2. **Создайте или выберите проект**
   - Нажмите на выпадающий список проектов вверху
   - Нажмите "New Project"
   - Название: `snapchat-bot-gemini`
   - Нажмите "Create"

3. **Активируйте Generative Language API**
   - В боковом меню: **APIs & Services** → **Library**
   - В поиске введите: `Generative Language API`
   - Нажмите на результат
   - Нажмите **"Enable"** (Включить)

### Шаг 2: Настройка биллинга

1. **Перейдите в Billing**
   - В боковом меню: **Billing**
   - Нажмите **"Link a billing account"**
   - Привяжите карту (даже для бесплатного использования)

2. **Проверьте квоты**
   - Перейдите в **APIs & Services** → **Quotas**
   - Найдите "Generative Language API"
   - Убедитесь, что квоты активны

### Шаг 3: Создание нового API ключа

1. **Перейдите в Credentials**
   - **APIs & Services** → **Credentials**
   - Нажмите **"+ CREATE CREDENTIALS"** → **"API key"**

2. **Настройте ограничения (рекомендуется)**
   - Нажмите на созданный ключ
   - **Application restrictions**: None (для тестирования)
   - **API restrictions**: Select APIs → Generative Language API
   - Нажмите **"Save"**

3. **Скопируйте новый ключ**
   - Замените старый ключ в расширении

### Шаг 4: Тестирование

После настройки протестируйте новый ключ:

```bash
# Запустите тест
node test-gemini-new.js
```

## 🚨 Альтернативное решение

Если Gemini API все еще не работает, попробуйте:

### Вариант 1: Использовать Google AI Studio напрямую
1. Перейдите на [makersuite.google.com](https://makersuite.google.com/)
2. Создайте новый API ключ
3. Используйте этот ключ

### Вариант 2: Проверить региональные ограничения
1. Используйте VPN (если Gemini недоступен в вашем регионе)
2. Попробуйте с другого IP-адреса

### Вариант 3: Обратиться в поддержку Google
1. [Google Cloud Support](https://cloud.google.com/support)
2. [Stack Overflow](https://stackoverflow.com/questions/tagged/google-ai)

## 🔍 Диагностика

### Проверьте статус API
```bash
# Проверьте доступность API
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://generativelanguage.googleapis.com/v1/models"
```

### Проверьте квоты
1. Google Cloud Console → **APIs & Services** → **Quotas**
2. Найдите "Generative Language API"
3. Проверьте лимиты запросов

### Проверьте логи
1. Google Cloud Console → **Logging**
2. Фильтр: "Generative Language API"
3. Ищите ошибки доступа

## ✅ Ожидаемый результат

После правильной настройки:
- ✅ API ключ работает
- ✅ Модели доступны
- ✅ Запросы проходят успешно
- ✅ Расширение работает с Gemini

## 🆘 Если ничего не помогает

Попробуйте альтернативные ИИ API:
1. **Hugging Face** - полностью бесплатно
2. **Cohere** - 1000 запросов/месяц бесплатно
3. **Anthropic Claude** - $5 кредитов бесплатно

---

**💡 Совет**: Если у вас нет времени на настройку Gemini, я могу быстро переключить расширение на Hugging Face API, который работает сразу без настройки!
