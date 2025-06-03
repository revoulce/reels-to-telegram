/**
 * WebSocket Client for real-time updates
 * Replaces polling with push notifications from server
 */
class WebSocketClient {
    constructor(serverUrl, apiKey) {
        this.serverUrl = serverUrl;
        this.apiKey = apiKey;
        this.socket = null;
        this.connectionState = 'disconnected'; // 'connecting', 'connected', 'disconnected', 'error'
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.eventListeners = new Map();
        this.subscribedJobs = new Set();
        this.subscribedToQueue = false;
        this.token = null;

        console.log('🔌 WebSocket client initialized');
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
            return;
        }

        try {
            this.connectionState = 'connecting';

            // Get authentication token
            await this.authenticate();

            // Create WebSocket connection
            const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/ws';
            console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);

            this.socket = new WebSocket(wsUrl);
            this.setupEventHandlers();

        } catch (error) {
            console.error('🔌 WebSocket connection failed:', error);
            this.connectionState = 'error';
            this.scheduleReconnect();
        }
    }

    /**
     * Authenticate and get JWT token
     */
    async authenticate() {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    apiKey: this.apiKey
                })
            });

            if (!response.ok) {
                throw new Error(`Authentication failed: ${response.status}`);
            }

            const data = await response.json();
            this.token = data.token;
            console.log('🔐 Authentication successful, token obtained');

        } catch (error) {
            console.error('🔐 Authentication failed:', error);
            throw error;
        }
    }

    /**
     * Setup WebSocket event handlers
     */
    setupEventHandlers() {
        this.socket.onopen = () => {
            console.log('🔌 WebSocket connected');
            this.connectionState = 'connected';
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;

            // Send authentication
            this.socket.send(JSON.stringify({
                type: 'auth',
                token: this.token
            }));

            // Re-subscribe to previous subscriptions
            this.resubscribe();

            this.emit('connected');
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
            console.log(`🔌 WebSocket closed: ${event.code} - ${event.reason}`);
            this.connectionState = 'disconnected';
            this.socket = null;
            this.emit('disconnected');

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
        switch (message.type || message.event) {
            case 'connected':
                console.log('🔌 Server connection confirmed:', message);
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
                this.emit('serverShutdown');
                break;

            case 'subscribed:job':
                console.log(`📱 Subscribed to job: ${message.jobId}`);
                break;

            case 'subscribed:queue':
                console.log('📱 Subscribed to queue updates');
                break;

            case 'error':
                console.error('🔌 Server error:', message.message);
                this.emit('error', new Error(message.message));
                break;

            default:
                console.log('🔌 Unknown message type:', message);
        }
    }

    /**
     * Subscribe to job progress updates
     */
    subscribeToJob(jobId) {
        if (!jobId) return;

        this.subscribedJobs.add(jobId);

        if (this.isConnected()) {
            this.socket.send(JSON.stringify({
                type: 'subscribe:job',
                jobId: jobId
            }));
        }
    }

    /**
     * Unsubscribe from job updates
     */
    unsubscribeFromJob(jobId) {
        if (!jobId) return;

        this.subscribedJobs.delete(jobId);

        if (this.isConnected()) {
            this.socket.send(JSON.stringify({
                type: 'unsubscribe:job',
                jobId: jobId
            }));
        }
    }

    /**
     * Subscribe to queue statistics updates
     */
    subscribeToQueue() {
        this.subscribedToQueue = true;

        if (this.isConnected()) {
            this.socket.send(JSON.stringify({
                type: 'subscribe:queue'
            }));
        }
    }

    /**
     * Unsubscribe from queue updates
     */
    unsubscribeFromQueue() {
        this.subscribedToQueue = false;

        if (this.isConnected()) {
            this.socket.send(JSON.stringify({
                type: 'unsubscribe:queue'
            }));
        }
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
     * Schedule reconnect with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('🔌 Max reconnect attempts reached, giving up');
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`🔌 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    /**
     * Send ping to keep connection alive
     */
    ping() {
        if (this.isConnected()) {
            this.socket.send(JSON.stringify({
                type: 'ping',
                timestamp: Date.now()
            }));
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
        if (this.socket) {
            console.log('🔌 Manually disconnecting WebSocket');
            this.socket.close(1000, 'Manual disconnect');
            this.socket = null;
        }
        this.connectionState = 'disconnected';
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
            hasToken: !!this.token
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketClient;
}