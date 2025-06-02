# Instagram Reels to Telegram Extension v2.1 (Simplified)

Упрощенное Chrome расширение для отправки ссылок на Instagram Reels и Stories в Telegram через Node.js сервер.

## ✨ Что делает расширение

- 🎯 **Находит видео** на страницах Instagram Reels и Stories
- 📤 **Отправляет только ссылку** на источник видео (без автора, описания, лайков)
- 🔗 **Передает на сервер**: URL видео + ссылка на страницу Instagram
- ⚡ **Минимальный код** - убрана вся отладка и сложная логика

## 📁 Файлы расширения

```
instagram-reels-extension/
├── manifest.json          # Манифест расширения
├── background.js          # Фоновый скрипт (упрощенный)
├── content.js             # Скрипт страницы (упрощенный)
├── popup.html             # Интерфейс настроек
├── popup.js               # Логика настроек
└── icons/                 # Иконки расширения (нужно создать)
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## 🛠️ Установка

### 1. Подготовка файлов
1. Создайте папку для расширения
2. Скопируйте все файлы из артефактов выше
3. Создайте простые иконки или используйте placeholder'ы

### 2. Загрузка в Chrome
1. Откройте `chrome://extensions/`
2. Включите "Режим разработчика"
3. Нажмите "Загрузить распакованное расширение"
4. Выберите папку с файлами

### 3. Настройка
1. Кликните на иконку расширения
2. Введите URL сервера: `http://localhost:3000`
3. Введите API ключ
4. Нажмите "Сохранить"

## 🎯 Использование

1. **Откройте Instagram Reels или Stories**
2. **Появится кнопка "📤 Send to Telegram"**
3. **Нажмите кнопку** для отправки
4. **Видео отправится** на ваш сервер

## 📊 Что отправляется на сервер

```json
{
  "videoUrl": "blob:https://www.instagram.com/...",
  "pageUrl": "https://www.instagram.com/reels/...",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Больше никаких данных не извлекается и не отправляется.**

## ⚙️ Настройки сервера

Ваш Node.js сервер должен обрабатывать:

### POST /api/download-video
```javascript
// Входящий запрос
{
  "videoUrl": "blob:https://...",
  "pageUrl": "https://instagram.com/reels/...",
  "timestamp": "2024-01-01T00:00:00.000Z"
}

// Ответ при успехе
{
  "success": true,
  "message": "Video sent successfully"
}
```

### GET /api/health (опционально)
```javascript
// Ответ
{
  "status": "OK"
}
```

## 🔧 Код сервера (пример)

```javascript
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Middleware для проверки API ключа
app.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== 'your-secret-api-key') {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
});

// Обработка видео
app.post('/api/download-video', async (req, res) => {
    try {
        const { videoUrl, pageUrl, timestamp } = req.body;
        
        console.log('Received video:', {
            videoUrl: videoUrl ? 'present' : 'missing',
            pageUrl,
            timestamp
        });
        
        // Здесь ваша логика:
        // 1. Скачать видео по videoUrl
        // 2. Отправить в Telegram
        // 3. Сохранить ссылку pageUrl как источник
        
        res.json({
            success: true,
            message: 'Video processed successfully'
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Проверка здоровья сервера
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK' });
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
```

## 🚀 Преимущества упрощенной версии

- ✅ **Быстрая работа** - минимум кода
- ✅ **Надежность** - меньше точек отказа
- ✅ **Простота** - легко понять и модифицировать
- ✅ **Конфиденциальность** - не извлекает личные данные
- ✅ **Универсальность** - работает с любыми Reels/Stories

## 🔒 Безопасность

- API ключ настраивается через интерфейс
- Отправляются только URL'ы, никаких персональных данных
- Валидация всех входящих данных
- Retry механизм при ошибках сети

## 📝 Изменения в v2.1

- ❌ Убрано извлечение автора и описания
- ❌ Убрана вся отладочная информация
- ❌ Убрана аналитика и статистика
- ❌ Убраны сложные алгоритмы парсинга
- ✅ Оставлена только передача ссылок
- ✅ Упрощен весь код базы
- ✅ Улучшена производительность

## ❓ FAQ

**Q: Почему не извлекается автор/описание?**
A: Для простоты и надежности. Ссылка на источник содержит всю нужную информацию.

**Q: Как получить данные об авторе?**
A: Используйте pageUrl для парсинга данных на сервере или через Instagram API.

**Q: Работает ли с Stories?**
A: Да, расширение работает как с Reels, так и со Stories.

**Q: Можно ли вернуть извлечение данных?**
A: Да, используйте предыдущую версию (v2.0) с полным функционалом.

## 📞 Поддержка

При проблемах:
1. Проверьте настройки в popup
2. Убедитесь, что сервер запущен
3. Проверьте консоль браузера на ошибки
4. Используйте кнопку "Проверить подключение"