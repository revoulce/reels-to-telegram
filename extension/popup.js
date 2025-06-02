/**
 * Simplified popup script for Instagram Reels to Telegram extension
 * Basic settings management without debug features
 */

class PopupManager {
    constructor() {
        this.form = document.getElementById('settingsForm');
        this.serverUrlInput = document.getElementById('serverUrl');
        this.apiKeyInput = document.getElementById('apiKey');
        this.saveBtn = document.getElementById('saveBtn');
        this.testBtn = document.getElementById('testBtn');
        this.statusEl = document.getElementById('status');

        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadVersion();
        this.setupEventListeners();
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

            // Show current settings status
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

    setupEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSave(e));
        this.testBtn.addEventListener('click', () => this.handleTest());

        // Real-time validation
        this.serverUrlInput.addEventListener('input', () => this.validateServerUrl());
        this.apiKeyInput.addEventListener('input', () => this.validateApiKey());
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

            // Verify settings were saved
            const savedData = await chrome.storage.local.get(['serverUrl', 'apiKey']);

            if (savedData.apiKey === apiKey && savedData.serverUrl === serverUrl) {
                this.showStatus('Настройки успешно сохранены!', 'success');
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

            const response = await fetch(`${serverUrl}/api/health`, {
                method: 'GET',
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (response.ok) {
                const data = await response.json();
                this.showStatus(`✅ Подключение успешно! Сервер: ${data.status || 'OK'}`, 'success');
            } else {
                this.showStatus(`❌ Ошибка сервера: ${response.status}`, 'error');
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

        // Auto hide after 5 seconds
        setTimeout(() => {
            this.statusEl.classList.remove('show');
        }, 5000);
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});