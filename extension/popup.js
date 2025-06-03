/**
 * Enhanced popup script v4.0 with JWT authentication and real-time monitoring
 */

class PopupManager {
    constructor() {
        this.form = document.getElementById('settingsForm');
        this.serverUrlInput = document.getElementById('serverUrl');
        this.apiKeyInput = document.getElementById('apiKey');
        this.saveBtn = document.getElementById('saveBtn');
        this.testBtn = document.getElementById('testBtn');
        this.statusEl = document.getElementById('status');

        this.queueStatsInterval = null;
        this.authToken = null;
        this.tokenExpiry = null;

        // Add enhanced UI elements
        this.createEnhancedUI();
        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadVersion();
        this.setupEventListeners();
        await this.initializeAuth();
        this.startPeriodicUpdates();
    }

    createEnhancedUI() {
        const content = document.querySelector('.content');

        // Connection status indicator
        const connectionStatus = document.createElement('div');
        connectionStatus.innerHTML = `
            <div id="connection-status" style="
                margin-bottom: 20px; 
                padding: 12px; 
                background: #f8f9fa; 
                border-radius: 8px;
                border-left: 4px solid #ccc;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
            ">
                <div id="connection-indicator" style="
                    width: 8px; 
                    height: 8px; 
                    border-radius: 50%; 
                    background: #ccc;
                "></div>
                <span id="connection-text">Checking connection...</span>
            </div>
        `;

        // Queue monitoring section
        const queueSection = document.createElement('div');
        queueSection.innerHTML = `
            <div id="queue-monitoring" style="
                margin-bottom: 20px; 
                padding: 15px; 
                background: linear-gradient(135deg, #f1f3f4, #ffffff); 
                border-radius: 10px;
                border: 1px solid #e1e5e9;
            ">
                <div style="
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    margin-bottom: 12px;
                ">
                    <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #333;">
                        📊 Real-time Queue Monitor
                    </h3>
                    <button id="refreshQueueBtn" style="
                        background: none;
                        border: 1px solid #ddd;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        cursor: pointer;
                        color: #666;
                        transition: all 0.2s;
                    ">🔄</button>
                </div>
                
                <div id="queueStats" style="font-size: 12px; color: #666; line-height: 1.5;">
                    <div style="color: #999; font-style: italic;">Connect to view queue statistics</div>
                </div>
                
                <div id="realTimeFeatures" style="
                    margin-top: 12px; 
                    padding: 8px; 
                    background: rgba(33, 150, 243, 0.1); 
                    border-radius: 6px;
                    display: none;
                ">
                    <div style="font-size: 11px; color: #1976D2; font-weight: 500; margin-bottom: 4px;">
                        ⚡ Real-time Features Active
                    </div>
                    <div style="font-size: 10px; color: #666;">
                        • Live progress updates via WebSocket<br>
                        • Instant queue statistics<br>
                        • Push notifications for job completion
                    </div>
                </div>
            </div>
        `;

        // Authentication status section
        const authSection = document.createElement('div');
        authSection.innerHTML = `
            <div id="auth-status" style="
                margin-bottom: 20px;
                padding: 12px;
                background: #fff3cd;
                border-radius: 8px;
                border-left: 4px solid #ffc107;
                font-size: 12px;
                display: none;
            ">
                <div style="font-weight: 600; margin-bottom: 4px;">🔐 Authentication</div>
                <div id="auth-details">
                    <div>Status: <span id="auth-status-text">Not authenticated</span></div>
                    <div>Token expires: <span id="auth-expiry">-</span></div>
                </div>
            </div>
        `;

        // Insert before the form
        content.insertBefore(connectionStatus, this.form);
        content.insertBefore(queueSection, this.form);
        content.insertBefore(authSection, this.form);

        // Setup event handlers for new elements
        document.getElementById('refreshQueueBtn').addEventListener('click', () => {
            this.loadQueueStats(true);
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
                this.updateConnectionStatus('checking', 'Checking connection...');
            } else {
                this.updateConnectionStatus('disconnected', 'API key required');
                this.showStatus('⚠️ Please configure API key', 'info');
            }
        } catch (error) {
            this.showStatus('Error loading settings', 'error');
        }
    }

