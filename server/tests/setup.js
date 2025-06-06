// Set test environment
process.env.NODE_ENV = 'test';

// Mock environment variables
process.env.PORT = '3000';
process.env.API_KEY = 'test-api-key-32-characters-long-abc';
process.env.BOT_TOKEN = '7619092160:AAH-cQLtscaLN5JwLsWz4UmqWs9bdcR-2BE';
process.env.CHANNEL_ID = '@gyattrox';

// Increase timeout for all tests
jest.setTimeout(10000);

// Suppress console output during tests
global.console = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
};
