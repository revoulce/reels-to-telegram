const config = require('../config');

/**
 * Simple API Key Authentication Service
 */
class AuthService {
    constructor() {
        this.apiKey = config.API_KEY;
        console.log('🔐 API Key Authentication service initialized');
    }

    /**
     * Validate API key from request
     * @param {string} apiKey - API key from request
     * @returns {boolean}
     */
    validateApiKey(apiKey) {
        return apiKey === this.apiKey;
    }

    /**
     * Extract API key from request headers
     * @param {object} req - Express request object
     * @returns {string|null} API key or null
     */
    extractApiKey(req) {
        const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
        if (!authHeader) return null;

        // Handle both formats: "Bearer API_KEY" and just "API_KEY"
        return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    }

    /**
     * Create authentication middleware
     * @returns {function} Express middleware
     */
    createAuthMiddleware() {
        return (req, res, next) => {
            const apiKey = this.extractApiKey(req);

            if (!apiKey) {
                return res.status(401).json({
                    success: false,
                    error: 'API key required'
                });
            }

            if (!this.validateApiKey(apiKey)) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid API key'
                });
            }

            next();
        };
    }

    /**
     * Get authentication statistics
     * @returns {object} Stats object
     */
    getStats() {
        return {
            type: 'api-key',
            mode: 'simple'
        };
    }
}

module.exports = AuthService;
