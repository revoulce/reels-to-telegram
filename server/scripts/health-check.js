#!/usr/bin/env node

const axios = require('axios');

async function healthCheck() {
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  
  try {
    const response = await axios.get(`${serverUrl}/health`, {
      timeout: 5000
    });
    
    const data = response.data;
    
    console.log('✅ Server is healthy');
    console.log(`🆙 Uptime: ${Math.floor(data.uptime / 3600)}h ${Math.floor((data.uptime % 3600) / 60)}m`);
    
    if (data.memory?.queue) {
      console.log(`💾 Memory: ${data.memory.queue.currentFormatted} / ${data.memory.queue.maxFormatted} (${data.memory.queue.utilization}%)`);
    }
    
    if (data.queue) {
      console.log(`📊 Queue: ${data.queue.queued} queued, ${data.queue.processing} processing`);
    }
    
  } catch (error) {
    console.error('❌ Server health check failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  healthCheck();
}

module.exports = healthCheck;