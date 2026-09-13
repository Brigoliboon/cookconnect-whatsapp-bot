const fs = require('fs');
const path = require('path');
const { TOOLS } = require('../tools');
const { executeTool } = require('../tool-executor');

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

function loadSystemPrompt() {
  const xmlPath = path.resolve(__dirname, '../../whatsapp-system-context.xml');
  return fs.readFileSync(xmlPath, 'utf-8');
}

function sanitizeWhatsApp(text) {
  return text.replace(/\*{2,}([^*]+?)\*{2,}/g, '*$1*');
}

function buildOpenRouterHeaders() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (process.env.OPENROUTER_SITE_URL) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  }

  if (process.env.OPENROUTER_APP_NAME) {
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME;
  }

  return headers;
}

function buildMessages(history, text) {
  const messages = [
    {
      role: 'system',
      content: loadSystemPrompt(),
    },
  ];

  for (const item of history) {
    if (!item?.role || !item?.text) continue;
    messages.push({
      role: item.role,
      content: item.text,
    });
  }

  messages.push({ role: 'user', content: text });
  return messages;
}

async function callOpenRouter(model, messages) {
  const baseUrl = process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL;

  const body = JSON.stringify({ model, messages, tools: TOOLS });
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: buildOpenRouterHeaders(),
        body,
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  if (!response) {
    throw new Error(`OpenRouter unreachable after 3 attempts: ${lastError.cause?.message || lastError.message}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter returned ${response.status}: ${body}`);
  }

  return response.json();
}

async function askOpenRouter({ text, history = [] }) {
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const messages = buildMessages(history, text);
  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callOpenRouter(model, messages);
    const choice = data?.choices?.[0];
    const message = choice?.message;

    if (!message) throw new Error('OpenRouter response did not include a message');

    if (message.tool_calls?.length) {
      messages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });

      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function?.name;
        let params = {};
        try {
          params = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {}
        const result = await executeTool(fnName, params);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    const reply = message.content?.trim();
    if (!reply) throw new Error('OpenRouter response did not include a reply');
    return sanitizeWhatsApp(reply);
  }

  throw new Error('Too many tool call rounds');
}

module.exports = {
  askOpenRouter,
};
