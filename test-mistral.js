/**
 * Quick test script to verify Mistral API connectivity
 */
const axios = require('axios');

const MISTRAL_API_KEY = 'uwd1xWkrxt1iQa1mdMQvBqyumPzWnUyf';
const MISTRAL_MODEL = 'mistral-large-latest';

async function testMistralAPI() {
  try {
    console.log('🧪 Testing Mistral API connection...\n');

    const response = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: MISTRAL_MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say "Hello from Mistral!" if you receive this.' }
        ],
        temperature: 0.1,
        max_tokens: 50
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MISTRAL_API_KEY}`
        },
        timeout: 30000
      }
    );

    console.log('✅ SUCCESS! Mistral API is working.\n');
    console.log('Response:', response.data.choices[0].message.content);
    console.log('\nFull Response Data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ FAILED! Mistral API error:\n');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Error Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received. Network issue or timeout.');
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testMistralAPI();
