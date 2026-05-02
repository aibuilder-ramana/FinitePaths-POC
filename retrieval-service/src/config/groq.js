const axios = require('axios');
require('dotenv').config();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

class GroqClient {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.model = process.env.MODEL || 'llama-3.3-70b-versatile';

    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is required');
    }
  }

  async chat(messages, temperature = 0.1, retries = 5) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await axios.post(
          GROQ_API_URL,
          { model: this.model, messages, temperature, max_tokens: 2048 },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }
        );
        return response.data.choices[0].message.content;
      } catch (error) {
        if (error.response?.status === 429) {
          const wait = Math.max(parseInt(error.response.headers['retry-after'] || '20', 10), 20) * 1000;
          console.log(`   ⏳ Rate limited, waiting ${wait / 1000}s...`);
          await new Promise(r => setTimeout(r, wait));
        } else {
          const msg = error.response
            ? `Groq API Error: ${error.response.status} - ${error.response.data.error?.message || error.message}`
            : `Groq API Error: ${error.message}`;
          throw new Error(msg);
        }
      }
    }
    throw new Error('Groq rate limit: max retries exceeded');
  }
}

module.exports = new GroqClient();
