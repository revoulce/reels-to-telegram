const VideoQueue = require('../../src/queue/VideoQueue');

describe('VideoQueue', () => {
    let videoQueue;
    let mockWebSocketService;

    beforeEach(() => {
        // Mock WebSocket service
        mockWebSocketService = {
            broadcast: jest.fn(),
            sendToClient: jest.fn(),
            getStats: jest.fn().mockReturnValue({
                connectedClients: 0,
                messagesSent: 0
            })
        };

        videoQueue = new VideoQueue(mockWebSocketService);
    });

    afterEach(() => {
        videoQueue = null;
        mockWebSocketService = null;
    });

    describe('addJob', () => {
        it('should add a job to the queue', () => {
            const jobData = {
                videoUrl: 'https://instagram.com/reels/test',
                pageUrl: 'https://instagram.com/reels/test'
            };

            const result = videoQueue.addJob(jobData);

            expect(result).toBeDefined();
            expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(videoQueue.getQueueStats().queued).toBe(1);
        });

        it('should throw error when queue is full', () => {
            // Fill the queue
            for (let i = 0; i < 50; i++) {
                videoQueue.addJob({
                    videoUrl: `https://instagram.com/reels/test${i}`,
                    pageUrl: `https://instagram.com/reels/test${i}`
                });
            }

            expect(() => {
                videoQueue.addJob({
                    videoUrl: 'https://instagram.com/reels/test51',
                    pageUrl: 'https://instagram.com/reels/test51'
                });
            }).toThrow('Queue is full');
        });
    });

    describe('getQueueStats', () => {
        it('should return correct queue statistics', () => {
            const stats = videoQueue.getQueueStats();

            expect(stats).toHaveProperty('queued', 0);
            expect(stats).toHaveProperty('processing', 0);
            expect(stats).toHaveProperty('completed', 0);
            expect(stats).toHaveProperty('failed', 0);
            expect(stats).toHaveProperty('memoryUsage');
            expect(stats).toHaveProperty('uptime');
            expect(stats).toHaveProperty('webSocket');
            expect(stats).toHaveProperty('realTimeUpdates');
        });
    });

    describe('cancelJob', () => {
        it('should cancel a queued job', () => {
            const jobId = videoQueue.addJob({
                videoUrl: 'https://instagram.com/reels/test',
                pageUrl: 'https://instagram.com/reels/test'
            });

            const result = videoQueue.cancelJob(jobId);

            expect(result).toBe(true);
            expect(videoQueue.getQueueStats().queued).toBe(0);
        });

        it('should return error for non-existent job', () => {
            const result = videoQueue.cancelJob('non-existent-id');

            expect(result).toBe(false);
        });
    });
});
