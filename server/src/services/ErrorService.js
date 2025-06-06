/**
 * Centralized error handling service
 */
class ErrorService {
    constructor() {
        this.errorTypes = {
            VALIDATION: 'ValidationError',
            AUTHENTICATION: 'AuthenticationError',
            AUTHORIZATION: 'AuthorizationError',
            RATE_LIMIT: 'RateLimitError',
            QUEUE: 'QueueError',
            MEMORY: 'MemoryError',
            NETWORK: 'NetworkError',
            SERVER: 'ServerError'
        };
    }

    /**
     * Create error with appropriate type and status code
     */
    createError(type, message, details = {}) {
        const error = new Error(message);
        error.type = type;
        error.details = details;

        // Set appropriate status code
        switch (type) {
            case this.errorTypes.VALIDATION:
                error.statusCode = 400;
                break;
            case this.errorTypes.AUTHENTICATION:
                error.statusCode = 401;
                break;
            case this.errorTypes.AUTHORIZATION:
                error.statusCode = 403;
                break;
            case this.errorTypes.RATE_LIMIT:
                error.statusCode = 429;
                break;
            case this.errorTypes.QUEUE:
                error.statusCode = 503;
                break;
            case this.errorTypes.MEMORY:
                error.statusCode = 507;
                break;
            case this.errorTypes.NETWORK:
                error.statusCode = 502;
                break;
            default:
                error.statusCode = 500;
        }

        return error;
    }

    /**
     * Handle error and return appropriate response
     */
    handleError(error, req, res) {
        console.error(`${new Date().toISOString()} - ERROR ${req.method} ${req.originalUrl}:`, error.message);

        if (process.env.NODE_ENV === 'development') {
            console.error('Stack:', error.stack);
        }

        const statusCode = error.statusCode || 500;
        const response = {
            success: false,
            error: error.message || 'Internal server error'
        };

        // Add additional error details if available
        if (error.details) {
            Object.assign(response, error.details);
        }

        // Add stack trace in development
        if (process.env.NODE_ENV === 'development') {
            response.stack = error.stack;
        }

        res.status(statusCode).json(response);
    }

    /**
     * Convert technical error to user-friendly message
     */
    getUserFriendlyMessage(error) {
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

        if (message.includes('Memory limit')) {
            return 'Server is running low on memory. Please try again later.';
        }

        return message;
    }
}

module.exports = new ErrorService();
