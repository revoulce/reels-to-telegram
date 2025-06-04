/**
 * Enhanced background script v4.0 with WebSocket and JWT authentication
 * Replaces polling with real-time updates
 */

// Import WebSocketClient
importScripts('js/websocket-client.js');

const CONFIG = {
    DEFAULT_SERVER_URL: 'http://localhost:3000',
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    TIMEOUT: 30000,
    TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // Refresh token 5 minutes before expiry
    POLLING_INTERVAL: 8000 // Increased from 3000 to 8000ms to reduce API calls
};

class BackgroundService {
    constructor() {
        this.activeJobs = new Map(); // jobId -> jobInfo
        this.webSocketClient = new WebSocketClient();
        this.authToken = null;
        this.tokenExpiry = null;
        this.tokenRefreshTimeout = null;
        this.pollingInterval = null; // Fallback polling
        this.settings = { serverUrl: '', apiKey: '' };

        this.setupMessageListener();
        this.loadSettings();
    }

    async loadSettings() {
        try {
            const data = await chrome.storage.local.get(['serverUrl', 'apiKey']);
            this.settings = {
                serverUrl: data.serverUrl || CONFIG.DEFAULT_SERVER_URL,
                apiKey: data.apiKey || ''
            };

            if (this.settings.apiKey) {
                await this.authenticate();
                await this.initializeWebSocket();
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            const handler = this.getMessageHandler(request.action);

            if (handler) {
                handler(request)
                    .then(result => sendResponse({ success: true, result }))
                    .catch(error => sendResponse({
                        success: false,
                        error: error.message || 'Unknown error'
                    }));
                return true; // Keep message channel open for async response
            }
        });
    }

    getMessageHandler(action) {
        const handlers = {
            'sendToTelegram': (req) => this.handleVideoSend(req.data),
            'getJobStatus': (req) => this.getJobStatus(req.jobId),
            'cancelJob': (req) => this.cancelJob(req.jobId),
            'updateSettings': (req) => this.handleSettingsUpdate(req.settings),
            'getConnectionStatus': () => this.getConnectionStatus(),
            'testConnection': () => this.testConnection()
        };

        return handlers[action];
    }

