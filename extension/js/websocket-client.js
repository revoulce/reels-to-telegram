/**
 * WebSocket Client for Chrome Extension v4.0
 * Handles real-time communication with server (no authentication)
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
    }

    /**
     * Initialize with server settings
     */
    initialize(serverUrl) {
        this.serverUrl = serverUrl;
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
            return;
        }

        if (!this.serverUrl) {
            throw new Error('Server URL required');
        }

        try {
            this.connectionState = 'connecting';
            this.emit('connecting');

            const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/ws';
            console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);

            this.socket = new WebSocket(wsUrl);
            this.setupEventHandlers();

            this.connectionTimeout = setTimeout(() => {
                if (this.connectionState === 'connecting') {
                    console.error('🔌 WebSocket connection timeout');
                    this.socket.close();
                    this.connectionState = 'error';
                    this.emit('error', new Error('Connection timeout'));
                    this.scheduleReconnect();
                }
            }, 10000);

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
            console.log('🔌 WebSocket connected');

            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }

            this.connectionState = 'connected';
            this.reconnectAttempts = 0;
            this.reconnectDelay = 2000;

            this.resubscribe();
            this.startPing();
            this.emit('connected');
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
            console.log(`🔌 WebSocket closed: code=${event.code}, reason="${event.reason}"`);

            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }

            this.connectionState = 'disconnected';
            this.socket = null;
            this.stopPing();
            this.emit('disconnected', event.code, event.reason);

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
                console.log('🔌 Server connection confirmed');
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
                break;

            case 'error':
                console.error('🔌 Server error:', message.message);
                this.emit('serverError', new Error(message.message));
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

        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
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
