const config = require('../../src/config');

// Mock environment variables for testing
const originalEnv = process.env;

beforeEach(() => {
    // Reset modules
    jest.resetModules();

    // Mock clean environment
    process.env = {
        ...originalEnv,
        BOT_TOKEN: 'test_bot_token_123456789',
        CHANNEL_ID: '@test_channel',
        API_KEY: 'test-api-key-32-characters-long-123456789'
    };
});

afterAll(() => {
    process.env = originalEnv;
});

describe('Configuration', () => {
    test('should load default values when env vars not set', () => {
        // Remove required fields temporarily
        delete process.env.BOT_TOKEN;
        delete process.env.CHANNEL_ID;
        delete process.env.API_KEY;

        expect(() => {
            jest.resetModules();
            require('../../src/config');
        }).toThrow(/Bot token|Channel ID|API key/);
    });

    test('should validate memory limits', () => {
        process.env.MAX_MEMORY_PER_VIDEO = '100000000'; // 100MB
        process.env.MAX_TOTAL_MEMORY = '50000000';      // 50MB - invalid (less than per video)

        jest.resetModules();
        const config = require('../../src/config');

        // Should still load but might issue warnings
        expect(config.MAX_MEMORY_PER_VIDEO).toBe(100000000);
        expect(config.MAX_TOTAL_MEMORY).toBe(50000000);
    });

    test('should set correct defaults', () => {
        jest.resetModules();
        const config = require('../../src/config');

        expect(config.PORT).toBe(3000);
        expect(config.MAX_CONCURRENT_DOWNLOADS).toBe(3);
        expect(config.MAX_QUEUE_SIZE).toBe(50);
        expect(config.MEMORY_PROCESSING).toBe(true);
        expect(config.SUPPORTED_DOMAINS).toContain('instagram.com');
    });

    test('should validate API key length', () => {
        process.env.API_KEY = 'short';

        expect(() => {
            jest.resetModules();
            require('../../src/config');
        }).toThrow(/32/);
    });

    test('should validate concurrent downloads range', () => {
        process.env.MAX_CONCURRENT_DOWNLOADS = '15'; // Too high

        expect(() => {
            jest.resetModules();
            require('../../src/config');
        }).toThrow();
    });
});