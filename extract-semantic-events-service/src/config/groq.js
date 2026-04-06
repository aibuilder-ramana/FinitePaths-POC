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

  async chat(messages, temperature = 0.1) {
    try {
      const response = await axios.post(
        GROQ_API_URL,
        {
          model: this.model,
          messages: messages,
          temperature: temperature,
          max_tokens: 4096,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      if (error.response) {
        throw new Error(`Groq API Error: ${error.response.status} - ${error.response.data.error?.message || error.message}`);
      }
      throw new Error(`Groq API Error: ${error.message}`);
    }
  }

  getModel() {
    return this.model;
  }
}

module.exports = new GroqClient();
