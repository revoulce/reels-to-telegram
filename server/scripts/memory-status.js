#!/usr/bin/env node

const axios = require('axios');

async function checkMemoryStatus() {
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  
  try {
    const response = await axios.get(`${serverUrl}/health`, {
      timeout: 5000
    });
    
    const memoryInfo = response.data.memory;
    
    console.log('💾 Memory Status:');
    if (memoryInfo.queue) {
      console.log(`Queue Memory: ${memoryInfo.queue.currentFormatted} / ${memoryInfo.queue.maxFormatted} (${memoryInfo.queue.utilization}%)`);
      console.log(`Peak Usage: ${memoryInfo.queue.peakFormatted}`);
    }
    
    if (memoryInfo.process) {
      console.log(`Process Memory: ${memoryInfo.process.rssFormatted}`);
    }
    
  } catch (error) {
    console.error('❌ Error fetching memory status:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  checkMemoryStatus();
}

module.exports = checkMemoryStatus;