    async loadVersion() {
        try {
            const manifest = chrome.runtime.getManifest();
            document.getElementById('version').textContent = `Version: ${manifest.version} (WebSocket + JWT)`;
        } catch (error) {
            document.getElementById('version').textContent = 'Version: Unknown';
        }
    }

    async initializeAuth() {
        const serverUrl = this.serverUrlInput.value.trim() || 'http://localhost:3000';
        const apiKey = this.apiKeyInput.value.trim();

        if (!apiKey) {
            this.updateAuthStatus(false);
            return;
        }

        try {
            await this.authenticate(serverUrl, apiKey);
            this.updateAuthStatus(true);
            this.updateConnectionStatus('connected', 'Connected with JWT authentication');
        } catch (error) {
            this.updateAuthStatus(false, error.message);
            this.updateConnectionStatus('error', error.message);
        }
    }

    async authenticate(serverUrl, apiKey) {
        try {
            const response = await fetch(`${serverUrl}/api/auth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ apiKey }),
                timeout: 10000
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                this.authToken = data.token;
                this.tokenExpiry = Date.now() + (60 * 60 * 1000); // 1 hour
                return data;
            } else {
                throw new Error(data.error || 'Authentication failed');
            }
        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    async loadQueueStats(forceRefresh = false) {
        const queueStatsEl = document.getElementById('queueStats');
        const realTimeFeaturesEl = document.getElementById('realTimeFeatures');

        if (!this.authToken && !forceRefresh) {
            queueStatsEl.innerHTML = '<div style="color: #999; font-style: italic;">Authentication required for queue statistics</div>';
            return;
        }

        try {
            const serverUrl = this.serverUrlInput.value.trim() || 'http://localhost:3000';

            // If we don't have a token, try to authenticate first
            if (!this.authToken) {
                const apiKey = this.apiKeyInput.value.trim();
                if (!apiKey) {
                    queueStatsEl.innerHTML = '<div style="color: #f44336;">🔑 API key required</div>';
                    return;
                }
                await this.authenticate(serverUrl, apiKey);
            }

            if (forceRefresh) {
                queueStatsEl.innerHTML = '<div style="color: #2196F3;">🔄 Refreshing...</div>';
            }

            // Get queue stats with JWT token
            const response = await fetch(`${serverUrl}/api/queue/stats`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            if (response.status === 401) {
                // Token expired, try to re-authenticate
                const apiKey = this.apiKeyInput.value.trim();
                await this.authenticate(serverUrl, apiKey);
                return this.loadQueueStats(forceRefresh);
            }

            if (response.ok) {
                const stats = await response.json();
                this.displayQueueStats(stats);
                this.updateConnectionStatus('connected', 'Connected • Real-time monitoring active');

                // Show real-time features if WebSocket is supported
                if (stats.realTimeUpdates !== false) {
                    realTimeFeaturesEl.style.display = 'block';
                }
            } else {
                throw new Error(`HTTP ${response.status}`);
            }

        } catch (error) {
            queueStatsEl.innerHTML = `
                <div style="color: #f44336;">
                    ❌ Error: ${error.message}
                </div>
            `;
            this.updateConnectionStatus('error', error.message);
        }
    }

    displayQueueStats(stats) {
        const queueStatsEl = document.getElementById('queueStats');

        const queueUtilization = stats.maxQueueSize > 0 ?
            Math.round((stats.queued / stats.maxQueueSize) * 100) : 0;

        const workerUtilization = stats.maxWorkers > 0 ?
            Math.round((stats.activeWorkers / stats.maxWorkers) * 100) : 0;

        // Format memory info if available
        const memoryInfo = stats.memoryUsageFormatted ?
            `${stats.memoryUsageFormatted} / ${stats.maxMemoryFormatted} (${stats.memoryUtilization}%)` :
            'N/A';

        queueStatsEl.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: #333; font-size: 11px;">⏳ QUEUED</div>
                    <div style="font-size: 20px; color: #FF9800; font-weight: bold;">${stats.queued}</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: #333; font-size: 11px;">🔄 PROCESSING</div>
                    <div style="font-size: 20px; color: #2196F3; font-weight: bold;">${stats.processing}</div>
                </div>
            </div>
            
            <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: 600; color: #333; font-size: 11px;">👷 WORKERS</span>
                    <span style="font-size: 10px; color: #666;">${stats.activeWorkers}/${stats.maxWorkers}</span>
                </div>
                <div style="background: #e9ecef; height: 4px; border-radius: 2px; overflow: hidden;">
                    <div style="
                        background: ${this.getUtilizationColor(workerUtilization)};
                        height: 100%; 
                        width: ${workerUtilization}%; 
                        transition: width 0.3s ease;
                    "></div>
                </div>
            </div>
            
            <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: 600; color: #333; font-size: 11px;">📊 QUEUE CAPACITY</span>
                    <span style="font-size: 10px; color: #666;">${stats.queued}/${stats.maxQueueSize}</span>
                </div>
                <div style="background: #e9ecef; height: 4px; border-radius: 2px; overflow: hidden;">
                    <div style="
                        background: ${this.getUtilizationColor(queueUtilization)};
                        height: 100%; 
                        width: ${queueUtilization}%; 
                        transition: width 0.3s ease;
                    "></div>
                </div>
            </div>
            
            ${stats.memoryUsageFormatted ? `
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-weight: 600; color: #333; font-size: 11px;">💾 MEMORY</span>
                        <span style="font-size: 10px; color: #666;">${memoryInfo}</span>
                    </div>
                    <div style="background: #e9ecef; height: 4px; border-radius: 2px; overflow: hidden;">
                        <div style="
                            background: ${this.getUtilizationColor(stats.memoryUtilization)};
                            height: 100%; 
                            width: ${stats.memoryUtilization}%; 
                            transition: width 0.3s ease;
                        "></div>
                    </div>
                </div>
            ` : ''}
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 10px; color: #666; margin-top: 12px;">
                <div>✅ Completed: ${stats.completed}</div>
                <div>❌ Failed: ${stats.failed}</div>
                ${stats.throughputPerMinute ? `<div>📈 Rate: ${stats.throughputPerMinute.toFixed(1)}/min</div>` : ''}
                ${stats.uptime ? `<div>⏱ Uptime: ${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m</div>` : ''}
            </div>
            
            ${this.getQueueStatusMessage(stats)}
        `;
    }

    getUtilizationColor(percentage) {
        if (percentage > 80) return '#f44336';
        if (percentage > 60) return '#FF9800';
        if (percentage > 30) return '#FFC107';
        return '#4CAF50';
    }

    getQueueStatusMessage(stats) {
        if (stats.queued === 0 && stats.processing === 0) {
            return '<div style="margin-top: 10px; padding: 8px; background: #e8f5e8; color: #2e7d2e; border-radius: 4px; font-size: 11px; text-align: center;">🎉 Queue is empty • Ready for new videos!</div>';
        }

        if (stats.activeWorkers === stats.maxWorkers) {
            const estimatedTime = Math.ceil(stats.queued / stats.maxWorkers) * 30;
            return `<div style="margin-top: 10px; padding: 8px; background: #fff3cd; color: #856404; border-radius: 4px; font-size: 11px; text-align: center;">⚡ All workers busy • Est. wait: ${estimatedTime}s</div>`;
        }

        if (stats.queued > stats.maxQueueSize * 0.8) {
            return '<div style="margin-top: 10px; padding: 8px; background: #f8d7da; color: #721c24; border-radius: 4px; font-size: 11px; text-align: center;">⚠️ Queue nearly full</div>';
        }

        return '<div style="margin-top: 10px; padding: 8px; background: #d1ecf1; color: #0c5460; border-radius: 4px; font-size: 11px; text-align: center;">📤 Ready to accept new videos</div>';
    }

    startPeriodicUpdates() {
        // Update queue stats every 10 seconds if popup is open and authenticated
        this.queueStatsInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && this.authToken) {
                this.loadQueueStats();
            }
        }, 10000);

        // Update auth status every minute
        setInterval(() => {
            this.updateAuthExpiryDisplay();
        }, 60000);
    }

