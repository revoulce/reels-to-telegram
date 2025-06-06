const request = require('supertest');
const express = require('express');
const { createServer } = require('http');
const WebSocketService = require('../../src/services/WebSocketService');
const VideoService = require('../../src/services/VideoService');
const MonitoringService = require('../../src/services/MonitoringService');
const VideoQueue = require('../../src/queue/VideoQueue');
const config = require('../../src/config');
const { Console } = require('console');

// Мокаем Telegraf для тестов
jest.mock('telegraf', () => {
    return {
        Telegraf: jest.fn().mockImplementation(() => ({
            launch: jest.fn(),
            stop: jest.fn(),
            command: jest.fn(),
            on: jest.fn(),
            use: jest.fn(),
            telegram: {
                sendVideo: jest.fn(),
                setMyCommands: jest.fn()
            }
        }))
    };
});

process.env.TELEGRAM_BOT_TOKEN = 'test-token';

describe('API Integration Tests', () => {
    let app;
    let httpServer;
    let videoQueue;
    let monitoringService;
    let videoService;
    let webSocketService;

    beforeAll(() => {
        app = express();
        httpServer = createServer(app);

        // Initialize services
        webSocketService = new WebSocketService(httpServer);
        videoQueue = new VideoQueue(webSocketService);
        monitoringService = new MonitoringService(videoQueue);
        videoService = new VideoService(videoQueue);

        // Setup middleware
        app.use(express.json());

        // Authentication middleware
        app.use('/api', (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const token = authHeader.split(' ')[1];
            if (token !== config.API_KEY) {
                return res.status(401).json({ error: 'Invalid API key' });
            }
            next();
        });

        // Setup routes
        app.get('/api/queue/stats', (req, res) => {
            const stats = monitoringService.getQueueStats();
            res.json(stats);
        });

        app.get('/api/system/stats', (req, res) => {
            const stats = monitoringService.getSystemStats();
            res.json(stats);
        });

        app.post('/api/download-video', async (req, res) => {
            try {
                const result = await videoService.addVideo(req.body);
                res.json(result);
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });
    });

    afterAll(async () => {
        if (videoQueue) {
            await videoQueue.shutdown();
        }
        if (httpServer) {
            await new Promise(resolve => httpServer.close(resolve));
        }
    });

    describe('Queue Statistics', () => {
        it('should return queue statistics', async () => {
            const response = await request(app)
                .get('/api/queue/stats')
                .set('Authorization', `Bearer ${config.API_KEY}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('queued');
            expect(response.body).toHaveProperty('processing');
            expect(response.body).toHaveProperty('completed');
            expect(response.body).toHaveProperty('failed');
            expect(response.body).toHaveProperty('memoryUsage');
        });
    });

    describe('System Statistics', () => {
        it('should return system statistics', async () => {
            const response = await request(app)
                .get('/api/system/stats')
                .set('Authorization', `Bearer ${config.API_KEY}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('uptime');
            expect(response.body).toHaveProperty('memory');
            expect(response.body.memory).toHaveProperty('process');
            expect(response.body.memory.process).toHaveProperty('heapUsed');
            expect(response.body.memory.process).toHaveProperty('heapUsedFormatted');
            expect(response.body.memory.process).toHaveProperty('rss');
            expect(response.body.memory.process).toHaveProperty('rssFormatted');
        });
    });

    describe('Video Download', () => {
        it('should validate video data', async () => {
            const response = await request(app)
                .post('/api/download-video')
                .set('Authorization', `Bearer ${config.API_KEY}`)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
        });
    });
});
