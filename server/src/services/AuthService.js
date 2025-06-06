const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

/**
 * JWT Authentication Service
 * Provides secure token-based authentication
 */
class AuthService {
    constructor() {
        this.jwtSecret = config.JWT_SECRET || config.API_KEY;
        this.apiKeySecret = config.API_KEY;
        this.tokenExpiry = config.JWT_EXPIRY || '24h';

        // Rate limiting for token requests (disabled in development)
        this.tokenRequests = new Map(); // IP -> { count, resetTime }
        this.maxTokenRequests = config.NODE_ENV === 'development' ? 1000 : 10; // Generous limit for dev
        this.tokenRequestWindow = config.NODE_ENV === 'development' ? 60 * 1000 : 60 * 60 * 1000; // 1 min for dev, 1 hour for prod

        console.log(`🔐 JWT Authentication service initialized (${config.NODE_ENV} mode)`);
        if (config.NODE_ENV === 'development') {
            console.log('🔧 Development mode: Token rate limiting relaxed');
        }
    }

    /**
     * Generate JWT token for authenticated user
     * @param {object} payload - User information
     * @param {object} options - Token options
     * @returns {string} JWT token
     */
    generateToken(payload, options = {}) {
        const tokenPayload = {
            sub: payload.userId || payload.id || 'anonymous',
            iat: Math.floor(Date.now() / 1000),
            jti: crypto.randomUUID(), // Unique token ID
            type: payload.type || 'api',
            permissions: payload.permissions || ['video:submit', 'queue:read'],
            ...payload
        };

        // Extended expiry for development
        const defaultExpiry = config.NODE_ENV === 'development' ? '7d' : this.tokenExpiry;

        const tokenOptions = {
            expiresIn: options.expiresIn || defaultExpiry,
            issuer: 'reels-to-telegram',
            audience: 'reels-client',
            ...options
        };

        return jwt.sign(tokenPayload, this.jwtSecret, tokenOptions);
    }