    updateConnectionStatus(status, message) {
        const indicator = document.getElementById('connection-indicator');
        const text = document.getElementById('connection-text');
        const statusContainer = document.getElementById('connection-status');

        const colors = {
            connected: '#4CAF50',
            connecting: '#FF9800',
            checking: '#2196F3',
            disconnected: '#9E9E9E',
            error: '#f44336'
        };

        const borderColors = {
            connected: '#4CAF50',
            connecting: '#FF9800',
            checking: '#2196F3',
            disconnected: '#ccc',
            error: '#f44336'
        };

        indicator.style.background = colors[status] || colors.disconnected;
        statusContainer.style.borderLeftColor = borderColors[status] || borderColors.disconnected;
        text.textContent = message;

        // Add pulse animation for connecting/checking states
        if (status === 'connecting' || status === 'checking') {
            indicator.style.animation = 'pulse 1.5s infinite';
        } else {
            indicator.style.animation = 'none';
        }
    }

    updateAuthStatus(isAuthenticated, error = null) {
        const authSection = document.getElementById('auth-status');
        const authStatusText = document.getElementById('auth-status-text');
        const authExpiry = document.getElementById('auth-expiry');

        if (isAuthenticated) {
            authSection.style.display = 'block';
            authSection.style.background = '#d4edda';
            authSection.style.borderLeftColor = '#4CAF50';
            authStatusText.textContent = 'Authenticated (JWT)';
            authStatusText.style.color = '#155724';

            if (this.tokenExpiry) {
                const expiresIn = Math.floor((this.tokenExpiry - Date.now()) / 1000 / 60);
                authExpiry.textContent = `${expiresIn} minutes`;
            }
        } else {
            authSection.style.display = 'block';
            authSection.style.background = '#f8d7da';
            authSection.style.borderLeftColor = '#f44336';
            authStatusText.textContent = error || 'Not authenticated';
            authStatusText.style.color = '#721c24';
            authExpiry.textContent = '-';
        }
    }

