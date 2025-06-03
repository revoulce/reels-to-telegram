const request = require('supertest');
const express = require('express');

// Mock dependencies
jest.mock('../../src/config', () => ({
    PORT: 3001,
    BOT_TOKEN: '7619092160:AAF9a62e--G4o5XKoEr3UMAWFzRNTNtsfnI',
    CHANNEL_ID: '@gyattrox',
    API_KEY: 'test-api-key-32-characters-long-abc',
    MAX_MEMORY_PER_VIDEO: 10 * 1024 * 1024,
    MAX_TOTAL_MEMORY: 50 * 1024 * 1024,
    MAX_CONCURRENT_DOWNLOADS: 2,
    MAX_QUEUE_SIZE: 5,
    MEMORY_PROCESSING: true,
    AUTO_MEMORY_CLEANUP: true,
    DEBUG_MEMORY: false,
    MEMORY_LOG_INTERVAL: 0,
    SUPPORTED_DOMAINS: ['instagram.com', 'www.instagram.com']
}));

// Mock yt-dlp for integration tests
jest.mock('child_process', () => ({
    spawn: jest.fn(),
    exec: jest.fn()
}));

const VideoQueue = require('../../src/queue/VideoQueue');
const VideoController = require('../../src/controllers/VideoController');
const StatsController = require('../../src/controllers/StatsController');
const { authenticateApiKey } = require('../../src/middleware/auth');
const { requestLogger, errorLogger } = require('../../src/middleware/logging');

