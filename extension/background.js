/**
 * Enhanced background script v4.0 with WebSocket and JWT authentication
 * Replaces polling with real-time updates
 */

const CONFIG = {
    DEFAULT_SERVER_URL: 'http://localhost:3000',
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    TIMEOUT: 30000,
    WEBSOCKET_RECONNECT_ATTEMPTS: 5,
    WEBSOCKET_RECONNECT_DELAY: 2000,
    TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000 // Refresh token 5 minutes before expiry
};

class BackgroundService {
    constructor() {
        this.activeJobs = new Map(); // jobId -> jobInfo
        this.webSocketClient = null;
        this.authToken = null;
        this.tokenExpiry = null;
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
                this.initializeWebSocket();
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
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
                return true;
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
            } else if (request.action === 'updateSettings') {
                this.handleSettingsUpdate(request.settings)
                    .then(() => sendResponse({ success: true }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
            }
        });
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
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        apiKey: this.settings.apiKey
                    })
                }
            );

            const data = await response.json();

            if (data.success) {
                this.authToken = data.token;
                // Calculate expiry time (subtract 5 minutes for safety)
                this.tokenExpiry = Date.now() + (60 * 60 * 1000) - CONFIG.TOKEN_REFRESH_THRESHOLD;

                console.log('✅ Authentication successful');

                // Schedule token refresh
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

        const timeUntilRefresh = this.tokenExpiry - Date.now();

        if (timeUntilRefresh > 0) {
            this.tokenRefreshTimeout = setTimeout(async () => {
                try {
                    await this.refreshToken();
                } catch (error) {
                    console.error('Token refresh failed:', error);
                    // Fall back to full authentication
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
                if (this.webSocketClient) {
                    this.webSocketClient.updateToken(this.authToken);
                }
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
        if (this.webSocketClient) {
            this.webSocketClient.disconnect();
        }

        if (!this.authToken) {
            console.warn('No auth token available for WebSocket');
            return;
        }

        // Import WebSocket client (we'll create this)
        this.webSocketClient = new WebSocketClient(this.settings.serverUrl, this.authToken);

        // Setup event listeners
        this.webSocketClient.on('connected', () => {
            console.log('🔌 WebSocket connected, subscribing to queue updates');
            this.webSocketClient.subscribeToQueue();
        });

        this.webSocketClient.on('jobProgress', (jobId, progress, message) => {
            this.notifyProgress(jobId, { status: 'processing', progress, progressMessage: message });
        });

        this.webSocketClient.on('jobFinished', (jobId, status, result, error) => {
            this.handleJobFinished(jobId, status, { result, error });
        });

        this.webSocketClient.on('queueStats', (stats) => {
            // Broadcast queue stats to all extension tabs
            this.broadcastToTabs('queueStatsUpdate', stats);
        });

        this.webSocketClient.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        this.webSocketClient.on('maxReconnectAttemptsReached', () => {
            console.error('WebSocket max reconnect attempts reached, falling back to polling');
            // Could implement polling fallback here
        });

        // Connect
        await this.webSocketClient.connect();
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

            if (this.webSocketClient) {
                this.webSocketClient.disconnect();
                this.webSocketClient = null;
            }

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
            if (this.webSocketClient && this.webSocketClient.isConnected()) {
                this.webSocketClient.subscribeToJob(result.jobId);
            }

            return {
                jobId: result.jobId,
                message: `Video added to queue (position: ${result.queuePosition})`,
                queuePosition: result.queuePosition,
                estimatedWaitTime: result.estimatedWaitTime,
                realTimeUpdates: this.webSocketClient?.isConnected() || false
            };

        } catch (error) {
            // Handle rate limiting
            if (error.message.includes('rate limit') || error.message.includes('429')) {
                throw new Error('Rate limit exceeded. Please wait before submitting more videos.');
            }

            // Handle authentication errors
            if (error.message.includes('401') || error.message.includes('Invalid token')) {
                try {
                    await this.authenticate();
                    return this.handleVideoSend(videoData); // Retry once
                } catch (authError) {
                    throw new Error('Authentication failed. Please check your API key in settings.');
                }
            }

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
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`
                    }
                }
            );

            const data = await response.json();
            return data;
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
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`
                    }
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

                // Handle rate limiting
                if (response.status === 429) {
                    const retryAfter = response.headers.get('X-RateLimit-Reset') || '60';
                    throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
                }

                // Handle authentication errors
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
     * Notify content scripts about job progress via real-time or polling
     */
    notifyProgress(jobId, status) {
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
        if (this.webSocketClient) {
            this.webSocketClient.unsubscribeFromJob(jobId);
        }

        // Notify content scripts
        this.broadcastToTabs('jobFinished', { jobId, reason, details });

        // Cleanup after delay
        setTimeout(() => {
            this.activeJobs.delete(jobId);
        }, 30000); // 30 seconds
    }

    /**
     * Cleanup job resources
     */
    cleanupJob(jobId, reason, details = {}) {
        if (this.webSocketClient) {
            this.webSocketClient.unsubscribeFromJob(jobId);
        }

        this.broadcastToTabs('jobFinished', { jobId, reason, details });
        this.activeJobs.delete(jobId);
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

        if (message.includes('API ключ') || message.includes('API key')) {
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

/**
 * Simple WebSocket Client for the extension
 */
class WebSocketClient {
    constructor(serverUrl, token) {
        this.serverUrl = serverUrl;
        this.token = token;
        this.socket = null;
        this.connectionState = 'disconnected';
        this.reconnectAttempts = 0;
        this.eventListeners = new Map();
        this.subscriptions = new Set();
    }

    async connect() {
        if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
            return;
        }

        try {
            this.connectionState = 'connecting';
            const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/ws';

            this.socket = new WebSocket(wsUrl);
            this.setupEventHandlers();
        } catch (error) {
            this.connectionState = 'error';
            this.emit('error', error);
            this.scheduleReconnect();
        }
    }

    setupEventHandlers() {
        this.socket.onopen = () => {
            this.connectionState = 'connected';
            this.reconnectAttempts = 0;

            // Authenticate
            this.socket.send(JSON.stringify({
                type: 'auth',
                token: this.token
            }));

            this.emit('connected');
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };

        this.socket.onclose = () => {
            this.connectionState = 'disconnected';
            this.socket = null;
            this.emit('disconnected');
            this.scheduleReconnect();
        };

        this.socket.onerror = (error) => {
            this.emit('error', error);
        };
    }

    handleMessage(message) {
        switch (message.type) {
            case 'job:progress':
                this.emit('jobProgress', message.jobId, message.progress, message.message);
                break;
            case 'job:finished':
                this.emit('jobFinished', message.jobId, message.status, message.result, message.error);
                break;
            case 'queue:stats':
                this.emit('queueStats', message);
                break;
            default:
                console.log('Unknown WebSocket message:', message);
        }
    }

    subscribeToJob(jobId) {
        this.subscriptions.add(`job:${jobId}`);
        if (this.isConnected()) {
            this.socket.send(JSON.stringify({
                type: 'subscribe:job',
                jobId
            }));
        }
    }

    unsubscribeFromJob(jobId) {
        this.subscriptions.delete(`job:${jobId}`);
        if (this.isConnected()) {
            this.socket.send(JSON.stringify({
                type: 'unsubscribe:job',
                jobId
            }));
        }
    }

    subscribeToQueue() {
        this.subscriptions.add('queue');
        if (this.isConnected()) {
            this.socket.send(JSON.stringify({
                type: 'subscribe:queue'
            }));
        }
    }

    updateToken(newToken) {
        this.token = newToken;
        if (this.isConnected()) {
            this.socket.send(JSON.stringify({
                type: 'auth',
                token: newToken
            }));
        }
    }

    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= CONFIG.WEBSOCKET_RECONNECT_ATTEMPTS) {
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = CONFIG.WEBSOCKET_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    disconnect() {
        if (this.socket) {
            this.socket.close(1000, 'Manual disconnect');
            this.socket = null;
        }
        this.connectionState = 'disconnected';
    }

    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    emit(event, ...args) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`Error in ${event} listener:`, error);
                }
            });
        }
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

// Export for debugging
if (typeof window !== 'undefined') {
    window.backgroundService = backgroundService;
}