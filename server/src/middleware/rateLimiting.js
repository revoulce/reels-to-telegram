const config = require('../config');

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-based rate limiter
 */
class RateLimiter {
    constructor(windowMs = 15 * 60 * 1000, maxRequests = 100) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        this.requests = new Map(); // IP -> { count, resetTime }

        // Cleanup old entries every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Check if request should be rate limited
     * @param {string} identifier - Usually IP address
     * @returns {object} { allowed: boolean, remaining: number, resetTime: number }
     */
    checkLimit(identifier) {
        const now = Date.now();
        const record = this.requests.get(identifier);

        // No previous requests or window expired
        if (!record || now > record.resetTime) {
            this.requests.set(identifier, {
                count: 1,
                resetTime: now + this.windowMs
            });

            return {
                allowed: true,
                remaining: this.maxRequests - 1,
                resetTime: now + this.windowMs
            };
        }

        // Within window
        if (record.count >= this.maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetTime: record.resetTime
            };
        }

        // Increment counter
        record.count++;

        return {
            allowed: true,
            remaining: this.maxRequests - record.count,
            resetTime: record.resetTime
        };
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [identifier, record] of this.requests.entries()) {
            if (now > record.resetTime) {
                this.requests.delete(identifier);
                cleaned++;
            }
        }

        if (cleaned > 0 && config.DEBUG_MEMORY) {
            console.log(`🧹 Rate limiter cleaned ${cleaned} expired entries`);
        }
    }

    /**
     * Get current stats for monitoring
     */
    getStats() {
        const now = Date.now();
        let active = 0;
        let totalRequests = 0;

        for (const record of this.requests.values()) {
            if (now <= record.resetTime) {
                active++;
                totalRequests += record.count;
            }
        }

        return {
            activeClients: active,
            totalRequests,
            windowMs: this.windowMs,
            maxRequests: this.maxRequests
        };
    }
}

// Create rate limiter instances
const generalLimiter = new RateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 minutes
const apiLimiter = new RateLimiter(60 * 1000, 30);           // 30 API calls per minute
const downloadLimiter = new RateLimiter(60 * 1000, 5);       // 5 downloads per minute

/**
 * General rate limiting middleware
 */
function generalRateLimit(req, res, next) {
    const identifier = req.ip;
    const result = generalLimiter.checkLimit(identifier);

    // Add rate limit headers
    res.set({
        'X-RateLimit-Limit': generalLimiter.maxRequests,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000)
    });

    if (!result.allowed) {
        return res.status(429).json({
            success: false,
            error: 'Too many requests',
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        });
    }

    next();
}

/**
 * API rate limiting middleware
 */
function apiRateLimit(req, res, next) {
    const identifier = req.ip;
    const result = apiLimiter.checkLimit(identifier);

    res.set({
        'X-RateLimit-Limit': apiLimiter.maxRequests,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000)
    });

    if (!result.allowed) {
        return res.status(429).json({
            success: false,
            error: 'API rate limit exceeded',
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        });
    }

    next();
}

/**
 * Download rate limiting middleware (most restrictive)
 */
function downloadRateLimit(req, res, next) {
    const identifier = req.ip;
    const result = downloadLimiter.checkLimit(identifier);

    res.set({
        'X-RateLimit-Limit': downloadLimiter.maxRequests,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000)
    });

    if (!result.allowed) {
        return res.status(429).json({
            success: false,
            error: 'Download rate limit exceeded. Please wait before submitting more videos.',
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        });
    }

    next();
}

/**
 * Get combined rate limiter statistics
 */
function getRateLimitStats() {
    return {
        general: generalLimiter.getStats(),
        api: apiLimiter.getStats(),
        download: downloadLimiter.getStats()
    };
}

module.exports = {
    generalRateLimit,
    apiRateLimit,
    downloadRateLimit,
    getRateLimitStats,
    RateLimiter
};