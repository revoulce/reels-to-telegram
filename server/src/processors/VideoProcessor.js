const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const config = require('../config');
const { cleanText, formatNumber } = require('../utils/validation');
const { formatMemory } = require('../utils/memory');

const execAsync = promisify(exec);

/**
 * Video Processor - handles video download and metadata extraction
 */
class VideoProcessor {
    constructor(memoryManager) {
        this.memoryManager = memoryManager;
    }

    /**
     * Process video from URL to memory buffer
     * @param {string} pageUrl
     * @param {string} jobId
     * @param {function} progressCallback
     * @returns {Promise<{buffer: Buffer, metadata: object}>}
     */
    async processVideo(pageUrl, jobId, progressCallback) {
        let allocatedMemory = 0;

        try {
            // Step 1: Extract metadata (10%)
            progressCallback(10, 'Extracting video metadata...');
            const metadata = await this.extractMetadata(pageUrl);

            // Step 2: Download video to memory (10% -> 70%)
            progressCallback(30, 'Downloading video to memory...');
            const downloadResult = await this.downloadVideoToMemory(pageUrl, jobId, progressCallback);

            allocatedMemory = downloadResult.size;
            this.memoryManager.allocate(jobId, allocatedMemory);

            return {
                buffer: downloadResult.buffer,
                metadata,
                size: allocatedMemory
            };

        } catch (error) {
            // Free memory on error
            if (allocatedMemory > 0) {
                this.memoryManager.free(jobId);
            }
            throw error;
        }
    }

    /**
     * Download video directly to memory using yt-dlp streaming
     * @param {string} pageUrl
     * @param {string} jobId
     * @param {function} progressCallback
     * @returns {Promise<{buffer: Buffer, size: number}>}
     */
    async downloadVideoToMemory(pageUrl, jobId, progressCallback) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                ytDlpProcess.kill('SIGKILL');
                reject(new Error('Download timeout exceeded'));
            }, config.DOWNLOAD_TIMEOUT);

            const ytDlpArgs = [
                '--cookies', 'cookies.txt',
                '--format', 'best[ext=mp4]/best',
                '--output', '-', // Stream to stdout
                '--no-playlist',
                '--max-filesize', config.MAX_FILE_SIZE.toString(),
                '--quiet',
                pageUrl
            ];

            const ytDlpProcess = spawn('yt-dlp', ytDlpArgs, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            const chunks = [];
            let totalSize = 0;
            let lastProgressUpdate = 0;

            ytDlpProcess.stdout.on('data', (chunk) => {
                chunks.push(chunk);
                totalSize += chunk.length;

                // Memory validation during download
                try {
                    this.memoryManager.validateAllocation(totalSize);
                } catch (error) {
                    ytDlpProcess.kill('SIGKILL');
                    reject(error);
                    return;
                }

                // Progress updates (throttled to every second)
                const now = Date.now();
                if (now - lastProgressUpdate > 1000) {
                    const progress = Math.min(30 + (totalSize / config.MAX_MEMORY_PER_VIDEO) * 40, 70);
                    progressCallback(Math.round(progress), `Downloaded ${formatMemory(totalSize)}...`);
                    lastProgressUpdate = now;
                }
            });

            ytDlpProcess.stderr.on('data', (data) => {
                if (config.DEBUG_MEMORY) {
                    console.log(`yt-dlp stderr [${jobId.substring(0, 8)}]:`, data.toString().trim());
                }
            });

            ytDlpProcess.on('close', (code) => {
                clearTimeout(timeout);

                if (code === 0 && chunks.length > 0) {
                    const videoBuffer = Buffer.concat(chunks);
                    console.log(`✅ Download completed: ${formatMemory(videoBuffer.length)} in memory`);
                    resolve({ buffer: videoBuffer, size: videoBuffer.length });
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}`));
                }
            });

            ytDlpProcess.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`yt-dlp process error: ${error.message}`));
            });
        });
    }

    /**
     * Extract video metadata using yt-dlp
     * @param {string} pageUrl
     * @returns {Promise<object>}
     */
    async extractMetadata(pageUrl) {
        try {
            const command = `yt-dlp --cookies "cookies.txt" --dump-json --no-download --quiet "${pageUrl}"`;
            const { stdout } = await execAsync(command, {
                timeout: 30000,
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            const metadata = JSON.parse(stdout);

            return {
                title: cleanText(metadata.title || metadata.description || ''),
                author: cleanText(metadata.uploader || metadata.channel || ''),
                duration: metadata.duration || 0,
                view_count: metadata.view_count || 0,
                like_count: metadata.like_count || 0,
                upload_date: metadata.upload_date || null,
                thumbnail: metadata.thumbnail || null
            };

        } catch (error) {
            console.warn(`⚠️ Metadata extraction failed: ${error.message}`);

            // Return default metadata on failure
            return {
                title: '',
                author: '',
                duration: 0,
                view_count: 0,
                like_count: 0,
                upload_date: null,
                thumbnail: null
            };
        }
    }

    /**
     * Create Telegram caption from metadata
     * @param {object} metadata
     * @param {string} pageUrl
     * @returns {string}
     */
    createCaption(metadata, pageUrl) {
        let caption = '';

        if (metadata.title) {
            caption += `🎬 ${metadata.title}\n\n`;
        }

        if (metadata.author) {
            caption += `👤 ${metadata.author}\n`;
        }

        if (metadata.view_count > 0) {
            caption += `👁 ${formatNumber(metadata.view_count)} просмотров\n`;
        }

        if (metadata.like_count > 0) {
            caption += `❤️ ${formatNumber(metadata.like_count)} лайков\n`;
        }

        if (metadata.duration > 0) {
            const minutes = Math.floor(metadata.duration / 60);
            const seconds = metadata.duration % 60;
            caption += `⏱ ${minutes}:${seconds.toString().padStart(2, '0')}\n`;
        }

        caption += `\n🔗 ${pageUrl}`;
        caption += `\n💾 Processed in memory (zero disk usage)`;

        return caption.substring(0, 1024); // Telegram limit
    }

    /**
     * Clean up resources for a job
     * @param {string} jobId
     */
    cleanup(jobId) {
        this.memoryManager.free(jobId);
    }
}

module.exports = VideoProcessor;