    /**
     * Verify and decode JWT token
     * @param {string} token - JWT token
     * @returns {object} Decoded payload
     * @throws {Error} If token is invalid
     */
    verifyToken(token) {
        try {
            const options = {
                issuer: 'reels-to-telegram',
                audience: 'reels-client'
            };

            const decoded = jwt.verify(token, this.jwtSecret, options);

            // Additional validation
            this.validateTokenPayload(decoded);

            return decoded;
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new Error('Token has expired');
            } else if (error instanceof jwt.JsonWebTokenError) {
                throw new Error('Invalid token');
            } else {
                throw error;
            }
        }
    }

    /**
     * Validate token payload structure
     * @param {object} payload - Decoded token payload
     * @throws {Error} If payload is invalid
     */
    validateTokenPayload(payload) {
        if (!payload.sub) {
            throw new Error('Token missing subject');
        }

        if (!payload.type) {
            throw new Error('Token missing type');
        }

        if (!Array.isArray(payload.permissions)) {
            throw new Error('Token missing permissions');
        }

        // Check if token is blacklisted (future enhancement)
        if (payload.jti && this.isTokenBlacklisted(payload.jti)) {
            throw new Error('Token has been revoked');
        }
    }

    /**
     * Create authentication token from API key
     * @param {string} apiKey - API key
     * @param {string} clientIp - Client IP address
     * @returns {string} JWT token
     * @throws {Error} If API key is invalid or rate limited
     */
    authenticateWithApiKey(apiKey, clientIp) {
        // Skip rate limiting in development
        if (config.NODE_ENV !== 'development') {
            this.checkTokenRequestRate(clientIp);
        }

        // Validate API key
        if (!apiKey || apiKey !== this.apiKeySecret) {
            throw new Error('Invalid API key');
        }

        // Generate JWT token for API key authentication
        const payload = {
            userId: `api-${this.hashApiKey(apiKey)}`,
            type: 'api-key',
            permissions: ['video:submit', 'queue:read', 'queue:write', 'stats:read'],
            apiKeyHash: this.hashApiKey(apiKey),
            clientIp
        };

        // Extended expiry for development
        const expiry = config.NODE_ENV === 'development' ? '7d' : '1h';

        return this.generateToken(payload, { expiresIn: expiry });
    }

    /**
     * Check if request is rate limited for token generation
     * @param {string} clientIp - Client IP address
     * @throws {Error} If rate limited
     */
    checkTokenRequestRate(clientIp) {
        const now = Date.now();
        const record = this.tokenRequests.get(clientIp);

        if (!record || now > record.resetTime) {
            this.tokenRequests.set(clientIp, {
                count: 1,
                resetTime: now + this.tokenRequestWindow
            });
            return;
        }

        if (record.count >= this.maxTokenRequests) {
            const resetIn = Math.ceil((record.resetTime - now) / 1000);
            throw new Error(`Too many token requests. Try again in ${resetIn} seconds.`);
        }

        record.count++;
    }

    /**
     * Hash API key for logging and identification
     * @param {string} apiKey - API key
     * @returns {string} Hashed key
     */
    hashApiKey(apiKey) {
        return crypto.createHash('sha256')
            .update(apiKey)
            .digest('hex')
            .substring(0, 8); // First 8 characters for identification
    }

    /**
     * Check if token has required permission
     * @param {object} tokenPayload - Decoded token payload
     * @param {string} permission - Required permission
     * @returns {boolean}
     */
    hasPermission(tokenPayload, permission) {
        if (!tokenPayload.permissions) return false;
        return tokenPayload.permissions.includes(permission) ||
            tokenPayload.permissions.includes('*');
    }

    /**
     * Refresh token (create new token with extended expiry)
     * @param {string} token - Current token
     * @returns {string} New token
     */
    refreshToken(token) {
        const decoded = this.verifyToken(token);

        // Don't refresh if token is too old or expired soon (skip in development)
        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = decoded.exp - now;

        if (config.NODE_ENV !== 'development' && timeUntilExpiry > 30 * 60) { // More than 30 minutes left
            throw new Error('Token does not need refresh yet');
        }

        // Create new token with same payload but new expiry
        const newPayload = {
            ...decoded,
            iat: now,
            jti: crypto.randomUUID() // New token ID
        };

        delete newPayload.exp; // Let generateToken set new expiry

        return this.generateToken(newPayload);
    }

    /**
     * Revoke token (add to blacklist)
     * @param {string} tokenId - Token JTI
     */
    revokeToken(tokenId) {
        // In production, this would be stored in Redis or database
        // For now, we'll implement a simple in-memory blacklist
        if (!this.blacklistedTokens) {
            this.blacklistedTokens = new Set();
        }

        this.blacklistedTokens.add(tokenId);

        // Cleanup old blacklisted tokens after 24 hours
        setTimeout(() => {
            this.blacklistedTokens.delete(tokenId);
        }, 24 * 60 * 60 * 1000);
    }

    /**
     * Check if token is blacklisted
     * @param {string} tokenId - Token JTI
     * @returns {boolean}
     */
    isTokenBlacklisted(tokenId) {
        return this.blacklistedTokens && this.blacklistedTokens.has(tokenId);
    }

    /**
     * Extract token from request headers
     * @param {object} req - Express request object
     * @returns {string|null} Token or null
     */
    extractToken(req) {
        // Check Authorization header (Bearer token)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Check X-API-Key header (for backward compatibility)
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            try {
                return this.authenticateWithApiKey(apiKey, req.ip);
            } catch (error) {
                return null;
            }
        }

        // Check query parameter (not recommended for production)
        if (req.query.token) {
            return req.query.token;
        }

        return null;
    }

    /**
     * Create middleware for JWT authentication
     * @param {object} options - Middleware options
     * @returns {function} Express middleware
     */
    createAuthMiddleware(options = {}) {
        const {
            requiredPermissions = [],
            optional = false
        } = options;

        return (req, res, next) => {
            try {
                const token = this.extractToken(req);

                if (!token) {
                    if (optional) {
                        req.user = null;
                        return next();
                    }
                    return res.status(401).json({
                        success: false,
                        error: 'Authentication token required'
                    });
                }

                // Verify token
                const decoded = this.verifyToken(token);

                // Check permissions
                if (requiredPermissions.length > 0) {
                    const hasRequiredPerms = requiredPermissions.every(perm =>
                        this.hasPermission(decoded, perm)
                    );

                    if (!hasRequiredPerms) {
                        return res.status(403).json({
                            success: false,
                            error: 'Insufficient permissions',
                            required: requiredPermissions,
                            granted: decoded.permissions
                        });
                    }
                }

                // Add user info to request
                req.user = {
                    id: decoded.sub,
                    type: decoded.type,
                    permissions: decoded.permissions,
                    tokenId: decoded.jti,
                    isApiKey: decoded.type === 'api-key'
                };

                next();
            } catch (error) {
                if (optional) {
                    req.user = null;
                    return next();
                }

                return res.status(401).json({
                    success: false,
                    error: error.message
                });
            }
        };
    }

    /**
     * Get authentication statistics
     * @returns {object}
     */
    getStats() {
        return {
            mode: config.NODE_ENV,
            tokenRequestsTracked: this.tokenRequests.size,
            blacklistedTokens: this.blacklistedTokens ? this.blacklistedTokens.size : 0,
            maxTokenRequests: this.maxTokenRequests,
            tokenRequestWindow: this.tokenRequestWindow / 1000 / 60, // in minutes
            jwtExpiry: this.tokenExpiry,
            developmentMode: config.NODE_ENV === 'development'
        };
    }

    /**
     * Cleanup expired rate limit records
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [ip, record] of this.tokenRequests.entries()) {
            if (now > record.resetTime) {
                this.tokenRequests.delete(ip);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Auth service cleaned ${cleaned} expired rate limit records`);
        }
    }
}

module.exports = AuthService;