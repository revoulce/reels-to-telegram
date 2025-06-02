/**
 * Simplified content script for Instagram Reels to Telegram extension
 * Only extracts video URL and page URL
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
        BUTTON_ID: 'telegram-send-button'
    },
    PATHS: {
        REELS: ['/reels/', '/reel/'],
        STORIES: ['/stories/']
    }
};

class VideoExtractor {
    /**
     * Find video element on page
     */
    findVideo() {
        for (const selector of CONFIG.SELECTORS.VIDEO) {
            const video = document.querySelector(selector);
            if (video && video.src) {
                return video;
            }
        }
        return null;
    }

    /**
     * Extract minimal video data - only URLs
     */
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

    /**
     * Check if current page has video content
     */
    isVideoPage() {
        const path = window.location.pathname;
        return CONFIG.PATHS.REELS.some(p => path.includes(p)) ||
            CONFIG.PATHS.STORIES.some(p => path.includes(p));
    }
}

class NotificationManager {
    static show(message, type = 'info', duration = 3000) {
        // Remove existing notifications
        document.querySelectorAll('.reels-notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `reels-notification reels-notification--${type}`;
        notification.textContent = message;

        // Add styles
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

        // Auto remove
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-50%) translateY(-10px)';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
}

class TelegramButton {
    constructor(extractor) {
        this.extractor = extractor;
        this.button = null;
    }

    create() {
        this.remove();

        this.button = document.createElement('button');
        this.button.id = CONFIG.UI.BUTTON_ID;
        this.button.innerHTML = '📤 Send to Telegram';

        // Apply styles
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

        // Add event listeners
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

        this.button.addEventListener('click', () => this.handleClick());

        document.body.appendChild(this.button);
        return this.button;
    }

    remove() {
        const existing = document.getElementById(CONFIG.UI.BUTTON_ID);
        if (existing) {
            existing.remove();
        }
        this.button = null;
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

            this.setState('loading', '⏳ Отправка...');

            const response = await chrome.runtime.sendMessage({
                action: 'sendToTelegram',
                data: videoData
            });

            if (response.success) {
                this.setState('success', '✅ Отправлено!');
                NotificationManager.show('Видео успешно отправлено!', 'success');
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
}

class InstagramReelsExtension {
    constructor() {
        this.extractor = new VideoExtractor();
        this.button = new TelegramButton(this.extractor);
        this.observer = null;
        this.lastUrl = location.href;

        this.setupUrlMonitoring();
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
            this.stopObserving();
        }
    }

    setupUrlMonitoring() {
        // Monitor URL changes for SPA navigation
        this.urlObserver = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== this.lastUrl) {
                this.lastUrl = currentUrl;
                setTimeout(() => this.init(), 100);
            }
        });

        this.urlObserver.observe(document, { subtree: true, childList: true });

        // Monitor History API
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

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}

// Additional safety net
window.addEventListener('load', initializeExtension);