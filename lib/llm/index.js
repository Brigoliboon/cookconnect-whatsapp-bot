const fs = require('fs');
const path = require('path');
const { TOOLS } = require('../tools');
const { executeTool } = require('../tool-executor');

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 3;
const MAX_TOOL_ROUNDS = 5;

// Retry only transient failures. 4xx other than these are caller/config errors.
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function loadConfig() {
  const baseUrl = firstEnv('LLM_BASE_URL', 'OPENROUTER_BASE_URL') || DEFAULT_BASE_URL;
  const timeoutMs = Number.parseInt(firstEnv('LLM_TIMEOUT_MS'), 10);

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: firstEnv('LLM_API_KEY', 'OPENROUTER_API_KEY'),
    model: firstEnv('LLM_MODEL', 'OPENROUTER_MODEL') || DEFAULT_MODEL,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

function loadSystemPrompt() {
  const xmlPath = path.resolve(__dirname, '../../whatsapp-system-context.xml');
  return fs.readFileSync(xmlPath, 'utf-8');
}

function sanitizeWhatsApp(text) {
  return text.replace(/\*{2,}([^*]+?)\*{2,}/g, '*$1*');
}

function buildHeaders(config) {
  if (!config.apiKey) {
    throw new Error('LLM_API_KEY is not set');
  }

  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };

  // OpenRouter attribution headers; other gateways ignore them, so only send
  // them when the configured endpoint is actually OpenRouter.
  if (/openrouter\.ai/.test(config.baseUrl)) {
    const siteUrl = firstEnv('LLM_SITE_URL', 'OPENROUTER_SITE_URL');
    const appName = firstEnv('LLM_APP_NAME', 'OPENROUTER_APP_NAME');
    if (siteUrl) headers['HTTP-Referer'] = siteUrl;
    if (appName) headers['X-Title'] = appName;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response, attempt) {
  const retryAfter = response?.headers?.get?.('retry-after');
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 10000);
  }
  return 1000 * attempt;
}

async function callLLM(config, messages) {
  const url = `${config.baseUrl}/chat/completions`;
  const body = JSON.stringify({ model: config.model, messages, tools: TOOLS });
  const headers = buildHeaders(config);

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * attempt);
      continue;
    }

    if (!response.ok) {
      const responseBody = await response.text();
      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }
      throw new Error(`LLM API returned ${response.status}: ${responseBody}`);
    }

    return response.json();
  }

  const reason = lastError?.cause?.message || lastError?.message || 'request failed';
  throw new Error(`LLM API unreachable after ${MAX_ATTEMPTS} attempts: ${reason}`);
}

async function askModel({ text, history = [], simulated = false }) {
  const config = loadConfig();
  const messages = buildMessages(history, text);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callLLM(config, messages);
    const choice = data?.choices?.[0];
    const message = choice?.message;

    if (!message) throw new Error('LLM response did not include a message');

    if (message.tool_calls?.length) {
      messages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });

      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function?.name;
        let params = {};
        try {
          params = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {}
        const result = await executeTool(fnName, params, { simulated });
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    const reply = message.content?.trim();
    if (!reply) throw new Error('LLM response did not include a reply');
    return sanitizeWhatsApp(reply);
  }

  throw new Error('Too many tool call rounds');
}

module.exports = {
  askModel,
  // Backwards-compatible alias for existing imports/scripts.
  askOpenRouter: askModel,
};
