#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');

const execAsync = promisify(exec);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

console.log('🚀 Reels to Telegram Server Setup v3.0 (Memory Edition)\n');

async function checkDependencies() {
    console.log('📋 Checking dependencies...\n');

    try {
        // Check Node.js version
        const nodeVersion = process.version;
        console.log(`✅ Node.js: ${nodeVersion}`);

        // Check yt-dlp
        try {
            const { stdout } = await execAsync('yt-dlp --version');
            console.log(`✅ yt-dlp: ${stdout.trim()}`);
        } catch (error) {
            console.log('❌ yt-dlp not found');
            console.log('💡 Install with: pip install yt-dlp');
            console.log('   or: brew install yt-dlp (macOS)');
            console.log('   or: sudo apt install yt-dlp (Ubuntu/Debian)\n');
        }

        // Check Python (for yt-dlp)
        try {
            const { stdout } = await execAsync('python3 --version');
            console.log(`✅ Python: ${stdout.trim()}`);
        } catch (error) {
            try {
                const { stdout } = await execAsync('python --version');
                console.log(`✅ Python: ${stdout.trim()}`);
            } catch (error2) {
                console.log('⚠️  Python not found (required for yt-dlp)');
            }
        }

        // Check available RAM
        try {
            const totalMem = require('os').totalmem();
            const freeMem = require('os').freemem();
            console.log(`💾 System RAM: ${formatMemory(totalMem)} total, ${formatMemory(freeMem)} free`);

            if (freeMem < 512 * 1024 * 1024) { // Less than 512MB free
                console.log('⚠️  Warning: Low available memory. Consider reducing concurrent downloads.');
            }
        } catch (error) {
            console.log('⚠️  Could not check system memory');
        }

    } catch (error) {
        console.error('Error checking dependencies:', error.message);
    }

    console.log('');
}

function formatMemory(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function configureMemorySettings() {
    console.log('💾 Настройка параметров памяти...\n');

    // Memory per video
    const memoryPerVideoInput = await question('📹 Максимум памяти на одно видео (MB, default: 50): ') || '50';
    const memoryPerVideo = parseInt(memoryPerVideoInput) * 1024 * 1024;

    // Concurrent downloads
    const concurrentInput = await question('🔄 Максимум одновременных загрузок (default: 3): ') || '3';
    const concurrent = parseInt(concurrentInput);

    // Calculate recommended total memory
    const recommendedTotal = memoryPerVideo * concurrent * 1.5; // 50% buffer
    const recommendedTotalMB = Math.ceil(recommendedTotal / 1024 / 1024);

    console.log(`\n💡 Рекомендуемая общая память: ${recommendedTotalMB}MB (${memoryPerVideoInput}MB × ${concurrent} × 1.5)`);

    const totalMemoryInput = await question(`📊 Общий лимит памяти (MB, default: ${recommendedTotalMB}): `) || recommendedTotalMB.toString();
    const totalMemory = parseInt(totalMemoryInput) * 1024 * 1024;

    // Validation
    if (totalMemory < memoryPerVideo * concurrent) {
        console.log('⚠️  Предупреждение: общий лимит памяти меньше чем нужно для всех воркеров');
        const shouldContinue = await question('   Продолжить? (y/N): ');
        if (shouldContinue.toLowerCase() !== 'y') {
            console.log('❌ Настройка отменена');
            process.exit(1);
        }
    }

    return {
        memoryPerVideo,
        totalMemory,
        concurrent
    };
}

async function createEnvFile() {
    console.log('⚙️  Setting up environment configuration...\n');

    if (fs.existsSync('.env')) {
        const overwrite = await question('📄 .env file already exists. Overwrite? (y/N): ');
        if (overwrite.toLowerCase() !== 'y') {
            console.log('✅ Keeping existing .env file');
            return;
        }
    }

    console.log('📝 Please provide the following information:\n');

    // Port
    const port = await question('🌐 Server port (default: 3000): ') || '3000';

    // Bot token
    const botToken = await question('🤖 Telegram bot token: ');
    if (!botToken) {
        console.log('❌ Bot token is required!');
        console.log('💡 Create a bot: https://t.me/botfather');
        process.exit(1);
    }

    // Channel ID
    const channelId = await question('📢 Telegram channel ID (e.g., @mychannel): ');
    if (!channelId) {
        console.log('❌ Channel ID is required!');
        process.exit(1);
    }

    // API key
    const useGeneratedKey = await question('🔑 Generate random API key? (Y/n): ');
    let apiKey;

    if (useGeneratedKey.toLowerCase() === 'n') {
        apiKey = await question('🔑 Enter your API key (min 32 chars): ');
        if (apiKey.length < 32) {
            console.log('❌ API key must be at least 32 characters');
            process.exit(1);
        }
    } else {
        apiKey = generateApiKey();
        console.log(`🔑 Generated API key: ${apiKey}`);
    }

    // Memory configuration
    const memoryConfig = await configureMemorySettings();

    // Queue size
    const queueSize = await question('📋 Максимум задач в очереди (default: 50): ') || '50';

    // Environment
    const nodeEnv = await question('🏷️  Environment (development/production, default: production): ') || 'production';

    // Debug options
    const debugMemory = await question('🔍 Включить детальное логирование памяти? (y/N): ');

    // Create .env content
    const envContent = `# Reels to Telegram Server Configuration (Memory Edition)
# Generated on ${new Date().toISOString()}

# Server Configuration
PORT=${port}
NODE_ENV=${nodeEnv}

# Telegram Bot Configuration
BOT_TOKEN=${botToken}
CHANNEL_ID=${channelId}

# Security
API_KEY=${apiKey}

# File Settings
MAX_FILE_SIZE=${memoryConfig.memoryPerVideo}

# Memory Configuration (NEW!)
MAX_MEMORY_PER_VIDEO=${memoryConfig.memoryPerVideo}
MAX_TOTAL_MEMORY=${memoryConfig.totalMemory}
MEMORY_PROCESSING=true

# Queue Configuration
MAX_CONCURRENT_DOWNLOADS=${memoryConfig.concurrent}
MAX_QUEUE_SIZE=${queueSize}
QUEUE_TIMEOUT=600000
DOWNLOAD_TIMEOUT=60000

# Memory Monitoring
MEMORY_LOG_INTERVAL=30000
AUTO_MEMORY_CLEANUP=true
MEMORY_WARNING_THRESHOLD=80
DEBUG_MEMORY=${debugMemory.toLowerCase() === 'y' ? 'true' : 'false'}

# Performance
WORKER_SPAWN_DELAY=1000
QUEUE_POLL_INTERVAL=2000
AUTO_CLEANUP_INTERVAL=300000
`;

    fs.writeFileSync('.env', envContent);
    console.log('\n✅ .env file created successfully!');

    // Show memory summary
    console.log('\n💾 Memory Configuration Summary:');
    console.log(`   Per video: ${formatMemory(memoryConfig.memoryPerVideo)}`);
    console.log(`   Total pool: ${formatMemory(memoryConfig.totalMemory)}`);
    console.log(`   Concurrent: ${memoryConfig.concurrent} videos`);
    console.log(`   Mode: In-memory processing (zero disk usage)`);
}

function createDirectories() {
    console.log('\n📁 Creating directories...');

    // В memory режиме temp папка не нужна, но создаем для совместимости
    const dirs = ['logs'];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`✅ Created: ${dir}/`);
        } else {
            console.log(`✅ Exists: ${dir}/`);
        }
    });

    // Create temp dir but note it won't be used
    if (!fs.existsSync('temp')) {
        fs.mkdirSync('temp', { recursive: true });
        console.log(`✅ Created: temp/ (not used in memory mode)`);
    } else {
        console.log(`✅ Exists: temp/ (not used in memory mode)`);
    }
}

