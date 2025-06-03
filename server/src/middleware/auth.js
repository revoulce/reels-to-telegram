const config = require('../config');

/**
 * API Key authentication middleware
 * @param {object} req
 * @param {object} res
 * @param {function} next
 */
function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API key required in X-API-Key header'
        });
    }

    if (apiKey !== config.API_KEY) {
        return res.status(401).json({
            success: false,
            error: 'Invalid API key'
        });
    }

    next();
}

module.exports = {
    authenticateApiKey
};