    updateAuthExpiryDisplay() {
        if (this.tokenExpiry) {
            const authExpiry = document.getElementById('auth-expiry');
            const expiresIn = Math.floor((this.tokenExpiry - Date.now()) / 1000 / 60);

            if (expiresIn > 0) {
                authExpiry.textContent = `${expiresIn} minutes`;
            } else {
                authExpiry.textContent = 'Expired';
                this.authToken = null;
                this.tokenExpiry = null;
                this.updateAuthStatus(false, 'Token expired');
            }
        }
    }

    setupEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSave(e));
        this.testBtn.addEventListener('click', () => this.handleTest());

        this.serverUrlInput.addEventListener('input', () => this.validateServerUrl());
        this.apiKeyInput.addEventListener('input', () => this.validateApiKey());

        // Auto-refresh on settings change
        this.serverUrlInput.addEventListener('change', () => {
            this.authToken = null; // Reset auth
            setTimeout(() => this.initializeAuth(), 500);
        });
        this.apiKeyInput.addEventListener('change', () => {
            this.authToken = null; // Reset auth
            setTimeout(() => this.initializeAuth(), 500);
        });
    }

    validateServerUrl() {
        const value = this.serverUrlInput.value.trim();
        const errorEl = document.getElementById('serverUrlError');

        if (!value) {
            this.setFieldError(this.serverUrlInput, errorEl, 'Server URL is required');
            return false;
        }

        try {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol)) {
                this.setFieldError(this.serverUrlInput, errorEl, 'URL must start with http:// or https://');
                return false;
            }
        } catch {
            this.setFieldError(this.serverUrlInput, errorEl, 'Invalid URL format');
            return false;
        }

        this.clearFieldError(this.serverUrlInput, errorEl);
        return true;
    }

    validateApiKey() {
        const value = this.apiKeyInput.value.trim();
        const errorEl = document.getElementById('apiKeyError');

        if (!value) {
            this.setFieldError(this.apiKeyInput, errorEl, 'API key is required');
            return false;
        }

        if (value.length < 8) {
            this.setFieldError(this.apiKeyInput, errorEl, 'API key too short');
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
            this.updateConnectionStatus('checking', 'Saving and testing...');

            // Save to storage
            await chrome.storage.local.set({ serverUrl, apiKey });

            // Test authentication
            await this.authenticate(serverUrl, apiKey);

            // Notify background script of settings change
            chrome.runtime.sendMessage({
                action: 'updateSettings',
                settings: { serverUrl, apiKey }
            });

            this.updateAuthStatus(true);
            this.updateConnectionStatus('connected', 'Connected with JWT authentication');
            this.showStatus('✅ Settings saved and authenticated!', 'success');

            // Load queue stats
            setTimeout(() => this.loadQueueStats(), 500);

        } catch (error) {
            this.updateAuthStatus(false, error.message);
            this.updateConnectionStatus('error', error.message);
            this.showStatus(`❌ Save failed: ${error.message}`, 'error');
        } finally {
            this.setButtonLoading(this.saveBtn, false);
        }
    }

    async handleTest() {
        if (!this.validateForm()) {
            this.showStatus('Fix validation errors first', 'error');
            return;
        }

        const serverUrl = this.serverUrlInput.value.trim();
        const apiKey = this.apiKeyInput.value.trim();

        try {
            this.setButtonLoading(this.testBtn, true);
            this.updateConnectionStatus('checking', 'Testing connection...');
            this.showStatus('Testing authentication and queue access...', 'info');

            // Test authentication
            const authResult = await this.authenticate(serverUrl, apiKey);

            // Test queue access
            const queueResponse = await fetch(`${serverUrl}/api/queue/stats`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            if (queueResponse.ok) {
                const queueData = await queueResponse.json();
                this.updateConnectionStatus('connected', 'Connected • All systems operational');
                this.updateAuthStatus(true);

                this.showStatus(
                    `✅ Connection successful! JWT auth working, queue has ${queueData.queued} items`,
                    'success'
                );

                // Display the queue stats
                this.displayQueueStats(queueData);

            } else {
                throw new Error(`Queue access failed: ${queueResponse.status}`);
            }

        } catch (error) {
            this.updateConnectionStatus('error', error.message);
            this.updateAuthStatus(false, error.message);

            if (error.message.includes('Failed to fetch')) {
                this.showStatus('❌ Cannot reach server. Check URL and server status.', 'error');
            } else {
                this.showStatus(`❌ Connection failed: ${error.message}`, 'error');
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
            const originalText = button.textContent;
            button.dataset.originalText = originalText;
            button.innerHTML = '<span class="loading"></span>' + originalText;
        } else {
            button.disabled = false;
            const originalText = button.dataset.originalText || button.textContent;
            button.innerHTML = originalText;
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

    // Cleanup intervals when popup closes
    window.addEventListener('beforeunload', () => {
        if (popupManager.queueStatsInterval) {
            clearInterval(popupManager.queueStatsInterval);
        }
    });

    // Expose for debugging
    window.popupManager = popupManager;
});