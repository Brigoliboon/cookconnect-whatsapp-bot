const http = require('http');
const { normalizePhone, markSimulatedNumber } = require('./simulated-numbers');

const MAX_BODY_BYTES = 1024 * 1024;

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) {
        reject(httpError('Request body too large'));
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        reject(httpError('Request body is required'));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(httpError('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function parseFrom(value) {
  if (typeof value !== 'string') return null;
  const from = value.trim();
  if (!normalizePhone(from)) return null;
  return from;
}

function parseText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function createQueue() {
  const queues = new Map();
  return function enqueue(key, task) {
    const previous = queues.get(key) || Promise.resolve();
    const next = previous.then(task, task);
    const tail = next.catch(() => {});
    queues.set(key, tail);
    tail.then(() => {
      if (queues.get(key) === tail) queues.delete(key);
    });
    return next;
  };
}

function startSimulator({ history, processText }) {
  if (process.env.SIMULATOR_ENABLED !== 'true') return null;

  const port = Number.parseInt(process.env.SIMULATOR_PORT || '3001', 10) || 3001;
  const enqueue = createQueue();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');

      if (req.method === 'GET' && url.pathname === '/simulate/health') {
        sendJson(res, 200, { ok: true, enabled: true });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/simulate') {
        const body = await readJson(req);
        const from = parseFrom(body?.from);
        const text = parseText(body?.text);
        if (!from) {
          sendJson(res, 400, { error: 'Invalid or missing "from"' });
          return;
        }
        if (!text) {
          sendJson(res, 400, { error: 'Invalid or missing "text"' });
          return;
        }

        const key = normalizePhone(from) || from;
        markSimulatedNumber(from);
        const started = Date.now();
        const reply = await enqueue(key, () => processText(key, text, { simulated: true }));
        sendJson(res, 200, { from, reply, ms: Date.now() - started });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/simulate/reset') {
        const body = await readJson(req);
        const from = parseFrom(body?.from);
        if (!from) {
          sendJson(res, 400, { error: 'Invalid or missing "from"' });
          return;
        }

        const key = normalizePhone(from) || from;
        markSimulatedNumber(from);
        await enqueue(key, () => history.delete(key));
        sendJson(res, 200, { from, reset: true });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { error: error.message || 'Simulator error' });
    }
  });

  server.on('error', (error) => {
    console.error('[simulator] Server error:', error.message);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[simulator] Listening on http://127.0.0.1:${port}`);
  });

  return server;
}

module.exports = { startSimulator };
