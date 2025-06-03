const MemoryManager = require('../../src/queue/MemoryManager');

// Mock config
jest.mock('../../src/config', () => ({
    MAX_MEMORY_PER_VIDEO: 10 * 1024 * 1024, // 10MB
    MAX_TOTAL_MEMORY: 50 * 1024 * 1024,     // 50MB
    MEMORY_WARNING_THRESHOLD: 80,
    DEBUG_MEMORY: false,
    MEMORY_LOG_INTERVAL: 0 // Disable for tests
}));

describe('MemoryManager', () => {
    let memoryManager;

    beforeEach(() => {
        memoryManager = new MemoryManager();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    describe('validateAllocation', () => {
        test('should allow valid allocation', () => {
            expect(() => {
                memoryManager.validateAllocation(5 * 1024 * 1024); // 5MB
            }).not.toThrow();
        });

        test('should reject allocation exceeding per-video limit', () => {
            expect(() => {
                memoryManager.validateAllocation(15 * 1024 * 1024); // 15MB > 10MB limit
            }).toThrow(/Video too large/);
        });

        test('should reject allocation exceeding total memory limit', () => {
            // Allocate 45MB first
            memoryManager.allocate('job1', 45 * 1024 * 1024);

            expect(() => {
                memoryManager.validateAllocation(10 * 1024 * 1024); // Would exceed 50MB total
            }).toThrow(/Memory limit would be exceeded/);
        });

        test('should warn at high memory usage', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Allocate to 85% (42.5MB of 50MB)
            memoryManager.allocate('job1', 42.5 * 1024 * 1024);

            memoryManager.validateAllocation(1 * 1024 * 1024); // Should trigger warning

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/High memory usage/));

            consoleSpy.mockRestore();
        });

        test('should reject near-critical memory usage', () => {
            // Allocate to 96%
            memoryManager.allocate('job1', 48 * 1024 * 1024);

            expect(() => {
                memoryManager.validateAllocation(1 * 1024 * 1024);
            }).toThrow(/Memory nearly exhausted/);
        });
    });

    describe('allocate', () => {
        test('should allocate memory successfully', () => {
            const mockEmit = jest.spyOn(memoryManager, 'emit');

            memoryManager.allocate('job1', 5 * 1024 * 1024);

            expect(memoryManager.currentUsage).toBe(5 * 1024 * 1024);
            expect(memoryManager.peakUsage).toBe(5 * 1024 * 1024);
            expect(memoryManager.allocations.get('job1')).toBe(5 * 1024 * 1024);

            expect(mockEmit).toHaveBeenCalledWith('memoryAllocated', 'job1', 5 * 1024 * 1024, 5 * 1024 * 1024);
        });

        test('should track peak memory usage', () => {
            memoryManager.allocate('job1', 10 * 1024 * 1024);
            memoryManager.allocate('job2', 5 * 1024 * 1024);
            memoryManager.free('job1');
            memoryManager.allocate('job3', 3 * 1024 * 1024);

            expect(memoryManager.peakUsage).toBe(15 * 1024 * 1024); // Peak was job1 + job2
            expect(memoryManager.currentUsage).toBe(8 * 1024 * 1024); // job2 + job3
        });

        test('should validate before allocating', () => {
            expect(() => {
                memoryManager.allocate('job1', 15 * 1024 * 1024); // Exceeds per-video limit
            }).toThrow(/Video too large/);

            expect(memoryManager.currentUsage).toBe(0);
            expect(memoryManager.allocations.size).toBe(0);
        });
    });

    describe('free', () => {
        test('should free allocated memory', () => {
            const mockEmit = jest.spyOn(memoryManager, 'emit');

            memoryManager.allocate('job1', 10 * 1024 * 1024);
            memoryManager.free('job1');

            expect(memoryManager.currentUsage).toBe(0);
            expect(memoryManager.allocations.has('job1')).toBe(false);

            expect(mockEmit).toHaveBeenCalledWith('memoryFreed', 'job1', 10 * 1024 * 1024, 0);
        });

        test('should handle freeing non-existent allocation', () => {
            memoryManager.free('non-existent');
            // Should not throw or affect state
            expect(memoryManager.currentUsage).toBe(0);
        });

        test('should suggest garbage collection for large allocations', () => {
            const originalGc = global.gc;
            global.gc = jest.fn();

            // Allocate > 10MB
            memoryManager.allocate('job1', 15 * 1024 * 1024);
            memoryManager.free('job1');

            expect(global.gc).toHaveBeenCalled();

            global.gc = originalGc;
        });
    });

    describe('getStats', () => {
        test('should return correct statistics', () => {
            memoryManager.allocate('job1', 5 * 1024 * 1024);
            memoryManager.allocate('job2', 3 * 1024 * 1024);

            const stats = memoryManager.getStats();

            expect(stats.current).toBe(8 * 1024 * 1024);
            expect(stats.peak).toBe(8 * 1024 * 1024);
            expect(stats.max).toBe(50 * 1024 * 1024);
            expect(stats.utilization).toBe(16); // 8MB / 50MB = 16%
            expect(stats.activeAllocations).toBe(2);
            expect(stats.currentFormatted).toBe('8 MB');
            expect(stats.maxPerVideo).toBe(10 * 1024 * 1024);
        });
    });

    describe('getAllocation', () => {
        test('should return allocation size for existing job', () => {
            memoryManager.allocate('job1', 5 * 1024 * 1024);

            expect(memoryManager.getAllocation('job1')).toBe(5 * 1024 * 1024);
        });

        test('should return null for non-existent job', () => {
            expect(memoryManager.getAllocation('non-existent')).toBeNull();
        });
    });

    describe('cleanup', () => {
        test('should cleanup orphaned allocations', () => {
            const mockEmit = jest.spyOn(memoryManager, 'emit');

            memoryManager.allocate('job1', 5 * 1024 * 1024);
            memoryManager.allocate('job2', 3 * 1024 * 1024);
            memoryManager.allocate('job3', 2 * 1024 * 1024);

            // Only job2 is still active
            const activeJobIds = new Set(['job2']);

            memoryManager.cleanup(activeJobIds);

            expect(memoryManager.currentUsage).toBe(3 * 1024 * 1024); // Only job2
            expect(memoryManager.allocations.size).toBe(1);
            expect(memoryManager.allocations.has('job2')).toBe(true);

            expect(mockEmit).toHaveBeenCalledWith('memoryCleanup', 7 * 1024 * 1024); // job1 + job3
        });

        test('should not cleanup active allocations', () => {
            memoryManager.allocate('job1', 5 * 1024 * 1024);

            const activeJobIds = new Set(['job1']);
            memoryManager.cleanup(activeJobIds);

            expect(memoryManager.currentUsage).toBe(5 * 1024 * 1024);
            expect(memoryManager.allocations.has('job1')).toBe(true);
        });
    });
});