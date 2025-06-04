#!/usr/bin/env node

const axios = require('axios');

async function checkQueueStatus() {
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    console.error('❌ API_KEY environment variable is required');
    process.exit(1);
  }

  try {
    const response = await axios.get(`${serverUrl}/api/queue/stats`, {
      headers: { 'X-API-Key': apiKey },
      timeout: 5000
    });
    
    console.log('📊 Queue Status:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error fetching queue status:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  checkQueueStatus();
}

module.exports = checkQueueStatus;