describe('API Integration Tests', () => {
    let app;
    let videoQueue;
    let videoController;
    let statsController;

    beforeAll(async () => {
        // Create Express app for testing
        app = express();
        app.use(express.json());
        app.use(requestLogger);

        // Initialize components
        videoQueue = new VideoQueue();
        videoController = new VideoController(videoQueue);
        statsController = new StatsController(videoQueue);

        // Setup routes
        app.get('/health', (req, res) => statsController.getHealth(req, res));
        app.get('/api/health', (req, res) => statsController.getApiHealth(req, res));

        // Authenticated routes
        const apiRouter = express.Router();
        apiRouter.use(authenticateApiKey);

        apiRouter.post('/download-video', (req, res) => videoController.downloadVideo(req, res));
        apiRouter.get('/job/:jobId', (req, res) => videoController.getJobStatus(req, res));
        apiRouter.delete('/job/:jobId', (req, res) => videoController.cancelJob(req, res));
        apiRouter.get('/queue/stats', (req, res) => statsController.getQueueStats(req, res));
        apiRouter.get('/queue/jobs', (req, res) => statsController.getQueueJobs(req, res));
        apiRouter.get('/stats', (req, res) => statsController.getStats(req, res));

        app.use('/api', apiRouter);
        app.use(errorLogger);
    });

    describe('Health Endpoints', () => {
        test('GET /health should return server status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'OK',
                version: '3.0.0-memory',
                features: {
                    memoryProcessing: true,
                    zeroDiskUsage: true,
                    autoCleanup: true,
                    concurrentProcessing: true
                }
            });

            expect(response.body.memory).toBeDefined();
            expect(response.body.queue).toBeDefined();
            expect(response.body.timestamp).toBeDefined();
        });

        test('GET /api/health should return API status', async () => {
            const response = await request(app)
                .get('/api/health')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'OK',
                version: '3.0.0-memory',
                features: expect.arrayContaining(['memory-processing', 'zero-disk-usage'])
            });
        });
    });

    describe('Authentication', () => {
        test('should reject requests without API key', async () => {
            await request(app)
                .get('/api/queue/stats')
                .expect(401)
                .expect((res) => {
                    expect(res.body.error).toMatch(/API key required/);
                });
        });

        test('should reject requests with invalid API key', async () => {
            await request(app)
                .get('/api/queue/stats')
                .set('X-API-Key', 'invalid-key')
                .expect(401)
                .expect((res) => {
                    expect(res.body.error).toMatch(/Invalid API key/);
                });
        });

        test('should accept requests with valid API key', async () => {
            await request(app)
                .get('/api/queue/stats')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .expect(200);
        });
    });

    describe('Video Processing Endpoints', () => {
        const validVideoData = {
            pageUrl: 'https://www.instagram.com/reels/test123/',
            videoUrl: 'blob:test',
            timestamp: new Date().toISOString()
        };

        test('POST /api/download-video should add job to queue', async () => {
            const response = await request(app)
                .post('/api/download-video')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .send(validVideoData)
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                jobId: expect.any(String),
                message: expect.stringContaining('queue'),
                queuePosition: expect.any(Number),
                estimatedWaitTime: expect.any(Number),
                processing: {
                    mode: 'memory',
                    zeroDiskUsage: true
                }
            });

            // Store jobId for next tests
            this.testJobId = response.body.jobId;
        });

        test('POST /api/download-video should validate input', async () => {
            // Missing pageUrl
            await request(app)
                .post('/api/download-video')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .send({ videoUrl: 'blob:test' })
                .expect(400)
                .expect((res) => {
                    expect(res.body.error).toMatch(/pageUrl is required/);
                });

            // Invalid Instagram URL
            await request(app)
                .post('/api/download-video')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .send({ pageUrl: 'https://youtube.com/watch?v=test' })
                .expect(400)
                .expect((res) => {
                    expect(res.body.error).toMatch(/Invalid Instagram URL/);
                });
        });

        test('GET /api/job/:jobId should return job status', async () => {
            // First add a job
            const addResponse = await request(app)
                .post('/api/download-video')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .send(validVideoData)
                .expect(200);

            const jobId = addResponse.body.jobId;

            // Then get its status
            const response = await request(app)
                .get(`/api/job/${jobId}`)
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .expect(200);

            expect(response.body).toMatchObject({
                jobId,
                status: expect.stringMatching(/queued|processing/),
                progress: expect.any(Number),
                addedAt: expect.any(String),
                processing: {
                    mode: 'memory'
                }
            });
        });

        test('GET /api/job/:jobId should return 404 for non-existent job', async () => {
            await request(app)
                .get('/api/job/non-existent-job-id')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .expect(404)
                .expect((res) => {
                    expect(res.body.error).toMatch(/Job not found/);
                });
        });

        test('DELETE /api/job/:jobId should cancel queued job', async () => {
            // Add a job
            const addResponse = await request(app)
                .post('/api/download-video')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .send(validVideoData)
                .expect(200);

            const jobId = addResponse.body.jobId;

            // Cancel it immediately (should still be queued)
            const response = await request(app)
                .delete(`/api/job/${jobId}`)
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                message: expect.stringContaining('cancelled')
            });
        });
    });

    describe('Statistics Endpoints', () => {
        test('GET /api/queue/stats should return queue statistics', async () => {
            const response = await request(app)
                .get('/api/queue/stats')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .expect(200);

            expect(response.body).toMatchObject({
                queued: expect.any(Number),
                processing: expect.any(Number),
                completed: expect.any(Number),
                failed: expect.any(Number),
                totalProcessed: expect.any(Number),
                activeWorkers: expect.any(Number),
                maxWorkers: expect.any(Number),
                maxQueueSize: expect.any(Number),
                memoryUsage: expect.any(Number),
                memoryUsageFormatted: expect.any(String),
                config: {
                    maxConcurrentDownloads: expect.any(Number),
                    maxQueueSize: expect.any(Number),
                    memoryProcessing: true
                }
            });
        });

        test('GET /api/queue/jobs should return paginated job list', async () => {
            const response = await request(app)
                .get('/api/queue/jobs?limit=10&offset=0')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .expect(200);

            expect(response.body).toMatchObject({
                jobs: expect.any(Array),
                pagination: {
                    total: expect.any(Number),
                    limit: 10,
                    offset: 0,
                    hasMore: expect.any(Boolean)
                }
            });
        });

        test('GET /api/stats should return comprehensive statistics', async () => {
            const response = await request(app)
                .get('/api/stats')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .expect(200);

            expect(response.body).toMatchObject({
                uptime: expect.any(Number),
                totalProcessed: expect.any(Number),
                throughputPerMinute: expect.any(Number),
                memory: {
                    process: expect.any(Object),
                    queue: expect.any(Object)
                },
                queue: expect.any(Object),
                config: {
                    version: '3.0.0-memory',
                    memoryProcessing: true
                }
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed JSON', async () => {
            await request(app)
                .post('/api/download-video')
                .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                .set('Content-Type', 'application/json')
                .send('invalid json')
                .expect(400);
        });

        test('should handle queue full scenario', async () => {
            // Fill the queue (max 5 jobs)
            const promises = Array.from({ length: 6 }, () =>
                request(app)
                    .post('/api/download-video')
                    .set('X-API-Key', 'test-api-key-32-characters-long-abc')
                    .send({
                        pageUrl: 'https://www.instagram.com/reels/test123/',
                        videoUrl: 'blob:test'
                    })
            );

            const responses = await Promise.all(promises);

            // Some should succeed, last one should fail
            const failedResponses = responses.filter(r => r.status === 503);
            expect(failedResponses.length).toBeGreaterThan(0);

            const lastFailure = failedResponses[failedResponses.length - 1];
            expect(lastFailure.body.error).toMatch(/Queue is full/);
        });
    });
});