/**
 * Enhanced content script with queue support and progress tracking
 * Shows multiple job statuses and progress indicators
 */

const CONFIG = {
    SELECTORS: {
        VIDEO: [
            'video[playsinline]',
            'video.x1lliihq',
            'article video',
            'div[role="presentation"] video',
            'div[role="dialog"] video'
        ]
    },
    UI: {
        BUTTON_ID: 'telegram-send-button',
        QUEUE_PANEL_ID: 'telegram-queue-panel'
    },
    PATHS: {
        REELS: ['/reels/', '/reel/'],
        STORIES: ['/stories/']
    }
};

class VideoExtractor {
    findVideo() {
        for (const selector of CONFIG.SELECTORS.VIDEO) {
            const video = document.querySelector(selector);
            if (video && video.src) {
                return video;
            }
        }
        return null;
    }

    extractVideoData() {
        const video = this.findVideo();
        if (!video || !video.src) {
            return null;
        }

        return {
            videoUrl: video.src,
            pageUrl: window.location.href,
            timestamp: new Date().toISOString()
        };
    }

    isVideoPage() {
        const path = window.location.pathname;
        return CONFIG.PATHS.REELS.some(p => path.includes(p)) ||
            CONFIG.PATHS.STORIES.some(p => path.includes(p));
    }
}

class NotificationManager {
    static show(message, type = 'info', duration = 3000) {
        document.querySelectorAll('.reels-notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `reels-notification reels-notification--${type}`;
        notification.textContent = message;

        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            zIndex: '999999',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '14px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease'
        });

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-50%) translateY(-10px)';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
}

class QueuePanel {
    constructor() {
        this.panel = null;
        this.jobs = new Map(); // jobId -> jobElement
        this.create();
    }

    create() {
        this.remove();

        this.panel = document.createElement('div');
        this.panel.id = CONFIG.UI.QUEUE_PANEL_ID;

        Object.assign(this.panel.style, {
            position: 'fixed',
            top: '80px',
            right: '20px',
            width: '300px',
            maxHeight: '400px',
            overflowY: 'auto',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #ddd',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            zIndex: '99998',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            display: 'none',
            backdropFilter: 'blur(10px)'
        });

        // Header
        const header = document.createElement('div');
        header.innerHTML = `
            <div style="padding: 15px; border-bottom: 1px solid #eee; font-weight: 600; color: #333; display: flex; justify-content: space-between; align-items: center;">
                <span>📤 Очередь отправки</span>
                <button id="queue-panel-close" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #666;">×</button>
            </div>
        `;

        this.panel.appendChild(header);

        // Jobs container
        this.jobsContainer = document.createElement('div');
        this.jobsContainer.style.padding = '10px';
        this.panel.appendChild(this.jobsContainer);

        // Close button
        header.querySelector('#queue-panel-close').addEventListener('click', () => {
            this.hide();
        });

        document.body.appendChild(this.panel);
    }

    show() {
        if (this.panel) {
            this.panel.style.display = 'block';
        }
    }

    hide() {
        if (this.panel) {
            this.panel.style.display = 'none';
        }
    }

    toggle() {
        if (this.panel.style.display === 'none') {
            this.show();
        } else {
            this.hide();
        }
    }

