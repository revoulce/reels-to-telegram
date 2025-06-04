#!/usr/bin/env node

const fs = require('fs');

function cleanDirectories() {
    const dirs = ['./logs', './temp'];

    dirs.forEach(dir => {
        try {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`🧹 Cleaned ${dir}`);
            }
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created ${dir}`);
        } catch (error) {
            console.error(`Error handling ${dir}:`, error.message);
        }
    });
}

if (require.main === module) {
    cleanDirectories();
}

module.exports = cleanDirectories;