/**
 * WebSocket Client for Chrome Extension v4.0
 * Handles real-time communication with server
 */

class WebSocketClient {
    constructor() {
        this.socket = null;
        this.connectionState = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.eventListeners = new Map();
        this.subscribedJobs = new Set();
        this.subscribedToQueue = false;
        this.pingInterval = null;
        this.connectionTimeout = null;
        this.serverUrl = '';
        this.authToken = '';
    }

    /**
     * Initialize with server settings
     */
    initialize(serverUrl, authToken) {
        this.serverUrl = serverUrl;
        this.authToken = authToken;
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
            return;
        }

        if (!this.serverUrl || !this.authToken) {
            throw new Error('Server URL and auth token required');
        }

        try {
            this.connectionState = 'connecting';
            this.emit('connecting');

            const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/ws';
            this.socket = new WebSocket(wsUrl);
            this.setupEventHandlers();

            // Set connection timeout
            this.connectionTimeout = setTimeout(() => {
                if (this.connectionState === 'connecting') {
                    this.handleError(new Error('Connection timeout'));
                }
            }, 10000);

        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Setup WebSocket event handlers
     */
    setupEventHandlers() {
        this.socket.onopen = () => {
            console.log('🔌 WebSocket connected, sending authentication...');
            this.clearTimeouts();
            this.connectionState = 'authenticating';
            this.send({ type: 'auth', token: this.authToken });
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('🔌 Failed to parse WebSocket message:', error);
            }
        };

        this.socket.onclose = (event) => {
            console.log(`🔌 WebSocket closed: code=${event.code}, reason="${event.reason}"`);
            this.clearTimeouts();
            this.connectionState = 'disconnected';
            this.socket = null;
            this.stopPing();
            this.emit('disconnected', event.code, event.reason);

            if (event.code !== 1000) {
                this.scheduleReconnect();
            }
        };

        this.socket.onerror = (error) => {
            this.handleError(error);
        };
    }

    handleError(error) {
        console.error('🔌 WebSocket error:', error);
        this.connectionState = 'error';
        this.emit('error', error);
        this.scheduleReconnect();
    }

    clearTimeouts() {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(message) {
        switch (message.type) {
            case 'auth':
                if (message.success) {
                    this.connectionState = 'connected';
                    this.emit('connected');
                    this.startPing();
                } else {
                    this.handleError(new Error(message.error || 'Authentication failed'));
                }
                break;

            case 'job:update':
                this.emit('jobUpdate', message.jobId, message.data);
                break;

            case 'queue:stats':
                this.emit('queueStats', message.data);
                break;

            case 'error':
                this.handleError(new Error(message.message));
                break;

            default:
                console.log('🔌 Unknown message type:', message);
        }
    }

    /**
     * Send message to server
     */
    send(message) {
        if (this.isConnected()) {
            this.socket.send(JSON.stringify(message));
            return true;
        }
        return false;
    }

    /**
     * Subscribe to job progress updates
     */
    subscribeToJob(jobId) {
        if (!jobId) return false;

        this.subscribedJobs.add(jobId);

        return this.send({
            type: 'subscribe:job',
            jobId: jobId
        });
    }

    /**
     * Unsubscribe from job updates
     */
    unsubscribeFromJob(jobId) {
        if (!jobId) return false;

        this.subscribedJobs.delete(jobId);

        return this.send({
            type: 'unsubscribe:job',
            jobId: jobId
        });
    }

    /**
     * Subscribe to queue statistics updates
     */
    subscribeToQueue() {
        this.subscribedToQueue = true;

        return this.send({
            type: 'subscribe:queue'
        });
    }

    /**
     * Unsubscribe from queue updates
     */
    unsubscribeFromQueue() {
        this.subscribedToQueue = false;

        return this.send({
            type: 'unsubscribe:queue'
        });
    }

    /**
     * Subscribe to memory stats
     */
    subscribeToMemory() {
        return this.send({
            type: 'subscribe:memory'
        });
    }

    /**
     * Re-subscribe to all previous subscriptions after reconnect
     */
    resubscribe() {
        if (this.subscribedToQueue) {
            this.subscribeToQueue();
        }

        this.subscribedJobs.forEach(jobId => {
            this.subscribeToJob(jobId);
        });
    }

    /**
     * Start ping interval to keep connection alive
     */
    startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            this.send({ type: 'ping', timestamp: Date.now() });
        }, 25000);
    }

    /**
     * Stop ping interval
     */
    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Schedule reconnect with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
        setTimeout(() => this.connect(), delay);
    }

    /**
     * Check if WebSocket is connected
     */
    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    /**
     * Get connection state
     */
    getConnectionState() {
        return this.connectionState;
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.delete(callback);
        }
    }

    /**
     * Emit event to listeners
     */
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

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        this.stopPing();
        this.clearTimeouts();
        if (this.socket) {
            this.socket.close(1000, 'Manual disconnect');
            this.socket = null;
        }
        this.connectionState = 'disconnected';
        this.subscribedJobs.clear();
        this.subscribedToQueue = false;
    }

    /**
     * Get connection statistics
     */
    getStats() {
        return {
            connectionState: this.connectionState,
            reconnectAttempts: this.reconnectAttempts,
            subscribedJobs: this.subscribedJobs.size,
            subscribedToQueue: this.subscribedToQueue,
            hasToken: !!this.authToken,
            serverUrl: this.serverUrl
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketClient;
} else if (typeof window !== 'undefined') {
    window.WebSocketClient = WebSocketClient;
}