    addJob(jobId, jobData) {
        const jobElement = document.createElement('div');
        jobElement.className = 'queue-job';
        jobElement.style.cssText = `
            margin-bottom: 10px;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #0088cc;
            position: relative;
        `;

        const videoTitle = this.extractTitleFromUrl(jobData.pageUrl);

        jobElement.innerHTML = `
            <div style="font-size: 12px; color: #666; margin-bottom: 5px;">
                ${jobId.substring(0, 8)}...
            </div>
            <div style="font-size: 14px; color: #333; margin-bottom: 8px; font-weight: 500;">
                ${videoTitle}
            </div>
            <div class="job-status" style="font-size: 12px; color: #0088cc; margin-bottom: 8px;">
                ⏳ В очереди (позиция: ${jobData.queuePosition || '?'})
            </div>
            <div class="job-progress" style="display: none;">
                <div style="background: #e9ecef; height: 4px; border-radius: 2px; overflow: hidden; margin-bottom: 5px;">
                    <div class="progress-bar" style="background: #0088cc; height: 100%; width: 0%; transition: width 0.3s ease;"></div>
                </div>
                <div class="progress-text" style="font-size: 11px; color: #666;"></div>
            </div>
            <button class="cancel-btn" style="
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                color: #999;
                cursor: pointer;
                font-size: 16px;
                padding: 2px;
            ">×</button>
        `;

        // Cancel button handler
        jobElement.querySelector('.cancel-btn').addEventListener('click', () => {
            this.cancelJob(jobId);
        });

        this.jobs.set(jobId, jobElement);
        this.jobsContainer.appendChild(jobElement);

        this.updateJobCount();
        this.show();
    }

    updateJob(jobId, status) {
        const jobElement = this.jobs.get(jobId);
        if (!jobElement) return;

        const statusEl = jobElement.querySelector('.job-status');
        const progressEl = jobElement.querySelector('.job-progress');
        const progressBar = jobElement.querySelector('.progress-bar');
        const progressText = jobElement.querySelector('.progress-text');
        const cancelBtn = jobElement.querySelector('.cancel-btn');

        switch (status.status) {
            case 'queued':
                statusEl.textContent = `⏳ В очереди`;
                statusEl.style.color = '#666';
                jobElement.style.borderLeftColor = '#666';
                progressEl.style.display = 'none';
                break;

            case 'processing':
                statusEl.textContent = `🔄 Обрабатывается`;
                statusEl.style.color = '#0088cc';
                jobElement.style.borderLeftColor = '#0088cc';

                if (status.progress !== undefined) {
                    progressEl.style.display = 'block';
                    progressBar.style.width = `${status.progress}%`;
                    progressText.textContent = status.progressMessage || `${status.progress}%`;
                }

                cancelBtn.style.display = 'none'; // Нельзя отменить во время обработки
                break;

            case 'completed':
                statusEl.textContent = `✅ Отправлено в Telegram`;
                statusEl.style.color = '#4CAF50';
                jobElement.style.borderLeftColor = '#4CAF50';
                progressEl.style.display = 'none';
                cancelBtn.style.display = 'none';

                // Автоудаление через 5 секунд
                setTimeout(() => {
                    this.removeJob(jobId);
                }, 5000);
                break;

            case 'failed':
                statusEl.textContent = `❌ Ошибка: ${status.error || 'Неизвестная ошибка'}`;
                statusEl.style.color = '#f44336';
                jobElement.style.borderLeftColor = '#f44336';
                progressEl.style.display = 'none';
                cancelBtn.style.display = 'none';

                // Автоудаление через 10 секунд
                setTimeout(() => {
                    this.removeJob(jobId);
                }, 10000);
                break;
        }
    }

    removeJob(jobId) {
        const jobElement = this.jobs.get(jobId);
        if (jobElement) {
            jobElement.style.opacity = '0';
            jobElement.style.transform = 'translateX(100%)';
            setTimeout(() => {
                jobElement.remove();
                this.jobs.delete(jobId);
                this.updateJobCount();

                // Скрыть панель если нет задач
                if (this.jobs.size === 0) {
                    setTimeout(() => this.hide(), 1000);
                }
            }, 300);
        }
    }

