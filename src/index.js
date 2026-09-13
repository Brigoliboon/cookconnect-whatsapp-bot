require('dotenv').config();

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { askOpenRouter } = require('../lib/openrouter');
const { startPoller } = require('../lib/reminder-poller');

const authDir = process.env.AUTH_DIR || './auth';
const history = new Map();
const MAX_HISTORY = 12;

function getText(message) {
  if (!message?.message) return '';
  const content = message.message;
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    ''
  ).trim();
}

function getNumber(message) {
  const jid = message.key.senderPn || message.key.remoteJidAlt || message.key.remoteJid || '';
  return jid.split('@')[0];
}

function remember(jid, role, text) {
  const entries = history.get(jid) || [];
  entries.push({ role, text });
  history.set(jid, entries.slice(-MAX_HISTORY));
}

async function handleMessage(sock, message) {
  const jid = message.key.remoteJid;
  const text = getText(message);
  if (!jid || !text || jid === 'status@broadcast' || message.key.fromMe) return;

  const key = getNumber(message) || jid;
  const normalized = text.toLowerCase();
  console.log(`[MSG] ${key} (${message.pushName || 'unknown'}): ${text}`);
  let reply;

  if (normalized === 'reset') {
    history.delete(key);
    reply = 'Conversation reset. What can I help you with?';
  } else {
    try {
      reply = await askOpenRouter({ text, history: history.get(key) || [] });
    } catch (error) {
      console.error('OpenRouter error:', error.message);
      reply = 'I\'m having trouble reaching the assistant right now. Please try again shortly.';
    }
  }

  remember(key, 'user', text);
  remember(key, 'assistant', reply);
  await sock.sendMessage(jid, { text: reply });
}

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch { /* use library default */ }

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
    logger: pino({ level: 'silent' }),
    browser: ['CookConnect Bot', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    qrTimeout: 60000,
    keepAliveIntervalMs: 30000,
  });
  sock.ev.on('creds.update', saveCreds);
  let poller = null;
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) { console.log('\nScan this QR code in WhatsApp → Linked devices:\n'); qrcode.generate(qr, { small: true }); }
    if (connection === 'open') {
      console.log('WhatsApp connected.');
      if (!poller) poller = startPoller(sock, history);
    }
    if (connection === 'close') {
      if (poller) { clearInterval(poller); poller = null; }
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('Connection closed; reconnecting in 5s...');
        setTimeout(startWhatsApp, 5000);
      } else console.error('Logged out. Delete auth/ and restart to pair again.');
    }
  });
  const queues = new Map();
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      const key = getNumber(message) || message.key.remoteJid;
      const prev = queues.get(key) || Promise.resolve();
      const next = prev
        .then(() => handleMessage(sock, message))
        .catch((error) => console.error('Message error:', error));
      queues.set(key, next);
      next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
    }
  });
}

startWhatsApp().catch((error) => { console.error('Unable to start WhatsApp:', error); process.exitCode = 1; });
