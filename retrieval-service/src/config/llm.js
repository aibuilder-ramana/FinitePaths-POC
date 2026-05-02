const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.MODEL || 'claude-haiku-4-5-20251001';

async function chat(messages, temperature = 0.0) {
  // Separate system message from user/assistant messages
  let system;
  const filteredMessages = [];
  for (const m of messages) {
    if (m.role === 'system') {
      system = m.content;
    } else {
      filteredMessages.push(m);
    }
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    temperature,
    ...(system ? { system } : {}),
    messages: filteredMessages
  });

  return response.content[0].text;
}

module.exports = { chat };