    async cancelJob(jobId) {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'cancelJob',
                jobId
            });

            if (response.success) {
                NotificationManager.show('Задача отменена', 'info');
                this.removeJob(jobId);
            } else {
                NotificationManager.show('Не удалось отменить задачу', 'error');
            }
        } catch (error) {
            NotificationManager.show('Ошибка отмены задачи', 'error');
        }
    }

    updateJobCount() {
        // Обновляем счетчик в кнопке если нужно
    }

    extractTitleFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            const reelId = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];
            return `Reel ${reelId.substring(0, 8)}...`;
        } catch {
            return 'Instagram Video';
        }
    }

    remove() {
        const existing = document.getElementById(CONFIG.UI.QUEUE_PANEL_ID);
        if (existing) {
            existing.remove();
        }
        this.panel = null;
        this.jobs.clear();
    }
}

class TelegramButton {
    constructor(extractor, queuePanel) {
        this.extractor = extractor;
        this.queuePanel = queuePanel;
        this.button = null;
        this.currentJobId = null;
    }

    create() {
        this.remove();

        this.button = document.createElement('button');
        this.button.id = CONFIG.UI.BUTTON_ID;
        this.button.innerHTML = '📤 Send to Telegram';

        Object.assign(this.button.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: '#0088cc',
            color: 'white',
            border: 'none',
            padding: '12px 20px',
            borderRadius: '25px',
            cursor: 'pointer',
            fontWeight: 'bold',
            zIndex: '99999',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            transition: 'all 0.3s',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        });

        // Mouse events
        this.button.addEventListener('mouseover', () => {
            if (!this.button.disabled) {
                this.button.style.transform = 'scale(1.05)';
                this.button.style.background = '#0077bb';
            }
        });

        this.button.addEventListener('mouseout', () => {
            this.button.style.transform = 'scale(1)';
            if (!this.button.disabled) {
                this.button.style.background = '#0088cc';
            }
        });

        // Click handlers
        this.button.addEventListener('click', (e) => {
            if (e.shiftKey) {
                // Shift+click для показа очереди
                this.queuePanel.toggle();
            } else {
                this.handleClick();
            }
        });

        // Long press для показа очереди
        let pressTimer;
        this.button.addEventListener('mousedown', () => {
            pressTimer = setTimeout(() => {
                this.queuePanel.toggle();
            }, 500);
        });

        this.button.addEventListener('mouseup', () => {
            clearTimeout(pressTimer);
        });

        document.body.appendChild(this.button);
        return this.button;
    }

    remove() {
        const existing = document.getElementById(CONFIG.UI.BUTTON_ID);
        if (existing) {
            existing.remove();
        }
        this.button = null;
        this.currentJobId = null;
    }

    setState(state, text) {
        if (!this.button) return;

        this.button.innerHTML = text;
        this.button.disabled = state !== 'idle';

        switch(state) {
            case 'loading':
                this.button.style.background = '#666';
                break;
            case 'success':
                this.button.style.background = '#4CAF50';
                break;
            case 'error':
                this.button.style.background = '#f44336';
                break;
            default:
                this.button.style.background = '#0088cc';
        }
    }

    async handleClick() {
        try {
            const videoData = this.extractor.extractVideoData();

            if (!videoData) {
                NotificationManager.show('Видео не найдено на странице', 'error');
                return;
            }

            this.setState('loading', '⏳ Добавление...');

            const response = await chrome.runtime.sendMessage({
                action: 'sendToTelegram',
                data: videoData
            });

            if (response.success) {
                const result = response.result;
                this.currentJobId = result.jobId;

                this.setState('success', '✅ В очереди');
                NotificationManager.show(`Видео добавлено в очередь (позиция: ${result.queuePosition})`, 'success');

                // Добавляем в панель очереди
                this.queuePanel.addJob(result.jobId, {
                    ...videoData,
                    queuePosition: result.queuePosition,
                    estimatedWaitTime: result.estimatedWaitTime
                });

                // Показываем подсказку
                if (this.queuePanel.jobs.size === 1) {
                    setTimeout(() => {
                        NotificationManager.show('💡 Shift+клик или долгое нажатие для просмотра очереди', 'info', 4000);
                    }, 2000);
                }

            } else {
                this.setState('error', '❌ Ошибка');
                NotificationManager.show(response.error || 'Произошла ошибка', 'error');
            }

        } catch (error) {
            this.setState('error', '❌ Ошибка');
            NotificationManager.show('Ошибка отправки', 'error');
        }

        // Reset button after delay
        setTimeout(() => {
            this.setState('idle', '📤 Send to Telegram');
        }, 2000);
    }

    updateQueueCount(count) {
        if (this.button && count > 0) {
            this.button.innerHTML = `📤 Send to Telegram (${count})`;
        } else if (this.button) {
            this.button.innerHTML = '📤 Send to Telegram';
        }
    }
}

