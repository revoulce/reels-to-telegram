/**
 * Enhanced background script with queue support for Instagram Reels to Telegram extension
 * Handles job tracking and progress monitoring
 */

const CONFIG = {
    DEFAULT_SERVER_URL: 'http://localhost:3000',
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    TIMEOUT: 30000,
    POLL_INTERVAL: 2000, // Проверять статус каждые 2 секунды
    MAX_POLL_DURATION: 10 * 60 * 1000 // Максимум 10 минут ожидания
};

class BackgroundService {
    constructor() {
        this.activeJobs = new Map(); // jobId -> jobInfo
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
            } else if (request.action === 'getJobStatus') {
                this.getJobStatus(request.jobId)
                    .then(status => sendResponse({ success: true, status }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
            } else if (request.action === 'cancelJob') {
                this.cancelJob(request.jobId)
                    .then(result => sendResponse({ success: true, result }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
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
     * Handle video sending with job queue support
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

            // Send video to queue
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

            const response = await this.fetchWithRetry(
                `${serverUrl}/api/download-video`,
                requestOptions
            );

            const result = await response.json();

            if (!result.success || !result.jobId) {
                throw new Error(result.error || 'Не удалось добавить видео в очередь');
            }

            // Store job info
            const jobInfo = {
                jobId: result.jobId,
                videoData,
                queuePosition: result.queuePosition,
                estimatedWaitTime: result.estimatedWaitTime,
                startedAt: new Date(),
                serverUrl,
                apiKey
            };

            this.activeJobs.set(result.jobId, jobInfo);

            // Start monitoring job
            this.monitorJob(result.jobId);

            return {
                jobId: result.jobId,
                message: `Видео добавлено в очередь (позиция: ${result.queuePosition})`,
                queuePosition: result.queuePosition,
                estimatedWaitTime: result.estimatedWaitTime
            };

        } catch (error) {
            throw new Error(this.getUserFriendlyError(error));
        }
    }

    /**
     * Monitor job progress with polling
     */
    async monitorJob(jobId) {
        const jobInfo = this.activeJobs.get(jobId);
        if (!jobInfo) return;

        const startTime = Date.now();
        let pollCount = 0;

        const pollStatus = async () => {
            try {
                pollCount++;

                // Check timeout
                if (Date.now() - startTime > CONFIG.MAX_POLL_DURATION) {
                    this.cleanupJob(jobId, 'timeout');
                    return;
                }

                const status = await this.getJobStatus(jobId);

                // Notify content script about progress
                this.notifyProgress(jobId, status);

                // Check if job is finished
                if (status.status === 'completed') {
                    this.cleanupJob(jobId, 'completed', status);
                    return;
                } else if (status.status === 'failed') {
                    this.cleanupJob(jobId, 'failed', status);
                    return;
                }

                // Continue polling if still in progress
                if (status.status === 'queued' || status.status === 'processing') {
                    setTimeout(pollStatus, CONFIG.POLL_INTERVAL);
                }

            } catch (error) {
                console.error('Error polling job status:', error);

                // Retry a few times, then give up
                if (pollCount < 5) {
                    setTimeout(pollStatus, CONFIG.POLL_INTERVAL * 2);
                } else {
                    this.cleanupJob(jobId, 'error', { error: error.message });
                }
            }
        };

        // Start polling
        setTimeout(pollStatus, CONFIG.POLL_INTERVAL);
    }

    /**
     * Get job status from server
     */
    async getJobStatus(jobId) {
        const jobInfo = this.activeJobs.get(jobId);
        if (!jobInfo) {
            throw new Error('Job not found in active jobs');
        }

        const response = await this.fetchWithRetry(
            `${jobInfo.serverUrl}/api/job/${jobId}`,
            {
                method: 'GET',
                headers: {
                    'X-API-Key': jobInfo.apiKey
                }
            }
        );

        return await response.json();
    }

    /**
     * Cancel job on server
     */
    async cancelJob(jobId) {
        const jobInfo = this.activeJobs.get(jobId);
        if (!jobInfo) {
            throw new Error('Job not found');
        }

        const response = await this.fetchWithRetry(
            `${jobInfo.serverUrl}/api/job/${jobId}`,
            {
                method: 'DELETE',
                headers: {
                    'X-API-Key': jobInfo.apiKey
                }
            }
        );

        const result = await response.json();
        this.cleanupJob(jobId, 'cancelled');

        return result;
    }

    /**
     * Notify content script about job progress
     */
    notifyProgress(jobId, status) {
        // Send message to all Instagram tabs
        chrome.tabs.query({url: "*://www.instagram.com/*"}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'jobProgress',
                    jobId,
                    status
                }).catch(() => {
                    // Ignore errors if content script is not loaded
                });
            });
        });
    }

    /**
     * Cleanup job after completion
     */
    cleanupJob(jobId, reason, details = {}) {
        const jobInfo = this.activeJobs.get(jobId);
        if (!jobInfo) return;

        console.log(`🧹 Cleaning up job ${jobId}: ${reason}`);

        // Notify content script about final status
        chrome.tabs.query({url: "*://www.instagram.com/*"}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'jobFinished',
                    jobId,
                    reason,
                    details
                }).catch(() => {
                    // Ignore errors
                });
            });
        });

        // Remove from active jobs
        this.activeJobs.delete(jobId);
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

        if (message.includes('Queue is full')) {
            return 'Очередь переполнена. Попробуйте позже.';
        }

        return message;
    }

    /**
     * Get all active jobs (for popup/debugging)
     */
    getActiveJobs() {
        const jobs = [];
        for (const [jobId, jobInfo] of this.activeJobs.entries()) {
            jobs.push({
                jobId,
                pageUrl: jobInfo.videoData.pageUrl,
                startedAt: jobInfo.startedAt,
                queuePosition: jobInfo.queuePosition
            });
        }
        return jobs;
    }
}

// Initialize background service
const backgroundService = new BackgroundService();

// Handle extension icon click - could show queue status
chrome.action.onClicked.addListener((tab) => {
    // Open popup with queue status or settings
    chrome.runtime.openOptionsPage();
});

// Cleanup on extension restart
chrome.runtime.onStartup.addListener(() => {
    console.log('🔄 Extension started, clearing active jobs');
    if (backgroundService) {
        backgroundService.activeJobs.clear();
    }
});

// Export for debugging
if (typeof window !== 'undefined') {
    window.backgroundService = backgroundService;
}