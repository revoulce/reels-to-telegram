/**
 * WebSocket Client for Chrome Extension v4.0
 * Handles real-time communication with server
 */

class WebSocketClient {
    constructor() {
        this.socket = null;
        this.connectionState = 'disconnected'; // 'connecting', 'connected', 'disconnected', 'error'
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.eventListeners = new Map();
        this.subscribedJobs = new Set();
        this.subscribedToQueue = false;
        this.pingInterval = null;
        this.connectionTimeout = null;
        this.authTimeout = null;

        // Auth
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
            console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);

            this.socket = new WebSocket(wsUrl);
            this.setupEventHandlers();

            // Set connection timeout
            this.connectionTimeout = setTimeout(() => {
                if (this.connectionState === 'connecting') {
                    console.error('🔌 WebSocket connection timeout');
                    this.socket.close();
                    this.connectionState = 'error';
                    this.emit('error', new Error('Connection timeout'));
                    this.scheduleReconnect();
                }
            }, 10000); // 10 second timeout

        } catch (error) {
            console.error('🔌 WebSocket connection failed:', error);
            this.connectionState = 'error';
            this.emit('error', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Setup WebSocket event handlers
     */
    setupEventHandlers() {
        this.socket.onopen = () => {
            console.log('🔌 WebSocket connected, sending authentication...');

            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }

            // Don't set as connected yet - wait for successful auth
            this.connectionState = 'authenticating';

            // Send authentication
            this.send({
                type: 'auth',
                token: this.authToken
            });

            // Set auth timeout
            this.authTimeout = setTimeout(() => {
                console.error('🔌 WebSocket authentication timeout');
                this.socket.close();
                this.connectionState = 'error';
                this.emit('error', new Error('Authentication timeout'));
                this.scheduleReconnect();
            }, 5000); // 5 second auth timeout
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('🔌 Failed to parse WebSocket message:', error, 'Raw:', event.data);
            }
        };

        this.socket.onclose = (event) => {
            console.log(`🔌 WebSocket closed: code=${event.code}, reason="${event.reason}", wasClean=${event.wasClean}`);

            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }

            if (this.authTimeout) {
                clearTimeout(this.authTimeout);
                this.authTimeout = null;
            }

            this.connectionState = 'disconnected';
            this.socket = null;
            this.stopPing();
            this.emit('disconnected', event.code, event.reason);

            // Attempt to reconnect unless manually closed
            if (event.code !== 1000) {
                this.scheduleReconnect();
            }
        };

        this.socket.onerror = (error) => {
            console.error('🔌 WebSocket error:', error);
            this.connectionState = 'error';
            this.emit('error', error);
        };
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(message) {
        switch (message.type) {
            case 'connected':
                console.log('🔌 Server connection confirmed, authentication successful');

                if (this.authTimeout) {
                    clearTimeout(this.authTimeout);
                    this.authTimeout = null;
                }

                this.connectionState = 'connected';
                this.reconnectAttempts = 0;
                this.reconnectDelay = 2000;

                // Re-subscribe to previous subscriptions
                this.resubscribe();

                // Start ping interval
                this.startPing();

                this.emit('connected');
                break;

            case 'job:progress':
                this.emit('jobProgress', message.jobId, message.progress, message.message);
                break;

            case 'job:finished':
                this.emit('jobFinished', message.jobId, message.status, message.result, message.error);
                break;

            case 'queue:stats':
                this.emit('queueStats', message);
                break;

            case 'memory:stats':
                this.emit('memoryStats', message);
                break;

            case 'server:shutdown':
                console.log('🔌 Server shutting down:', message.message);
                this.emit('serverShutdown', message);
                break;

            case 'subscribed:job':
                console.log(`📱 Subscribed to job: ${message.jobId}`);
                break;

            case 'subscribed:queue':
                console.log('📱 Subscribed to queue updates');
                break;

            case 'pong':
                // Handle ping response
                break;

            case 'error':
                console.error('🔌 Server error:', message.message);
                this.emit('serverError', new Error(message.message));

                // If auth error, trigger reconnect
                if (message.message.includes('Authentication')) {
                    this.socket.close();
                }
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
        this.pingInterval = setInterval(() => {
            this.send({
                type: 'ping',
                timestamp: Date.now()
            });
        }, 25000); // Every 25 seconds
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
            console.error('🔌 Max reconnect attempts reached');
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);

        console.log(`🔌 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        setTimeout(() => {
            if (this.connectionState !== 'connected') {
                this.connect();
            }
        }, delay);
    }

    /**
     * Update authentication token
     */
    updateToken(newToken) {
        this.authToken = newToken;

        if (this.isConnected()) {
            this.send({
                type: 'auth',
                token: newToken
            });
        }
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
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
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

        // Clear timeouts
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }

        if (this.socket) {
            console.log('🔌 Manually disconnecting WebSocket');
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