class InstagramReelsExtension {
    constructor() {
        this.extractor = new VideoExtractor();
        this.queuePanel = new QueuePanel();
        this.button = new TelegramButton(this.extractor, this.queuePanel);
        this.observer = null;
        this.lastUrl = location.href;

        this.setupUrlMonitoring();
        this.setupMessageListener();
        this.init();
    }

    init() {
        if (this.extractor.isVideoPage()) {
            setTimeout(() => {
                this.button.create();
                this.observeChanges();
            }, 1500);
        } else {
            this.button.remove();
            this.queuePanel.hide();
            this.stopObserving();
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'jobProgress') {
                this.queuePanel.updateJob(request.jobId, request.status);
                sendResponse({ received: true });
            } else if (request.action === 'jobFinished') {
                this.handleJobFinished(request.jobId, request.reason, request.details);
                sendResponse({ received: true });
            }
            return true;
        });
    }

    handleJobFinished(jobId, reason, details) {
        switch (reason) {
            case 'completed':
                NotificationManager.show('✅ Видео успешно отправлено в Telegram!', 'success');
                this.queuePanel.updateJob(jobId, { status: 'completed', ...details });
                break;
            case 'failed':
                NotificationManager.show(`❌ Ошибка отправки: ${details.error || 'Неизвестная ошибка'}`, 'error');
                this.queuePanel.updateJob(jobId, { status: 'failed', error: details.error });
                break;
            case 'cancelled':
                NotificationManager.show('🚫 Задача отменена', 'info');
                this.queuePanel.removeJob(jobId);
                break;
            case 'timeout':
                NotificationManager.show('⏰ Превышено время ожидания', 'error');
                this.queuePanel.updateJob(jobId, { status: 'failed', error: 'Timeout' });
                break;
        }

        // Update button queue count
        this.button.updateQueueCount(this.queuePanel.jobs.size);
    }

    setupUrlMonitoring() {
        this.urlObserver = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== this.lastUrl) {
                this.lastUrl = currentUrl;
                setTimeout(() => this.init(), 100);
            }
        });

        this.urlObserver.observe(document, { subtree: true, childList: true });

        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = (...args) => {
            originalPushState.apply(history, args);
            setTimeout(() => this.init(), 100);
        };

        history.replaceState = (...args) => {
            originalReplaceState.apply(history, args);
            setTimeout(() => this.init(), 100);
        };

        window.addEventListener('popstate', () => this.init());
    }

    observeChanges() {
        this.stopObserving();

        this.observer = new MutationObserver(() => {
            if (!this.extractor.isVideoPage()) {
                this.button.remove();
                this.queuePanel.hide();
                this.stopObserving();
            }
        });

        const targetNode = document.querySelector('main') || document.body;
        this.observer.observe(targetNode, {
            childList: true,
            subtree: true
        });
    }

    stopObserving() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}

// Initialize extension
let extensionInstance = null;

function initializeExtension() {
    if (extensionInstance) {
        extensionInstance.stopObserving();
    }
    extensionInstance = new InstagramReelsExtension();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}

window.addEventListener('load', initializeExtension);

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && extensionInstance) {
        // Refresh queue when page becomes visible
        // Could implement queue sync here
    }
});