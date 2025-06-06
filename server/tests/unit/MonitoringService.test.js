const MonitoringService = require('../../src/services/MonitoringService');

describe('MonitoringService', () => {
    let monitoringService;
    let mockVideoQueue;

    beforeEach(() => {
        // Mock VideoQueue
        mockVideoQueue = {
            getQueueStats: jest.fn().mockReturnValue({
                queued: 5,
                processing: 2,
                completed: 10,
                failed: 1,
                memoryUsage: 1024 * 1024 * 50 // 50MB
            })
        };

        monitoringService = new MonitoringService(mockVideoQueue);
    });

    afterEach(() => {
        monitoringService = null;
        mockVideoQueue = null;
    });

    describe('getSystemStats', () => {
        it('should return system statistics', () => {
            const stats = monitoringService.getSystemStats();

            expect(stats).toHaveProperty('memory');
            expect(stats).toHaveProperty('uptime');
            expect(stats).toHaveProperty('queue');
            expect(stats.memory).toHaveProperty('process');
            expect(stats.memory.process).toHaveProperty('heapUsed');
            expect(stats.memory.process).toHaveProperty('heapUsedFormatted');
            expect(stats.memory.process).toHaveProperty('rss');
            expect(stats.memory.process).toHaveProperty('rssFormatted');
        });
    });

    describe('getQueueStats', () => {
        it('should return queue statistics', () => {
            const stats = monitoringService.getQueueStats();

            expect(stats).toHaveProperty('queued', 5);
            expect(stats).toHaveProperty('processing', 2);
            expect(stats).toHaveProperty('completed', 10);
            expect(stats).toHaveProperty('failed', 1);
        });
    });

    describe('formatMemory', () => {
        it('should format bytes to human readable string', () => {
            expect(monitoringService.formatMemory(1024)).toBe('1 KB');
            expect(monitoringService.formatMemory(1024 * 1024)).toBe('1 MB');
            expect(monitoringService.formatMemory(1024 * 1024 * 1024)).toBe('1 GB');
        });

        it('should handle small values', () => {
            expect(monitoringService.formatMemory(500)).toBe('500 B');
        });

        it('should handle large values', () => {
            expect(monitoringService.formatMemory(1024 * 1024 * 1024 * 2)).toBe('2 GB');
        });
    });
});