function createCookiesFile() {
    console.log('\n🍪 Setting up cookies file...');

    if (!fs.existsSync('cookies.txt')) {
        fs.writeFileSync('cookies.txt', '# Instagram cookies for yt-dlp\n# Add your cookies here if needed\n');
        console.log('✅ Created empty cookies.txt');
        console.log('💡 Add Instagram cookies if you encounter rate limits');
    } else {
        console.log('✅ cookies.txt already exists');
    }
}

async function testSetup() {
    console.log('\n🧪 Testing setup...\n');

    try {
        // Test environment loading
        require('dotenv').config();

        if (!process.env.BOT_TOKEN) {
            throw new Error('BOT_TOKEN not loaded from .env');
        }

        console.log('✅ Environment variables loaded');

        // Test memory configuration
        const memoryPerVideo = parseInt(process.env.MAX_MEMORY_PER_VIDEO || '52428800');
        const totalMemory = parseInt(process.env.MAX_TOTAL_MEMORY || '209715200');
        const concurrent = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3');

        console.log(`✅ Memory config: ${formatMemory(memoryPerVideo)} per video, ${formatMemory(totalMemory)} total`);

        if (totalMemory < memoryPerVideo * concurrent) {
            console.log('⚠️  Warning: Total memory limit may be insufficient');
        }

        // Test Telegram bot
        const { Telegraf } = require('telegraf');
        const bot = new Telegraf(process.env.BOT_TOKEN);

        try {
            const botInfo = await bot.telegram.getMe();
            console.log(`✅ Telegram bot connected: @${botInfo.username}`);
        } catch (error) {
            console.log('❌ Telegram bot connection failed:', error.message);
        }

        // Test system memory
        const systemMem = require('os').totalmem();
        const freeMem = require('os').freemem();

        if (freeMem < totalMemory) {
            console.log(`⚠️  Warning: System free memory (${formatMemory(freeMem)}) < configured limit (${formatMemory(totalMemory)})`);
        } else {
            console.log(`✅ System memory check passed (${formatMemory(freeMem)} available)`);
        }

        console.log('✅ Setup test completed');

    } catch (error) {
        console.log('❌ Setup test failed:', error.message);
    }
}

function showNextSteps() {
    console.log('\n🎉 Setup completed! (Memory Edition)\n');
    console.log('📋 Next steps:');
    console.log('1. npm start                     - Start the server in memory mode');
    console.log('2. Install browser extension     - Load extension in Chrome');
    console.log('3. Configure extension           - Add server URL and API key');
    console.log('4. Test with Instagram Reels     - Send a video!');
    console.log('\n📖 Documentation: https://github.com/revoulce/reels-to-telegram');
    console.log('\n🔧 Server commands:');
    console.log('   npm start     - Production mode (memory processing)');
    console.log('   npm run dev   - Development mode (with memory logs)');
    console.log('   npm run clean - Clean logs (temp not used)');
    console.log('\n💾 Memory mode features:');
    console.log('   ✅ Zero disk usage');
    console.log('   ⚡ Faster processing');
    console.log('   🧹 Automatic memory cleanup');
    console.log('   📊 Memory usage monitoring');
    console.log('\n🔧 Telegram bot commands:');
    console.log('   /queue   - Queue status');
    console.log('   /memory  - Memory usage');
    console.log('   /stats   - General statistics');
    console.log('\n✨ Happy posting with zero disk usage!');
}

async function main() {
    try {
        await checkDependencies();
        await createEnvFile();
        createDirectories();
        createCookiesFile();
        await testSetup();
        showNextSteps();

    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n\n👋 Setup cancelled');
    rl.close();
    process.exit(0);
});

main();