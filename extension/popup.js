/**
 * Enhanced popup script with queue monitoring for Instagram Reels to Telegram extension
 */

class PopupManager {
    constructor() {
        this.form = document.getElementById('settingsForm');
        this.serverUrlInput = document.getElementById('serverUrl');
        this.apiKeyInput = document.getElementById('apiKey');
        this.saveBtn = document.getElementById('saveBtn');
        this.testBtn = document.getElementById('testBtn');
        this.statusEl = document.getElementById('status');

        // Add queue status elements
        this.createQueueStatusSection();

        this.init();
        this.startQueueMonitoring();
    }

    async init() {
        await this.loadSettings();
        await this.loadVersion();
        this.setupEventListeners();
        this.loadQueueStats();
    }

    createQueueStatusSection() {
        const content = document.querySelector('.content');

        // Create queue status section
        const queueSection = document.createElement('div');
        queueSection.innerHTML = `
            <div style="margin-bottom: 20px; padding: 15px; background: #f1f3f4; border-radius: 8px;">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #333;">📊 Статус очереди</h3>
                <div id="queueStats" style="font-size: 12px; color: #666; line-height: 1.4;">
                    <div>⏳ Загрузка статистики...</div>
                </div>
                <button type="button" id="refreshQueueBtn" style="
                    margin-top: 10px;
                    padding: 6px 12px;
                    background: #6c757d;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                ">🔄 Обновить</button>
            </div>
        `;

        // Insert before the form
        content.insertBefore(queueSection, this.form);

        // Add refresh button handler
        document.getElementById('refreshQueueBtn').addEventListener('click', () => {
            this.loadQueueStats();
        });
    }

    async loadSettings() {
        try {
            const data = await chrome.storage.local.get(['serverUrl', 'apiKey']);

            if (data.serverUrl) {
                this.serverUrlInput.value = data.serverUrl;
            }

            if (data.apiKey) {
                this.apiKeyInput.value = data.apiKey;
            }

            if (data.apiKey && data.apiKey.trim().length > 0) {
                this.showStatus(`✅ Настройки сохранены`, 'success');
            } else {
                this.showStatus('⚠️ Необходимо настроить API ключ', 'info');
            }
        } catch (error) {
            this.showStatus('Ошибка загрузки настроек', 'error');
        }
    }

    async loadVersion() {
        try {
            const manifest = chrome.runtime.getManifest();
            document.getElementById('version').textContent = `Версия: ${manifest.version}`;
        } catch (error) {
            document.getElementById('version').textContent = 'Версия: неизвестна';
        }
    }