    /**
     * JWT Authentication with server
     */
    async authenticate() {
        try {
            console.log('🔐 Authenticating with server...');

            const response = await this.fetchWithRetry(
                `${this.settings.serverUrl}/api/auth/token`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey: this.settings.apiKey })
                }
            );

            const data = await response.json();

            if (data.success) {
                this.authToken = data.token;
                this.tokenExpiry = Date.now() + (60 * 60 * 1000) - CONFIG.TOKEN_REFRESH_THRESHOLD;

                console.log('✅ Authentication successful');
                this.scheduleTokenRefresh();
                return data.token;
            } else {
                throw new Error(data.error || 'Authentication failed');
            }
        } catch (error) {
            console.error('❌ Authentication failed:', error);
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    /**
     * Schedule automatic token refresh
     */
    scheduleTokenRefresh() {
        if (this.tokenRefreshTimeout) {
            clearTimeout(this.tokenRefreshTimeout);
        }

        const timeUntilRefresh = Math.max(0, this.tokenExpiry - Date.now());

        if (timeUntilRefresh > 0) {
            this.tokenRefreshTimeout = setTimeout(async () => {
                try {
                    await this.refreshToken();
                } catch (error) {
                    console.error('Token refresh failed:', error);
                    await this.authenticate();
                }
            }, timeUntilRefresh);
        }
    }

    /**
     * Refresh JWT token
     */
    async refreshToken() {
        try {
            const response = await this.fetchWithRetry(
                `${this.settings.serverUrl}/api/auth/refresh`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = await response.json();

            if (data.success) {
                this.authToken = data.token;
                this.tokenExpiry = Date.now() + (60 * 60 * 1000) - CONFIG.TOKEN_REFRESH_THRESHOLD;

                console.log('🔄 Token refreshed successfully');
                this.scheduleTokenRefresh();

                // Update WebSocket with new token
                this.webSocketClient.updateToken(this.authToken);
            } else {
                throw new Error(data.error || 'Token refresh failed');
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            throw error;
        }
    }

    /**
     * Initialize WebSocket connection
     */
    async initializeWebSocket() {
        if (!this.authToken) {
            console.warn('No auth token available for WebSocket');
            return;
        }

        try {
            // Initialize WebSocket client
            this.webSocketClient.initialize(this.settings.serverUrl, this.authToken);

            // Setup event listeners
            this.setupWebSocketEventListeners();

            // Connect
            await this.webSocketClient.connect();

        } catch (error) {
            console.error('Failed to initialize WebSocket:', error);
        }
    }

    /**
     * Setup WebSocket event listeners
     */
    setupWebSocketEventListeners() {
        this.webSocketClient.on('connected', () => {
            console.log('🔌 WebSocket connected, subscribing to queue updates');
            this.webSocketClient.subscribeToQueue();
            this.broadcastConnectionStatus(true);
            this.stopPollingFallback(); // Stop polling if it was running
        });

        this.webSocketClient.on('disconnected', () => {
            console.log('🔌 WebSocket disconnected');
            this.broadcastConnectionStatus(false);
            this.startPollingFallback(); // Start polling fallback
        });

        this.webSocketClient.on('jobProgress', (jobId, progress, message) => {
            this.handleJobProgress(jobId, {
                status: 'processing',
                progress,
                progressMessage: message
            });
        });

        this.webSocketClient.on('jobFinished', (jobId, status, result, error) => {
            this.handleJobFinished(jobId, status, { result, error });
        });

        this.webSocketClient.on('queueStats', (stats) => {
            this.broadcastToTabs('queueStatsUpdate', stats);
        });

        this.webSocketClient.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        this.webSocketClient.on('maxReconnectAttemptsReached', () => {
            console.error('WebSocket max reconnect attempts reached, enabling polling fallback');
            this.broadcastConnectionStatus(false, 'WebSocket unavailable, using polling');
            this.startPollingFallback();
        });
    }

    /**
     * Start polling fallback when WebSocket is unavailable
     * Increased interval to reduce API calls and avoid rate limiting
     */
    startPollingFallback() {
        if (this.pollingInterval) return; // Already running

        console.log('📡 Starting HTTP polling fallback (8s interval)');

        this.pollingInterval = setInterval(async () => {
            // Batch process active jobs to reduce API calls
            const jobIds = Array.from(this.activeJobs.keys());

            if (jobIds.length === 0) return;

            console.log(`📡 Polling ${jobIds.length} active jobs...`);

            // Process jobs in small batches to avoid hitting rate limits
            const batchSize = 3;
            for (let i = 0; i < jobIds.length; i += batchSize) {
                const batch = jobIds.slice(i, i + batchSize);

                await Promise.all(batch.map(async (jobId) => {
                    try {
                        const status = await this.getJobStatus(jobId);

                        if (status.status === 'completed') {
                            this.handleJobFinished(jobId, 'completed', { result: status.result });
                        } else if (status.status === 'failed') {
                            this.handleJobFinished(jobId, 'failed', { error: status.error });
                        } else if (status.status === 'processing') {
                            this.handleJobProgress(jobId, {
                                status: 'processing',
                                progress: status.progress,
                                progressMessage: status.progressMessage
                            });
                        }
                    } catch (error) {
                        console.error(`Polling failed for job ${jobId}:`, error);

                        // If rate limited, increase polling interval temporarily
                        if (error.message.includes('rate limit')) {
                            console.warn('📡 Rate limited, temporarily slowing down polling');
                            this.stopPollingFallback();
                            setTimeout(() => {
                                this.startPollingFallback();
                            }, 15000); // Wait 15 seconds before resuming
                            return;
                        }
                    }
                }));

                // Small delay between batches
                if (i + batchSize < jobIds.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }, CONFIG.POLLING_INTERVAL);
    }

    /**
     * Stop polling fallback
     */
    stopPollingFallback() {
        if (this.pollingInterval) {
            console.log('📡 Stopping HTTP polling fallback');
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Handle settings update
     */
    async handleSettingsUpdate(newSettings) {
        const oldSettings = { ...this.settings };
        this.settings = { ...newSettings };

        // If server URL or API key changed, re-authenticate and reconnect WebSocket
        if (oldSettings.serverUrl !== newSettings.serverUrl ||
            oldSettings.apiKey !== newSettings.apiKey) {

            // Stop fallback polling
            this.stopPollingFallback();

            // Disconnect existing WebSocket
            this.webSocketClient.disconnect();

            if (newSettings.apiKey) {
                await this.authenticate();
                await this.initializeWebSocket();
            }
        }
    }

    /**
     * Handle video send with enhanced error handling
     */
    async handleVideoSend(videoData) {
        try {
            this.validateVideoData(videoData);

            if (!this.authToken) {
                await this.authenticate();
            }

            const requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    videoUrl: videoData.videoUrl,
                    pageUrl: videoData.pageUrl,
                    timestamp: videoData.timestamp || new Date().toISOString()
                })
            };

            const response = await this.fetchWithRetry(
                `${this.settings.serverUrl}/api/download-video`,
                requestOptions
            );

            const result = await response.json();

            if (!result.success || !result.jobId) {
                throw new Error(result.error || 'Failed to add video to queue');
            }

            // Store job info
            const jobInfo = {
                jobId: result.jobId,
                videoData,
                queuePosition: result.queuePosition,
                estimatedWaitTime: result.estimatedWaitTime,
                startedAt: new Date()
            };

            this.activeJobs.set(result.jobId, jobInfo);

            // Subscribe to job updates via WebSocket
            if (this.webSocketClient.isConnected()) {
                this.webSocketClient.subscribeToJob(result.jobId);
            }

            return {
                jobId: result.jobId,
                message: result.message,
                queuePosition: result.queuePosition,
                estimatedWaitTime: result.estimatedWaitTime,
                realTimeUpdates: this.webSocketClient.isConnected(),
                memoryProcessing: result.processing?.mode === 'memory'
            };

        } catch (error) {
            throw new Error(this.getUserFriendlyError(error));
        }
    }

    /**
     * Get job status (fallback if WebSocket not available)
     */
    async getJobStatus(jobId) {
        if (!this.authToken) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await this.fetchWithRetry(
                `${this.settings.serverUrl}/api/job/${jobId}`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${this.authToken}` }
                }
            );

            return await response.json();
        } catch (error) {
            throw new Error(`Failed to get job status: ${error.message}`);
        }
    }

    /**
     * Cancel job
     */
    async cancelJob(jobId) {
        if (!this.authToken) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await this.fetchWithRetry(
                `${this.settings.serverUrl}/api/job/${jobId}`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${this.authToken}` }
                }
            );

            const result = await response.json();

            if (result.success) {
                this.cleanupJob(jobId, 'cancelled');
            }

            return result;
        } catch (error) {
            throw new Error(`Failed to cancel job: ${error.message}`);
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isAuthenticated: !!this.authToken,
            tokenExpiry: this.tokenExpiry,
            webSocketConnected: this.webSocketClient.isConnected(),
            webSocketState: this.webSocketClient.getConnectionState(),
            webSocketStats: this.webSocketClient.getStats(),
            serverUrl: this.settings.serverUrl,
            pollingActive: !!this.pollingInterval,
            pollingInterval: CONFIG.POLLING_INTERVAL
        };
    }

    /**
     * Test connection to server
     */
    async testConnection() {
        try {
            // Test authentication
            await this.authenticate();

            // Test WebSocket connection
            if (!this.webSocketClient.isConnected()) {
                await this.initializeWebSocket();
            }

            // Test API access
            const response = await this.fetchWithRetry(
                `${this.settings.serverUrl}/api/queue/stats`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${this.authToken}` }
                }
            );

            const data = await response.json();

            return {
                success: true,
                message: 'Connection test successful',
                queueStats: data,
                webSocketConnected: this.webSocketClient.isConnected()
            };

        } catch (error) {
            throw new Error(`Connection test failed: ${error.message}`);
        }
    }

    /**
     * Enhanced fetch with retry and rate limit handling
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

                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') ||
                        response.headers.get('X-RateLimit-Reset') || '60';
                    const retrySeconds = parseInt(retryAfter);

                    throw new Error(`Rate limited. Retry after ${retrySeconds} seconds.`);
                }

                if (response.status === 401) {
                    throw new Error('Authentication failed. Invalid or expired token.');
                }

                if (response.ok) {
                    return response;
                }

                const errorText = await response.text();
                throw new Error(`Server error ${response.status}: ${errorText}`);

            } catch (error) {
                lastError = error;

                if (error.name === 'AbortError') {
                    throw new Error('Request timeout');
                }

                // Don't retry on authentication or rate limit errors
                if (error.message.includes('401') || error.message.includes('429')) {
                    throw error;
                }

                if (i === maxRetries - 1) {
                    throw error;
                }

                // Exponential backoff
                await new Promise(resolve =>
                    setTimeout(resolve, CONFIG.RETRY_DELAY * Math.pow(2, i))
                );
            }
        }

        throw lastError;
    }

    /**
     * Handle job progress updates
     */
    handleJobProgress(jobId, status) {
        this.broadcastToTabs('jobProgress', { jobId, status });
    }

    /**
     * Handle job completion/failure
     */
    handleJobFinished(jobId, reason, details = {}) {
        const jobInfo = this.activeJobs.get(jobId);
        if (!jobInfo) return;

        console.log(`🏁 Job ${jobId.substring(0, 8)} finished: ${reason}`);

        // Unsubscribe from WebSocket updates
        this.webSocketClient.unsubscribeFromJob(jobId);

        // Notify content scripts
        this.broadcastToTabs('jobFinished', { jobId, reason, details });

        // Cleanup after delay
        setTimeout(() => {
            this.activeJobs.delete(jobId);
        }, 30000);
    }

    /**
     * Cleanup job resources
     */
    cleanupJob(jobId, reason, details = {}) {
        this.webSocketClient.unsubscribeFromJob(jobId);
        this.broadcastToTabs('jobFinished', { jobId, reason, details });
        this.activeJobs.delete(jobId);
    }

    /**
     * Broadcast connection status to all tabs
     */
    broadcastConnectionStatus(isConnected, message = '') {
        this.broadcastToTabs('connectionStatusChanged', {
            isConnected,
            message,
            webSocketState: this.webSocketClient.getConnectionState()
        });
    }

    /**
     * Broadcast message to all Instagram tabs
     */
    broadcastToTabs(action, data) {
        chrome.tabs.query({ url: "*://www.instagram.com/*" }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { action, ...data }).catch(() => {
                    // Ignore errors if content script is not loaded
                });
            });
        });
    }

    /**
     * Validate video data
     */
    validateVideoData(videoData) {
        if (!videoData) {
            throw new Error('Video data is required');
        }

        if (!videoData.pageUrl) {
            throw new Error('Page URL is required');
        }

        if (!videoData.pageUrl.includes('instagram.com')) {
            throw new Error('Invalid Instagram URL');
        }
    }

    /**
     * Convert technical errors to user-friendly messages
     */
    getUserFriendlyError(error) {
        const message = error.message || error.toString();

        if (message.includes('API key')) {
            return 'API key is not configured or invalid. Check extension settings.';
        }

        if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
            return 'Network error. Check internet connection and server status.';
        }

        if (message.includes('rate limit') || message.includes('429')) {
            return 'Rate limit exceeded. Please wait before submitting more videos.';
        }

        if (message.includes('Queue is full')) {
            return 'Queue is full. Please try again later.';
        }

        if (message.includes('timeout')) {
            return 'Server timeout. Please try again.';
        }

        return message;
    }
}

// Initialize background service
const backgroundService = new BackgroundService();

// Handle settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes.serverUrl || changes.apiKey)) {
        const newSettings = {};
        if (changes.serverUrl) newSettings.serverUrl = changes.serverUrl.newValue;
        if (changes.apiKey) newSettings.apiKey = changes.apiKey.newValue;

        backgroundService.handleSettingsUpdate(newSettings);
    }
});

// Handle extension unload
chrome.runtime.onSuspend.addListener(() => {
    backgroundService.webSocketClient.disconnect();
    backgroundService.stopPollingFallback();
});

// Export for debugging
if (typeof globalThis !== 'undefined') {
    globalThis.backgroundService = backgroundService;
}