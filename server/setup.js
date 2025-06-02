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

console.log('🚀 Reels to Telegram Server Setup\n');

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

    } catch (error) {
        console.error('Error checking dependencies:', error.message);
    }

    console.log('');
}

function generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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

    // Environment
    const nodeEnv = await question('🏷️  Environment (development/production, default: production): ') || 'production';

    // Create .env content
    const envContent = `# Reels to Telegram Server Configuration
# Generated on ${new Date().toISOString()}

# Server Configuration
PORT=${port}
NODE_ENV=${nodeEnv}

# Telegram Bot Configuration
BOT_TOKEN=${botToken}
CHANNEL_ID=${channelId}

# Security
API_KEY=${apiKey}

# File Settings (optional)
MAX_FILE_SIZE=52428800
DOWNLOAD_TIMEOUT=60000

# Custom temp directory (optional)
# TEMP_DIR=./temp
`;

    fs.writeFileSync('.env', envContent);
    console.log('\n✅ .env file created successfully!');
}

function createDirectories() {
    console.log('\n📁 Creating directories...');

    const dirs = ['temp', 'logs'];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`✅ Created: ${dir}/`);
        } else {
            console.log(`✅ Exists: ${dir}/`);
        }
    });
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

        // Test Telegram bot
        const { Telegraf } = require('telegraf');
        const bot = new Telegraf(process.env.BOT_TOKEN);

        try {
            const botInfo = await bot.telegram.getMe();
            console.log(`✅ Telegram bot connected: @${botInfo.username}`);
        } catch (error) {
            console.log('❌ Telegram bot connection failed:', error.message);
        }

        console.log('✅ Setup test completed');

    } catch (error) {
        console.log('❌ Setup test failed:', error.message);
    }
}

function showNextSteps() {
    console.log('\n🎉 Setup completed!\n');
    console.log('📋 Next steps:');
    console.log('1. npm start                     - Start the server');
    console.log('2. Install browser extension     - Load extension in Chrome');
    console.log('3. Configure extension           - Add server URL and API key');
    console.log('4. Test with Instagram Reels     - Send a video!');
    console.log('\n📖 Documentation: https://github.com/revoulce/reels-to-telegram');
    console.log('\n🔧 Server commands:');
    console.log('   npm start     - Production mode');
    console.log('   npm run dev   - Development mode');
    console.log('   npm run clean - Clean temp files');
    console.log('\n✨ Happy posting!');
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