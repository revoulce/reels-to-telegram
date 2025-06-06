/**
 * Client-side error handling service
 */
class ErrorHandler {
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
     * Handle error and show appropriate notification
     */
    handleError(error, showNotification = true) {
        console.error('Error:', error);

        const message = this.getUserFriendlyMessage(error);

        if (showNotification) {
            this.showNotification(message, 'error');
        }

        return {
            success: false,
            error: message
        };
    }

    /**
     * Show notification to user
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Remove notification after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
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

        if (message.includes('Invalid URL')) {
            return 'Invalid Instagram URL. Please check the URL and try again.';
        }

        if (message.includes('Authentication')) {
            return 'Authentication failed. Please check your API key.';
        }

        return message;
    }

    /**
     * Validate response from server
     */
    validateResponse(response) {
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        return response.json();
    }
}

module.exports = new ErrorHandler();
