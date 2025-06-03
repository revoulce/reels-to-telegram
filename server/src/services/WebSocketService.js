const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * WebSocket Service for real-time updates
 * Replaces polling with push notifications
 */
class WebSocketService {
    constructor(httpServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: ["https://www.instagram.com", "chrome-extension://*"],
                methods: ["GET", "POST"],
                credentials: true
            },
            // Namespace for different types of updates
            path: '/ws',
            // Performance optimizations
            pingTimeout: 60000,
            pingInterval: 25000,
            maxHttpBufferSize: 1e6 // 1MB
        });

        this.connectedClients = new Map(); // socket.id -> client info
        this.jobSubscriptions = new Map(); // jobId -> Set<socket.id>
        this.userConnections = new Map();  // userId -> Set<socket.id>

        this.setupMiddleware();
        this.setupEventHandlers();
        this.startCleanupScheduler();

        console.log('🔌 WebSocket service initialized');
    }

    /**
     * Setup authentication and connection middleware
     */
    setupMiddleware() {
        // Authentication middleware
        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token || socket.handshake.query.token;

            if (!token) {
                return next(new Error('Authentication token required'));
            }

            try {
                // For now, accept API key as token (backward compatibility)
                if (token === config.API_KEY) {
                    socket.userId = 'api-user';
                    socket.userAgent = socket.handshake.headers['user-agent'];
                    socket.ip = socket.handshake.address;
                    return next();
                }

                // JWT token validation (future enhancement)
                if (token.startsWith('eyJ')) {
                    const decoded = jwt.verify(token, config.JWT_SECRET || config.API_KEY);
                    socket.userId = decoded.userId || decoded.sub;
                    socket.userAgent = socket.handshake.headers['user-agent'];
                    socket.ip = socket.handshake.address;
                    return next();
                }

                throw new Error('Invalid token format');
            } catch (error) {
                return next(new Error('Invalid authentication token'));
            }
        });

        // Rate limiting middleware
        this.io.use((socket, next) => {
            const clientInfo = this.connectedClients.get(socket.id);

            // Check connection limit per user
            const userConnections = this.userConnections.get(socket.userId) || new Set();
            if (userConnections.size >= 5) {
                return next(new Error('Too many connections for this user'));
            }

            next();
        });
    }

    /**
     * Setup WebSocket event handlers
     */
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);

            // Job subscription events
            socket.on('subscribe:job', (jobId) => this.subscribeToJob(socket, jobId));
            socket.on('unsubscribe:job', (jobId) => this.unsubscribeFromJob(socket, jobId));

            // Queue monitoring events
            socket.on('subscribe:queue', () => this.subscribeToQueue(socket));
            socket.on('unsubscribe:queue', () => this.unsubscribeFromQueue(socket));

            // Memory monitoring events
            socket.on('subscribe:memory', () => this.subscribeToMemory(socket));
            socket.on('unsubscribe:memory', () => this.unsubscribeFromMemory(socket));

            // Heartbeat for connection health
            socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));

            // Disconnect handling
            socket.on('disconnect', (reason) => this.handleDisconnection(socket, reason));

            // Error handling
            socket.on('error', (error) => {
                console.error(`WebSocket error for ${socket.id}:`, error);
            });
        });
    }

    /**
     * Handle new WebSocket connection
     */
    handleConnection(socket) {
        const clientInfo = {
            userId: socket.userId,
            userAgent: socket.userAgent,
            ip: socket.ip,
            connectedAt: new Date(),
            subscriptions: new Set()
        };

        this.connectedClients.set(socket.id, clientInfo);

        // Track user connections
        if (!this.userConnections.has(socket.userId)) {
            this.userConnections.set(socket.userId, new Set());
        }
        this.userConnections.get(socket.userId).add(socket.id);

        console.log(`🔌 WebSocket connected: ${socket.id} (user: ${socket.userId})`);

        // Send initial connection info
        socket.emit('connected', {
            socketId: socket.id,
            serverTime: new Date().toISOString(),
            features: ['job-progress', 'queue-stats', 'memory-monitoring']
        });

        // Send current stats
        this.sendQueueStats(socket);
    }

    /**
     * Handle WebSocket disconnection
     */
    handleDisconnection(socket, reason) {
        const clientInfo = this.connectedClients.get(socket.id);

        if (clientInfo) {
            // Remove from all subscriptions
            clientInfo.subscriptions.forEach(subscription => {
                this.cleanupSubscription(socket.id, subscription);
            });

            // Remove from user connections
            const userConnections = this.userConnections.get(socket.userId);
            if (userConnections) {
                userConnections.delete(socket.id);
                if (userConnections.size === 0) {
                    this.userConnections.delete(socket.userId);
                }
            }

            this.connectedClients.delete(socket.id);
        }

        console.log(`🔌 WebSocket disconnected: ${socket.id} (reason: ${reason})`);
    }

    /**
     * Subscribe socket to job progress updates
     */
    subscribeToJob(socket, jobId) {
        if (!jobId || typeof jobId !== 'string') {
            socket.emit('error', { message: 'Invalid job ID' });
            return;
        }

        // Add to job subscriptions
        if (!this.jobSubscriptions.has(jobId)) {
            this.jobSubscriptions.set(jobId, new Set());
        }
        this.jobSubscriptions.get(jobId).add(socket.id);

        // Track in client info
        const clientInfo = this.connectedClients.get(socket.id);
        if (clientInfo) {
            clientInfo.subscriptions.add(`job:${jobId}`);
        }

        socket.emit('subscribed:job', { jobId });
        console.log(`📱 Socket ${socket.id} subscribed to job ${jobId}`);
    }

    /**
     * Unsubscribe socket from job updates
     */
    unsubscribeFromJob(socket, jobId) {
        const subscribers = this.jobSubscriptions.get(jobId);
        if (subscribers) {
            subscribers.delete(socket.id);
            if (subscribers.size === 0) {
                this.jobSubscriptions.delete(jobId);
            }
        }

        const clientInfo = this.connectedClients.get(socket.id);
        if (clientInfo) {
            clientInfo.subscriptions.delete(`job:${jobId}`);
        }

        socket.emit('unsubscribed:job', { jobId });
    }

    /**
     * Subscribe to queue statistics updates
     */
    subscribeToQueue(socket) {
        const clientInfo = this.connectedClients.get(socket.id);
        if (clientInfo) {
            clientInfo.subscriptions.add('queue:stats');
        }
        socket.emit('subscribed:queue');
        this.sendQueueStats(socket);
    }

    /**
     * Subscribe to memory monitoring updates
     */
    subscribeToMemory(socket) {
        const clientInfo = this.connectedClients.get(socket.id);
        if (clientInfo) {
            clientInfo.subscriptions.add('memory:stats');
        }
        socket.emit('subscribed:memory');
    }

    /**
     * Broadcast job progress update to subscribed clients
     */
    broadcastJobProgress(jobId, progress, message) {
        const subscribers = this.jobSubscriptions.get(jobId);
        if (!subscribers || subscribers.size === 0) return;

        const update = {
            jobId,
            progress,
            message,
            timestamp: new Date().toISOString()
        };

        subscribers.forEach(socketId => {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('job:progress', update);
            }
        });

        console.log(`📊 Broadcasted progress for job ${jobId} to ${subscribers.size} clients`);
    }

    /**
     * Broadcast job completion/failure
     */
    broadcastJobFinished(jobId, status, result = null, error = null) {
        const subscribers = this.jobSubscriptions.get(jobId);
        if (!subscribers || subscribers.size === 0) return;

        const update = {
            jobId,
            status, // 'completed', 'failed', 'cancelled'
            result,
            error,
            timestamp: new Date().toISOString()
        };

        subscribers.forEach(socketId => {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('job:finished', update);
            }
        });

        // Auto-cleanup subscriptions for finished jobs
        setTimeout(() => {
            this.jobSubscriptions.delete(jobId);
        }, 30000); // 30 seconds delay
    }

    /**
     * Broadcast queue statistics to subscribed clients
     */
    broadcastQueueStats(stats) {
        const update = {
            ...stats,
            timestamp: new Date().toISOString()
        };

        this.connectedClients.forEach((clientInfo, socketId) => {
            if (clientInfo.subscriptions.has('queue:stats')) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('queue:stats', update);
                }
            }
        });
    }

    /**
     * Broadcast memory statistics
     */
    broadcastMemoryStats(stats) {
        const update = {
            ...stats,
            timestamp: new Date().toISOString()
        };

        this.connectedClients.forEach((clientInfo, socketId) => {
            if (clientInfo.subscriptions.has('memory:stats')) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('memory:stats', update);
                }
            }
        });
    }

    /**
     * Send current queue stats to specific socket
     */
    sendQueueStats(socket) {
        // This will be called by the main queue to provide current stats
        socket.emit('queue:stats', {
            message: 'Current stats will be provided by queue service',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Cleanup subscription mapping
     */
    cleanupSubscription(socketId, subscription) {
        if (subscription.startsWith('job:')) {
            const jobId = subscription.substring(4);
            const subscribers = this.jobSubscriptions.get(jobId);
            if (subscribers) {
                subscribers.delete(socketId);
                if (subscribers.size === 0) {
                    this.jobSubscriptions.delete(jobId);
                }
            }
        }
    }

    /**
     * Get connection statistics
     */
    getStats() {
        const stats = {
            totalConnections: this.connectedClients.size,
            totalUsers: this.userConnections.size,
            totalJobSubscriptions: this.jobSubscriptions.size,
            averageSubscriptionsPerClient: 0
        };

        let totalSubscriptions = 0;
        this.connectedClients.forEach(clientInfo => {
            totalSubscriptions += clientInfo.subscriptions.size;
        });

        if (this.connectedClients.size > 0) {
            stats.averageSubscriptionsPerClient = Math.round(totalSubscriptions / this.connectedClients.size * 100) / 100;
        }

        return stats;
    }

    /**
     * Start cleanup scheduler for inactive connections
     */
    startCleanupScheduler() {
        setInterval(() => {
            this.cleanupInactiveConnections();
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Cleanup inactive connections and old subscriptions
     */
    cleanupInactiveConnections() {
        let cleaned = 0;

        // Cleanup disconnected sockets from subscriptions
        this.jobSubscriptions.forEach((subscribers, jobId) => {
            const activeSubscribers = new Set();

            subscribers.forEach(socketId => {
                if (this.io.sockets.sockets.has(socketId)) {
                    activeSubscribers.add(socketId);
                } else {
                    cleaned++;
                }
            });

            if (activeSubscribers.size === 0) {
                this.jobSubscriptions.delete(jobId);
            } else {
                this.jobSubscriptions.set(jobId, activeSubscribers);
            }
        });

        if (cleaned > 0) {
            console.log(`🧹 WebSocket cleanup: removed ${cleaned} inactive subscriptions`);
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        console.log('🔌 Shutting down WebSocket service...');

        // Notify all connected clients
        this.io.emit('server:shutdown', {
            message: 'Server is shutting down',
            timestamp: new Date().toISOString()
        });

        // Close all connections
        this.io.close((error) => {
            if (error) {
                console.error('Error closing WebSocket server:', error);
            } else {
                console.log('✅ WebSocket server closed gracefully');
            }
        });
    }
}

module.exports = WebSocketService;