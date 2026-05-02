const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.MODEL || 'claude-haiku-4-5-20251001';

class LLMClient {
  getModel() { return MODEL; }

  async chat(messages, temperature = 0.1) {
    let system;
    const filtered = [];
    for (const m of messages) {
      if (m.role === 'system') { system = m.content; }
      else { filtered.push(m); }
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      temperature,
      ...(system ? { system } : {}),
      messages: filtered
    });

    return response.content[0].text;
  }
}

module.exports = new LLMClient();
