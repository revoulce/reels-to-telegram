const JobManager = require('../../src/queue/JobManager');

// Mock config
jest.mock('../../src/config', () => ({
    MAX_QUEUE_SIZE: 5,
    AUTO_CLEANUP_INTERVAL: 100 // Faster for testing
}));

describe('JobManager', () => {
    let jobManager;
    const mockVideoData = {
        pageUrl: 'https://www.instagram.com/reels/test123/',
        videoUrl: 'blob:test'
    };

    beforeEach(() => {
        jobManager = new JobManager();
    });

    afterEach(() => {
        // Clear all timers
        jest.clearAllTimers();
    });

    describe('addJob', () => {
        test('should add job to queue successfully', () => {
            const jobId = jobManager.addJob(mockVideoData);

            expect(jobId).toBeDefined();
            expect(jobManager.queue.size).toBe(1);

            const job = jobManager.queue.get(jobId);
            expect(job.videoData).toEqual(mockVideoData);
            expect(job.status).toBe('queued');
            expect(job.progress).toBe(0);
        });

        test('should throw error when queue is full', () => {
            // Fill queue to capacity
            for (let i = 0; i < 5; i++) {
                jobManager.addJob(mockVideoData);
            }

            expect(() => {
                jobManager.addJob(mockVideoData);
            }).toThrow(/Queue is full/);
        });

        test('should validate video data', () => {
            expect(() => {
                jobManager.addJob({ pageUrl: 'invalid-url' });
            }).toThrow(/Invalid Instagram URL/);

            expect(() => {
                jobManager.addJob({ pageUrl: 'https://youtube.com/watch' });
            }).toThrow(/Invalid Instagram URL/);
        });

        test('should include user info and timestamps', () => {
            const userInfo = { ip: '127.0.0.1', userAgent: 'test' };
            const jobId = jobManager.addJob(mockVideoData, userInfo);

            const job = jobManager.queue.get(jobId);
            expect(job.userInfo).toEqual(userInfo);
            expect(job.addedAt).toBeInstanceOf(Date);
        });
    });

    describe('getNextJob', () => {
        test('should return null when queue is empty', () => {
            const job = jobManager.getNextJob();
            expect(job).toBeNull();
        });

        test('should move job from queue to processing', () => {
            const jobId = jobManager.addJob(mockVideoData);

            const job = jobManager.getNextJob();
            expect(job.id).toBe(jobId);
            expect(job.status).toBe('processing');
            expect(job.startedAt).toBeInstanceOf(Date);

            expect(jobManager.queue.size).toBe(0);
            expect(jobManager.processing.size).toBe(1);
        });

        test('should process jobs in FIFO order', () => {
            const jobId1 = jobManager.addJob(mockVideoData);
            const jobId2 = jobManager.addJob(mockVideoData);

            const job1 = jobManager.getNextJob();
            const job2 = jobManager.getNextJob();

            expect(job1.id).toBe(jobId1);
            expect(job2.id).toBe(jobId2);
        });
    });

    describe('updateJobProgress', () => {
        test('should update progress for processing job', () => {
            const jobId = jobManager.addJob(mockVideoData);
            jobManager.getNextJob(); // Move to processing

            const mockEmit = jest.spyOn(jobManager, 'emit');

            jobManager.updateJobProgress(jobId, 50, 'Downloading...');

            const job = jobManager.processing.get(jobId);
            expect(job.progress).toBe(50);
            expect(job.progressMessage).toBe('Downloading...');
            expect(job.lastUpdated).toBeInstanceOf(Date);

            expect(mockEmit).toHaveBeenCalledWith('jobProgress', jobId, 50, 'Downloading...');
        });

        test('should ignore progress for non-existent job', () => {
            jobManager.updateJobProgress('non-existent', 50, 'test');
            // Should not throw
        });
    });

    describe('completeJob', () => {
        test('should move job from processing to completed', () => {
            const jobId = jobManager.addJob(mockVideoData);
            jobManager.getNextJob(); // Move to processing

            const result = { success: true, message: 'Done' };
            const mockEmit = jest.spyOn(jobManager, 'emit');

            jobManager.completeJob(jobId, result);

            expect(jobManager.processing.size).toBe(0);
            expect(jobManager.completed.size).toBe(1);
            expect(jobManager.totalProcessed).toBe(1);

            const completedJob = jobManager.completed.get(jobId);
            expect(completedJob.status).toBe('completed');
            expect(completedJob.result).toEqual(result);
            expect(completedJob.completedAt).toBeInstanceOf(Date);

            expect(mockEmit).toHaveBeenCalledWith('jobCompleted', jobId, result);
        });
    });

    describe('failJob', () => {
        test('should move job from processing to failed', () => {
            const jobId = jobManager.addJob(mockVideoData);
            jobManager.getNextJob(); // Move to processing

            const error = new Error('Test error');
            const mockEmit = jest.spyOn(jobManager, 'emit');

            jobManager.failJob(jobId, error);

            expect(jobManager.processing.size).toBe(0);
            expect(jobManager.failed.size).toBe(1);

            const failedJob = jobManager.failed.get(jobId);
            expect(failedJob.status).toBe('failed');
            expect(failedJob.error).toBe('Test error');
            expect(failedJob.failedAt).toBeInstanceOf(Date);

            expect(mockEmit).toHaveBeenCalledWith('jobFailed', jobId, error);
        });
    });

    describe('cancelJob', () => {
        test('should cancel job from queue', () => {
            const jobId = jobManager.addJob(mockVideoData);

            const cancelled = jobManager.cancelJob(jobId);

            expect(cancelled).toBe(true);
            expect(jobManager.queue.size).toBe(0);
        });

        test('should not cancel processing job', () => {
            const jobId = jobManager.addJob(mockVideoData);
            jobManager.getNextJob(); // Move to processing

            const cancelled = jobManager.cancelJob(jobId);

            expect(cancelled).toBe(false);
            expect(jobManager.processing.size).toBe(1);
        });
    });

    describe('getJobStatus', () => {
        test('should return correct status for each state', () => {
            const jobId = jobManager.addJob(mockVideoData);

            // Queued
            let status = jobManager.getJobStatus(jobId);
            expect(status.status).toBe('queued');

            // Processing
            jobManager.getNextJob();
            status = jobManager.getJobStatus(jobId);
            expect(status.status).toBe('processing');

            // Completed
            jobManager.completeJob(jobId, { success: true });
            status = jobManager.getJobStatus(jobId);
            expect(status.status).toBe('completed');
        });

        test('should return null for non-existent job', () => {
            const status = jobManager.getJobStatus('non-existent');
            expect(status).toBeNull();
        });
    });

    describe('getStats', () => {
        test('should return correct statistics', () => {
            // Add some jobs
            const jobId1 = jobManager.addJob(mockVideoData);
            const jobId2 = jobManager.addJob(mockVideoData);
            const jobId3 = jobManager.addJob(mockVideoData);

            // Process one
            jobManager.getNextJob();
            jobManager.completeJob(jobId1, { success: true });

            // Fail one
            jobManager.getNextJob();
            jobManager.failJob(jobId2, new Error('Test'));

            const stats = jobManager.getStats();

            expect(stats.queued).toBe(1);
            expect(stats.processing).toBe(0);
            expect(stats.completed).toBe(1);
            expect(stats.failed).toBe(1);
            expect(stats.totalProcessed).toBe(1);
            expect(stats.maxQueueSize).toBe(5);
            expect(stats.uptime).toBeGreaterThan(0);
            expect(stats.throughputPerMinute).toBeGreaterThanOrEqual(0);
        });
    });
});