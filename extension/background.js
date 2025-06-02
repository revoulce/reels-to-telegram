/**
 * Simplified background script for Instagram Reels to Telegram extension
 * Sends only video URL and source page URL
 */

const CONFIG = {
    DEFAULT_SERVER_URL: 'http://localhost:3000',
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    TIMEOUT: 30000
};

class BackgroundService {
    constructor() {
        this.setupMessageListener();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'sendToTelegram') {
                this.handleVideoSend(request.data)
                    .then(result => sendResponse({ success: true, result }))
                    .catch(error => {
                        sendResponse({
                            success: false,
                            error: error.message || 'Неизвестная ошибка'
                        });
                    });
                return true; // Keep message channel open for async response
            }
        });
    }

    /**
     * Get extension settings from storage
     */
    async getSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['serverUrl', 'apiKey'], (data) => {
                resolve({
                    serverUrl: data.serverUrl || CONFIG.DEFAULT_SERVER_URL,
                    apiKey: data.apiKey || ''
                });
            });
        });
    }

    /**
     * Validate video data before sending
     */
    validateVideoData(videoData) {
        if (!videoData) {
            throw new Error('Отсутствуют данные видео');
        }

        if (!videoData.videoUrl) {
            throw new Error('URL видео не найден');
        }

        if (!videoData.pageUrl || !videoData.pageUrl.includes('instagram.com')) {
            throw new Error('Некорректный URL страницы Instagram');
        }

        return true;
    }

    /**
     * Fetch with retry mechanism
     */
    async fetchWithRetry(url, options, maxRetries = CONFIG.RETRY_ATTEMPTS) {
        let lastError;

        for (let i = 0; i < maxRetries; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    return response;
                }

                const errorText = await response.text();
                throw new Error(`Ошибка сервера ${response.status}: ${errorText}`);

            } catch (error) {
                lastError = error;

                if (error.name === 'AbortError') {
                    throw new Error('Превышено время ожидания ответа сервера');
                }

                if (i === maxRetries - 1) {
                    throw error;
                }

                // Wait before retry with exponential backoff
                await new Promise(resolve =>
                    setTimeout(resolve, CONFIG.RETRY_DELAY * Math.pow(2, i))
                );
            }
        }

        throw lastError;
    }

    /**
     * Handle video sending with simplified data
     */
    async handleVideoSend(videoData) {
        try {
            // Validate input data
            this.validateVideoData(videoData);

            // Get settings
            const { serverUrl, apiKey } = await this.getSettings();

            if (!apiKey || apiKey.trim().length === 0) {
                throw new Error('API ключ не настроен. Откройте настройки расширения.');
            }

            // Prepare simplified request
            const requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify({
                    videoUrl: videoData.videoUrl,
                    pageUrl: videoData.pageUrl,
                    timestamp: videoData.timestamp || new Date().toISOString()
                })
            };

            // Send request with retry
            const response = await this.fetchWithRetry(
                `${serverUrl}/api/download-video`,
                requestOptions
            );

            const result = await response.json();
            return result;

        } catch (error) {
            // Re-throw with user-friendly message
            throw new Error(this.getUserFriendlyError(error));
        }
    }

    /**
     * Convert technical errors to user-friendly messages
     */
    getUserFriendlyError(error) {
        const message = error.message || error.toString();

        if (message.includes('API ключ')) {
            return 'API ключ не настроен или неверен. Проверьте настройки расширения.';
        }

        if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
            return 'Ошибка сети. Проверьте подключение к интернету и статус сервера.';
        }

        if (message.includes('Ошибка сервера 5')) {
            return 'Внутренняя ошибка сервера. Попробуйте позже.';
        }

        if (message.includes('Ошибка сервера 4')) {
            return 'Неверный запрос. Проверьте настройки или попробуйте другое видео.';
        }

        if (message.includes('превышено время')) {
            return 'Сервер не отвечает. Попробуйте позже.';
        }

        return message;
    }
}

// Initialize background service
new BackgroundService();