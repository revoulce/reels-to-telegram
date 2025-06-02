# 🔧 Troubleshooting Guide v3.0

Руководство по решению реальных проблем с системой очередей Reels to Telegram.

## 📋 Содержание

- [Быстрая диагностика](#быстрая-диагностика)
- [Проблемы сервера](#проблемы-сервера)
- [Проблемы очереди](#проблемы-очереди)
- [Проблемы расширения](#проблемы-расширения)
- [Проблемы производительности](#проблемы-производительности)
- [Диагностические команды](#диагностические-команды)
- [Часто задаваемые вопросы](#часто-задаваемые-вопросы)

## 🚀 Быстрая диагностика

### Проверочный чек-лист

```bash
# 1. Проверка сервера
curl http://localhost:3000/api/health
# Ожидаем: {"status":"OK","version":"3.0.0"}

# 2. Проверка API ключа  
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/queue/stats
# Ожидаем: JSON со статистикой очереди

# 3. Проверка зависимостей
yt-dlp --version
node --version  # Должно быть 16+

# 4. Проверка расширения
# Откройте Instagram Reels - должна появиться кнопка "📤 Send to Telegram"
```

### Системные требования

| Компонент | Минимум | Рекомендуется |
|-----------|---------|---------------|
| **Node.js** | 16.0+ | 18.0+ |
| **RAM** | 512MB | 1GB+ |
| **CPU** | 1 ядро | 2+ ядра |
| **Диск** | 1GB | 5GB+ |
| **Python** | 3.6+ | 3.9+ |

## 🖥️ Проблемы сервера

### ❌ "Server not starting"

**Симптомы:**
- `npm start` завершается с ошибкой
- Порт 3000 недоступен

**Диагностика:**
```bash
# Проверить порт
netstat -tlnp | grep 3000
lsof -i :3000

# Проверить логи
npm start 2>&1 | tee server.log
```

**Решения:**

1. **Порт занят:**
```bash
# Найти процесс на порту 3000
sudo lsof -i :3000

# Убить процесс
sudo kill -9 PID

# Или использовать другой порт в .env
PORT=3001
```

2. **Отсутствуют зависимости:**
```bash
# Переустановить зависимости
rm -rf node_modules package-lock.json
npm install

# Проверить версию Node.js
node --version  # Должно быть 16+
```

3. **Отсутствует .env файл:**
```bash
# Создать .env из примера
cp .env.example .env

# Или запустить setup
npm run setup
```

### 🔌 "Telegram bot not responding"

**Симптомы:**
- Видео обрабатываются но не появляются в Telegram
- Ошибки "Telegram API error" в логах

**Диагностика:**
```bash
# Проверить токен бота
curl "https://api.telegram.org/bot$BOT_TOKEN/getMe"

# Проверить канал  
curl "https://api.telegram.org/bot$BOT_TOKEN/getChat?chat_id=$CHANNEL_ID"
```

**Решения:**

1. **Проверить токен бота:**
```bash
# В .env файле должен быть корректный токен
BOT_TOKEN=1234567890:ABCdefghijklmnopqrstuvwxyz123456789

# Получить новый токен у @BotFather если нужно
```

2. **Проверить права бота:**
- Бот должен быть **администратором** канала
- Права: "Отправка сообщений", "Отправка медиа"

3. **Проверить ID канала:**
```bash
# Формат: @channelname или -1001234567890
CHANNEL_ID=@your_channel_name
```

### 🛠️ "yt-dlp not found"

**Симптомы:**
- Ошибка при запуске: "yt-dlp --version failed"
- Задачи падают с ошибкой скачивания

**Решения:**
```bash
# Установить yt-dlp
pip install yt-dlp

# Или через package manager
brew install yt-dlp  # macOS
sudo apt install yt-dlp  # Ubuntu/Debian

# Проверить установку
yt-dlp --version

# Обновить до последней версии
pip install -U yt-dlp
```

### 📁 "Disk space full"

**Симптомы:**
- "No space left on device" ошибки
- Временные файлы не удаляются

**Диагностика:**
```bash
# Проверить место
df -h
du -sh temp/

# Найти большие файлы в temp
find temp/ -size +50M -ls
```

**Решения:**

1. **Очистка temp папки:**
```bash
# Остановить сервер
npm stop  # или Ctrl+C

# Очистить временные файлы
rm -rf temp/*

# Запустить сервер
npm start
```

2. **Уменьшить лимит размера файлов:**
```bash
# В .env
MAX_FILE_SIZE=26214400  # 25MB вместо 50MB
```

## 🔄 Проблемы очереди

### ❌ "Queue is full"

**Симптомы:**
- Ошибка 500 при добавлении видео
- Сообщение "Queue is full. Please try again later."

**Диагностика:**
```bash
# Проверить статистику очереди
curl -H "X-API-Key: your-key" http://localhost:3000/api/queue/stats
```

**Решения:**

1. **Увеличить размер очереди:**
```bash
# В .env файле
MAX_QUEUE_SIZE=100  # Было 50

# Перезапустить сервер
npm restart
```

2. **Добавить воркеров:**
```bash
# Увеличить количество одновременных обработок
MAX_CONCURRENT_DOWNLOADS=5  # Было 3
npm restart
```

3. **Подождать обработки:**
- Проверить количество задач: `curl -H "X-API-Key: key" localhost:3000/api/queue/stats`
- Дождаться пока `queued` уменьшится

### ⏳ "Tasks stuck in processing"

**Симптомы:**
- Задачи зависают в статусе "processing"
- Прогресс не обновляется больше 10 минут

**Диагностика:**
```bash
# Проверить активные задачи
curl -H "X-API-Key: your-key" http://localhost:3000/api/queue/jobs?limit=10

# Проверить системные ресурсы
top
df -h
```

**Решения:**

1. **Перезапуск сервера:**
```bash
# Остановить и запустить заново
npm stop
npm start

# Или через PM2 если используется
pm2 restart server
```

2. **Увеличить таймауты:**
```bash
# В .env
QUEUE_TIMEOUT=1200000  # 20 минут вместо 10
DOWNLOAD_TIMEOUT=120000  # 2 минуты вместо 1
```

3. **Проверить конкретное видео:**
```bash
# Попробовать скачать вручную
yt-dlp --dump-json "https://instagram.com/reels/test-url/"
```

### 📊 "Progress not updating in extension"

**Симптомы:**
- Прогресс задач не обновляется в панели очереди
- Показываются устаревшие данные

**Решения:**

1. **Обновить страницу Instagram:**
- Ctrl+F5 для полной перезагрузки
- Проверить что расширение активно

2. **Проверить polling:**
```javascript
// В консоли браузера (на странице Instagram)
chrome.runtime.sendMessage({action: 'getActiveJobs'}, console.log);
```

3. **Перезагрузить расширение:**
- Открыть `chrome://extensions/`
- Нажать "Обновить" на расширении

## 📱 Проблемы расширения

### ❌ "Extension button not appearing"

**Симптомы:**
- Кнопка "📤 Send to Telegram" не появляется на Reels
- Расширение неактивно на Instagram

**Диагностика:**
```javascript
// В консоли браузера на instagram.com
console.log('Extension active:', !!window.extensionInstance);

// Проверить обнаружение видео
console.log('Videos found:', document.querySelectorAll('video').length);
```

**Решения:**

1. **Проверить URL страницы:**
- URL должен содержать `/reels/`, `/stories/` или `/p/`
- Работает только на `https://www.instagram.com/*`

2. **Перезагрузить расширение:**
```bash
# В Chrome: chrome://extensions/
# Нажать "Обновить" на расширении
```

3. **Проверить permissions:**
```json
// В manifest.json должно быть:
"host_permissions": ["https://www.instagram.com/*"]
```

### 📱 "Queue panel not opening"

**Симптомы:**
- Shift+клик не открывает панель очереди
- Долгое нажатие не работает

**Диагностика:**
```javascript
// В консоли браузера
console.log('Panel exists:', !!document.getElementById('telegram-queue-panel'));
```

**Решения:**

1. **Правильные hotkeys:**
- **Shift + Left Click** на кнопке - открыть/закрыть панель
- **Long Press (0.5s)** - альтернативный способ

2. **Переинициализация:**
```javascript
// В консоли браузера
if (window.extensionInstance) {
    window.extensionInstance.queuePanel.create();
}
```

3. **Очистить старую панель:**
```javascript
// Удалить старую панель
document.getElementById('telegram-queue-panel')?.remove();
// Обновить страницу
location.reload();
```

### 🔑 "API key not configured"

**Симптомы:**
- Ошибка 401 при отправке видео
- "API ключ не настроен" в уведомлениях

**Решения:**

1. **Настроить в popup:**
- Открыть popup расширения (клик на иконку)
- Ввести URL: `http://localhost:3000`
- Ввести API ключ из `.env` файла
- Нажать "Сохранить"

2. **Проверить API ключ:**
```bash
# В .env файле сервера найти:
API_KEY=your-64-character-api-key

# Скопировать точно в настройки расширения
```

3. **Тест подключения:**
- В popup нажать "🧪 Проверить подключение"
- Должно показать "✅ Подключение успешно!"

## ⚡ Проблемы производительности

### 🐌 "Slow processing"

**Симптомы:**
- Обработка одного видео >2 минут
- Задачи долго висят в очереди

**Диагностика:**
```bash
# Проверить статистику
curl -H "X-API-Key: your-key" http://localhost:3000/api/stats

# Системные ресурсы
top
free -h
```

**Решения:**

1. **Увеличить воркеров (если есть ресурсы):**
```bash
# В .env
MAX_CONCURRENT_DOWNLOADS=5  # Было 3
```

2. **Оптимизация yt-dlp:**
```bash
# Обновить до последней версии
pip install -U yt-dlp

# Добавить cookies для лучшей производительности
# Экспортировать cookies из браузера в cookies.txt
```

3. **Проверить интернет-соединение:**
```bash
# Тест скорости загрузки
curl -o /dev/null -s -w "%{time_total}\n" https://instagram.com
```

### 💾 "High memory usage"

**Симптомы:**
- Сервер потребляет >2GB памяти
- Система становится медленной

**Диагностика:**
```bash
# Проверить память
free -h
ps aux | grep node

# Проверить количество воркеров
curl -H "X-API-Key: your-key" http://localhost:3000/api/queue/stats
```

**Решения:**

1. **Ограничить воркеров:**
```bash
# В .env
MAX_CONCURRENT_DOWNLOADS=2  # Уменьшить с 3
```

2. **Уменьшить размер очереди:**
```bash
# В .env  
MAX_QUEUE_SIZE=25  # Уменьшить с 50
```

3. **Перезапуск при высокой нагрузке:**
```bash
# Добавить в crontab
0 */6 * * * npm restart  # Перезапуск каждые 6 часов
```

## 🔍 Диагностические команды

### Сервер

```bash
# Базовая проверка
curl http://localhost:3000/api/health

# Статистика очереди  
curl -H "X-API-Key: your-key" http://localhost:3000/api/queue/stats

# Список активных задач
curl -H "X-API-Key: your-key" http://localhost:3000/api/queue/jobs?limit=10

# Общая статистика
curl -H "X-API-Key: your-key" http://localhost:3000/api/stats
```

### Расширение

```javascript
// В консоли браузера на instagram.com

// Проверить активность расширения
console.log('Extension:', window.extensionInstance);

// Проверить активные задачи
chrome.runtime.sendMessage({action: 'getActiveJobs'}, console.log);

// Проверить обнаружение видео
console.log('Videos:', document.querySelectorAll('video').length);

// Панель очереди
console.log('Queue panel:', document.getElementById('telegram-queue-panel'));
```

### Система

```bash
# Ресурсы
top
free -h
df -h

# Процессы
ps aux | grep node
ps aux | grep yt-dlp

# Сеть
netstat -tlnp | grep 3000
```

## ❓ Часто задаваемые вопросы

### Общие вопросы

**Q: Сколько видео можно обрабатывать одновременно?**
A: По умолчанию 3 видео параллельно (`MAX_CONCURRENT_DOWNLOADS=3`). Можно увеличить, но учитывайте ресурсы сервера.

**Q: Как долго видео остается в очереди?**
A: Зависит от нагрузки. При 3 воркерах и среднем времени 45 сек на видео, каждая позиция в очереди ≈ 15 секунд ожидания.

**Q: Что происходит при перезапуске сервера?**
A: Все задачи в очереди и обработке теряются. Расширение автоматически обнаружит это и покажет ошибки.

**Q: Можно ли обрабатывать приватные видео Instagram?**
A: Зависит от yt-dlp и cookies. Добавьте cookies в `cookies.txt` для лучшего доступа.

### Технические вопросы

**Q: Почему задача зависла в "processing"?**
A: Возможные причины:
- Большой файл (>50MB)
- Медленный интернет
- Проблемы с Instagram API
- Нехватка ресурсов сервера

**Q: Как увеличить лимит размера файла?**
A: В `.env`: `MAX_FILE_SIZE=104857600` (для 100MB)

**Q: Можно ли запустить несколько серверов?**
A: В текущей версии нет. Каждый сервер работает независимо с собственной очередью.

**Q: Как настроить HTTPS?**
A: Используйте reverse proxy (nginx) или настройте SSL в коде:
```javascript
const https = require('https');
const fs = require('fs');
const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};
https.createServer(options, app).listen(443);
```

### Проблемы интеграции

**Q: Расширение не видит сервер**
A: Проверьте:
1. Сервер запущен на правильном порту
2. API ключ корректный в обеих частях
3. Нет блокировки firewall/antivirus
4. URL в расширении правильный

**Q: Ошибка "Invalid Instagram URL"**
A: URL должен содержать:
- `/reels/` - для Reels
- `/stories/` - для Stories
- `/p/` - для обычных постов
- Домен `instagram.com` или `www.instagram.com`

---

## 🆘 Получение помощи

Если проблема не решена:

1. **Соберите информацию:**
```bash
# Версии
node --version
yt-dlp --version

# Статус сервера
curl http://localhost:3000/api/health

# Логи ошибок из консоли
```

2. **Обратитесь за помощью:**
- [GitHub Issues](https://github.com/revoulce/reels-to-telegram/issues)
- [Discussions](https://github.com/revoulce/reels-to-telegram/discussions)

**Укажите в обращении:**
- Версию Node.js и yt-dlp
- Операционную систему
- Шаги для воспроизведения проблемы
- Скриншоты ошибок
- Вывод диагностических команд

---

**🔧 Большинство проблем решается перезапуском сервера (`npm restart`) и расширения!**