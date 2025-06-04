/**
 * Request logging middleware
 * @param {object} req
 * @param {object} res
 * @param {function} next
 */
function requestLogger(req, res, next) {
    const start = Date.now();

    // Store original end function
    const originalEnd = res.end;

    // Override end function to log response time
    res.end = function(...args) {
        const duration = Date.now() - start;
        const statusCode = res.statusCode;

        console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${statusCode} - ${duration}ms - ${req.ip}`);

        // Call original end function
        originalEnd.apply(this, args);
    };

    next();
}

/**
 * Error logging middleware
 * @param {Error} error
 * @param {object} req
 * @param {object} res
 * @param {function} next
 */
function errorLogger(error, req, res,) {
    console.error(`${new Date().toISOString()} - ERROR ${req.method} ${req.originalUrl}:`, error.message);
    console.error('Stack:', error.stack);

    const statusCode = error.statusCode || 500;
    const isDev = process.env.NODE_ENV === 'development';

    res.status(statusCode).json({
        success: false,
        error: error.message || 'Internal server error',
        ...(isDev && { stack: error.stack })
    });
}

module.exports = {
    requestLogger,
    errorLogger
};