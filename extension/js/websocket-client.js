/**
 * Socket.IO Client for Chrome Extension v4.0 - Service Worker compatible
 */

class WebSocketClient {
    constructor() {
        this.socket = null;
        this.connectionState = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.eventListeners = new Map();
        this.subscribedJobs = new Set();
        this.subscribedToQueue = false;
        this.serverUrl = '';
    }

    initialize(serverUrl) {
        this.serverUrl = serverUrl;
    }

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

            // Load Socket.IO client for Service Worker
            if (typeof io === 'undefined') {
                await this.loadSocketIOClient();
            }

            console.log(`🔌 Connecting to Socket.IO: ${this.serverUrl}`);

            this.socket = io(this.serverUrl, {
                path: '/ws',
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: false
            });

            this.setupEventHandlers();

        } catch (error) {
            console.error('🔌 Socket.IO connection failed:', error);
            this.connectionState = 'error';
            this.emit('error', error);
            this.scheduleReconnect();
        }
    }

    async loadSocketIOClient() {
        // Socket.IO уже загружен через importScripts
        if (typeof io === 'undefined') {
            throw new Error('Socket.IO client not available');
        }
    }

    setupEventHandlers() {
        this.socket.on('connect', () => {
            console.log('🔌 Socket.IO connected');
            this.connectionState = 'connected';
            this.reconnectAttempts = 0;
            this.resubscribe();
            this.emit('connected');
        });

        this.socket.on('disconnect', (reason) => {
            console.log(`🔌 Socket.IO disconnected: ${reason}`);
            this.connectionState = 'disconnected';
            this.emit('disconnected', reason);

            if (reason !== 'io client disconnect') {
                this.scheduleReconnect();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('🔌 Socket.IO connection error:', error);
            this.connectionState = 'error';
            this.emit('error', error);
            this.scheduleReconnect();
        });

        // Server events
        this.socket.on('connected', (data) => {
            console.log('🔌 Server connection confirmed:', data);
        });

        this.socket.on('job:progress', (data) => {
            this.emit('jobProgress', data.jobId, data.progress, data.message);
        });

        this.socket.on('job:finished', (data) => {
            this.emit('jobFinished', data.jobId, data.status, data.result, data.error);
        });

        this.socket.on('queue:stats', (data) => {
            this.emit('queueStats', data);
        });

        this.socket.on('memory:stats', (data) => {
            this.emit('memoryStats', data);
        });

        this.socket.on('server:shutdown', (data) => {
            console.log('🔌 Server shutting down:', data.message);
            this.emit('serverShutdown', data);
        });

        this.socket.on('subscribed:job', (data) => {
            console.log(`📱 Subscribed to job: ${data.jobId}`);
        });

        this.socket.on('subscribed:queue', () => {
            console.log('📱 Subscribed to queue updates');
        });

        this.socket.on('error', (data) => {
            console.error('🔌 Server error:', data.message);
            this.emit('serverError', new Error(data.message));
        });
    }

    subscribeToJob(jobId) {
        if (!jobId) return false;

        this.subscribedJobs.add(jobId);

        if (this.isConnected()) {
            this.socket.emit('subscribe:job', jobId);
            return true;
        }
        return false;
    }

    unsubscribeFromJob(jobId) {
        if (!jobId) return false;

        this.subscribedJobs.delete(jobId);

        if (this.isConnected()) {
            this.socket.emit('unsubscribe:job', jobId);
            return true;
        }
        return false;
    }

    subscribeToQueue() {
        this.subscribedToQueue = true;

        if (this.isConnected()) {
            this.socket.emit('subscribe:queue');
            return true;
        }
        return false;
    }

    resubscribe() {
        if (this.subscribedToQueue) {
            this.subscribeToQueue();
        }

        this.subscribedJobs.forEach(jobId => {
            this.subscribeToJob(jobId);
        });
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('🔌 Max reconnect attempts reached');
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = 2000 * Math.pow(1.5, this.reconnectAttempts - 1);

        console.log(`🔌 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

        setTimeout(() => {
            if (this.connectionState !== 'connected') {
                this.connect();
            }
        }, delay);
    }

    isConnected() {
        return this.socket && this.socket.connected;
    }

    getConnectionState() {
        return this.connectionState;
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

    disconnect() {
        if (this.socket) {
            console.log('🔌 Manually disconnecting Socket.IO');
            this.socket.disconnect();
            this.socket = null;
        }

        this.connectionState = 'disconnected';
        this.subscribedJobs.clear();
        this.subscribedToQueue = false;
    }

    getStats() {
        return {
            connectionState: this.connectionState,
            reconnectAttempts: this.reconnectAttempts,
            subscribedJobs: this.subscribedJobs.size,
            subscribedToQueue: this.subscribedToQueue,
            serverUrl: this.serverUrl,
            connected: this.isConnected()
        };
    }
}

// Export for Service Worker
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketClient;
} else if (typeof self !== 'undefined') {
    self.WebSocketClient = WebSocketClient;
}