    async loadQueueStats() {
        const queueStatsEl = document.getElementById('queueStats');

        try {
            const serverUrl = this.serverUrlInput.value.trim() || 'http://localhost:3000';
            const apiKey = this.apiKeyInput.value.trim();

            if (!apiKey) {
                queueStatsEl.innerHTML = '<div style="color: #f44336;">🔑 Настройте API ключ для просмотра статистики</div>';
                return;
            }

            queueStatsEl.innerHTML = '<div>⏳ Загрузка...</div>';

            // Get queue stats
            const response = await fetch(`${serverUrl}/api/queue/stats`, {
                method: 'GET',
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            if (response.ok) {
                const stats = await response.json();
                this.displayQueueStats(stats);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }

        } catch (error) {
            queueStatsEl.innerHTML = `
                <div style="color: #f44336;">
                    ❌ Ошибка загрузки: ${error.message}
                </div>
            `;
        }
    }

    displayQueueStats(stats) {
        const queueStatsEl = document.getElementById('queueStats');

        const queueUtilization = stats.maxWorkers > 0 ?
            Math.round((stats.activeWorkers / stats.maxWorkers) * 100) : 0;

        const queueCapacity = stats.maxQueueSize > 0 ?
            Math.round((stats.queued / stats.maxQueueSize) * 100) : 0;

        queueStatsEl.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
                <div>
                    <div style="font-weight: 600; color: #333;">⏳ В очереди</div>
                    <div style="font-size: 18px; color: #0088cc;">${stats.queued}</div>
                </div>
                <div>
                    <div style="font-weight: 600; color: #333;">🔄 Обрабатывается</div>
                    <div style="font-size: 18px; color: #28a745;">${stats.processing}</div>
                </div>
            </div>
            
            <div style="margin-bottom: 8px;">
                <div style="font-weight: 600; color: #333; margin-bottom: 4px;">👷 Загрузка воркеров</div>
                <div style="background: #e9ecef; height: 6px; border-radius: 3px; overflow: hidden;">
                    <div style="
                        background: ${queueUtilization > 80 ? '#dc3545' : queueUtilization > 50 ? '#ffc107' : '#28a745'};
                        height: 100%; 
                        width: ${queueUtilization}%; 
                        transition: width 0.3s ease;
                    "></div>
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 2px;">
                    ${stats.activeWorkers}/${stats.maxWorkers} воркеров (${queueUtilization}%)
                </div>
            </div>
            
            <div style="margin-bottom: 8px;">
                <div style="font-weight: 600; color: #333; margin-bottom: 4px;">📊 Заполнение очереди</div>
                <div style="background: #e9ecef; height: 6px; border-radius: 3px; overflow: hidden;">
                    <div style="
                        background: ${queueCapacity > 80 ? '#dc3545' : queueCapacity > 50 ? '#ffc107' : '#0088cc'};
                        height: 100%; 
                        width: ${queueCapacity}%; 
                        transition: width 0.3s ease;
                    "></div>
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 2px;">
                    ${stats.queued}/${stats.maxQueueSize} мест (${queueCapacity}%)
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11px; color: #666;">
                <div>✅ Завершено: ${stats.completed}</div>
                <div>❌ Ошибки: ${stats.failed}</div>
            </div>
            
            ${this.getQueueStatusMessage(stats)}
        `;
    }

    getQueueStatusMessage(stats) {
        if (stats.queued === 0 && stats.processing === 0) {
            return '<div style="margin-top: 8px; padding: 6px; background: #d4edda; color: #155724; border-radius: 4px; font-size: 11px;">🎉 Очередь пуста, готов к новым задачам!</div>';
        }

        if (stats.activeWorkers === stats.maxWorkers) {
            const estimatedTime = Math.ceil(stats.queued / stats.maxWorkers) * 30; // 30 sec per video estimate
            return `<div style="margin-top: 8px; padding: 6px; background: #fff3cd; color: #856404; border-radius: 4px; font-size: 11px;">⚡ Все воркеры заняты. Примерное время ожидания: ${estimatedTime}с</div>`;
        }

        if (stats.queued > stats.maxQueueSize * 0.8) {
            return '<div style="margin-top: 8px; padding: 6px; background: #f8d7da; color: #721c24; border-radius: 4px; font-size: 11px;">⚠️ Очередь почти заполнена</div>';
        }

        return '<div style="margin-top: 8px; padding: 6px; background: #d1ecf1; color: #0c5460; border-radius: 4px; font-size: 11px;">📤 Готов принимать новые видео</div>';
    }

    startQueueMonitoring() {
        // Auto-refresh queue stats every 10 seconds if popup is open
        this.queueInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.loadQueueStats();
            }
        }, 10000);
    }

    setupEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSave(e));
        this.testBtn.addEventListener('click', () => this.handleTest());

        this.serverUrlInput.addEventListener('input', () => this.validateServerUrl());
        this.apiKeyInput.addEventListener('input', () => this.validateApiKey());

        // Auto-refresh queue when settings change
        this.serverUrlInput.addEventListener('change', () => {
            setTimeout(() => this.loadQueueStats(), 500);
        });
        this.apiKeyInput.addEventListener('change', () => {
            setTimeout(() => this.loadQueueStats(), 500);
        });
    }

    validateServerUrl() {
        const value = this.serverUrlInput.value.trim();
        const errorEl = document.getElementById('serverUrlError');

        if (!value) {
            this.setFieldError(this.serverUrlInput, errorEl, 'URL сервера обязателен');
            return false;
        }

        try {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol)) {
                this.setFieldError(this.serverUrlInput, errorEl, 'URL должен начинаться с http:// или https://');
                return false;
            }
        } catch {
            this.setFieldError(this.serverUrlInput, errorEl, 'Некорректный формат URL');
            return false;
        }

        this.clearFieldError(this.serverUrlInput, errorEl);
        return true;
    }

    validateApiKey() {
        const value = this.apiKeyInput.value.trim();
        const errorEl = document.getElementById('apiKeyError');

        if (!value) {
            this.setFieldError(this.apiKeyInput, errorEl, 'API ключ обязателен');
            return false;
        }

        if (value.length < 8) {
            this.setFieldError(this.apiKeyInput, errorEl, 'API ключ слишком короткий');
            return false;
        }

        this.clearFieldError(this.apiKeyInput, errorEl);
        return true;
    }

    setFieldError(input, errorEl, message) {
        input.classList.add('error');
        errorEl.textContent = message;
    }

    clearFieldError(input, errorEl) {
        input.classList.remove('error');
        errorEl.textContent = '';
    }

    async handleSave(e) {
        e.preventDefault();

        if (!this.validateForm()) {
            return;
        }

        const serverUrl = this.serverUrlInput.value.trim();
        const apiKey = this.apiKeyInput.value.trim();

        try {
            this.setButtonLoading(this.saveBtn, true);

            await chrome.storage.local.set({ serverUrl, apiKey });

            const savedData = await chrome.storage.local.get(['serverUrl', 'apiKey']);

            if (savedData.apiKey === apiKey && savedData.serverUrl === serverUrl) {
                this.showStatus('Настройки успешно сохранены!', 'success');
                // Refresh queue stats with new settings
                setTimeout(() => this.loadQueueStats(), 500);
            } else {
                throw new Error('Настройки не сохранились корректно');
            }

        } catch (error) {
            this.showStatus('Ошибка сохранения настроек: ' + error.message, 'error');
        } finally {
            this.setButtonLoading(this.saveBtn, false);
        }
    }

    async handleTest() {
        if (!this.validateForm()) {
            this.showStatus('Исправьте ошибки в настройках', 'error');
            return;
        }

        const serverUrl = this.serverUrlInput.value.trim();
        const apiKey = this.apiKeyInput.value.trim();

        try {
            this.setButtonLoading(this.testBtn, true);
            this.showStatus('Проверка подключения...', 'info');

            // Test basic health endpoint
            const healthResponse = await fetch(`${serverUrl}/api/health`, {
                method: 'GET',
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (healthResponse.ok) {
                const healthData = await healthResponse.json();

                // Test queue stats endpoint
                const queueResponse = await fetch(`${serverUrl}/api/queue/stats`, {
                    method: 'GET',
                    headers: {
                        'X-API-Key': apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                });

                if (queueResponse.ok) {
                    const queueData = await queueResponse.json();
                    this.showStatus(
                        `✅ Подключение успешно! Сервер v${healthData.version || '?'}, ` +
                        `очередь: ${queueData.queued} в ожидании, ${queueData.processing} обрабатывается`,
                        'success'
                    );
                    this.loadQueueStats(); // Refresh stats
                } else {
                    this.showStatus(`✅ Базовое подключение успешно, но очередь недоступна`, 'info');
                }
            } else {
                this.showStatus(`❌ Ошибка сервера: ${healthResponse.status}`, 'error');
            }

        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                this.showStatus('❌ Не удается подключиться к серверу', 'error');
            } else {
                this.showStatus(`❌ Ошибка: ${error.message}`, 'error');
            }
        } finally {
            this.setButtonLoading(this.testBtn, false);
        }
    }

    validateForm() {
        const isServerUrlValid = this.validateServerUrl();
        const isApiKeyValid = this.validateApiKey();
        return isServerUrlValid && isApiKeyValid;
    }

    setButtonLoading(button, loading) {
        if (loading) {
            button.disabled = true;
            const loadingSpinner = '<span class="loading"></span>';
            button.innerHTML = loadingSpinner + button.textContent;
        } else {
            button.disabled = false;
            button.innerHTML = button.textContent.replace(/^.*?<\/span>/, '');
        }
    }

    showStatus(message, type = 'info') {
        this.statusEl.textContent = message;
        this.statusEl.className = `status-card ${type} show`;

        setTimeout(() => {
            this.statusEl.classList.remove('show');
        }, 5000);
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const popupManager = new PopupManager();

    // Cleanup interval when popup closes
    window.addEventListener('beforeunload', () => {
        if (popupManager.queueInterval) {
            clearInterval(popupManager.queueInterval);
        }
    });
});