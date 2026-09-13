const API_URL = process.env.COOKCONNECT_API_URL || 'http://localhost:3000';
const BOT_SECRET = process.env.COOKCONNECT_BOT_SECRET;
const SITE_LINK = process.env.SITE_LINK || 'https://cookconnect.vercel.app';
const MAX_HISTORY = 12;

function normalizePhone(raw) {
  const defaultCountry = process.env.DEFAULT_COUNTRY_CODE || '971';
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = defaultCountry + digits.slice(1);
  return digits;
}

function apiHeaders() {
  return { 'x-bot-secret': BOT_SECRET };
}

async function fetchPending(limit = 20) {
  const response = await fetch(
    `${API_URL}/api/whatsapp-reminder?status=pending&limit=${limit}`,
    { headers: apiHeaders() }
  );
  if (!response.ok) throw new Error(`reminder feed returned ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : data.pending || [];
}

async function markSent(id) {
  const response = await fetch(`${API_URL}/api/whatsapp-reminder/${id}`, {
    method: 'PATCH',
    headers: apiHeaders(),
  });
  if (!response.ok) throw new Error(`mark-sent returned ${response.status}`);
}

async function fetchDelivery(orderId) {
  const response = await fetch(`${API_URL}/api/delivery/${orderId}`, {
    headers: apiHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`delivery lookup returned ${response.status}`);
  return response.json();
}

function buildMessage(reminder, delivery) {
  const ref = String(reminder.reference_id || '').slice(0, 8);
  const orderLink = `${SITE_LINK}/#meals`;

  if (reminder.kind === 'subscription' && reminder.type === 'confirmed') {
    return (
      `Hi! Your CookConnect subscription inquiry is *confirmed*. 📅\n` +
      `Ref: ${ref}\n\n` +
      `Our sales team will contact you shortly about payment and your start date.\n\n` +
      `Questions? WhatsApp us: https://wa.me/971556634050`
    );
  }

  if (reminder.type === 'out_for_delivery') {
    return (
      `Good news — your CookConnect order is *out for delivery*. 🚚\n` +
      `Ref: ${ref}\n\n` +
      `Track it here: ${SITE_LINK}/order-tracking/${delivery.short_code}\n` +
      `Pickup code: *${delivery.pickup_code}*\n\n` +
      `Please keep your phone nearby. Questions? +971556634050`
    );
  }

  return (
    `Hi! Your CookConnect order is *confirmed*. 🎉\n` +
    `Ref: ${ref}\n\n` +
    `We'll message you when it's on its way.\n\n` +
    `Browse more: ${orderLink}`
  );
}

async function pollOnce(sock, history) {
  const pending = await fetchPending();
  for (const reminder of pending) {
    const phone = normalizePhone(reminder.phone);
    if (!phone) {
      console.error(`[REMINDER] skipping ${reminder.id}: no phone`);
      continue;
    }
    let delivery = null;
    if (reminder.kind === 'order' && reminder.type === 'out_for_delivery') {
      delivery = await fetchDelivery(reminder.reference_id);
      if (!delivery) {
        console.log(`[REMINDER] ${phone}: delivery not ready, retry later`);
        continue;
      }
    }
    const text = buildMessage(reminder, delivery);
    await sock.sendMessage(`${phone}@s.whatsapp.net`, { text });
    await markSent(reminder.id);
    const entries = history.get(phone) || [];
    entries.push({ role: 'assistant', text });
    history.set(phone, entries.slice(-MAX_HISTORY));
    console.log(`[REMINDER] ${phone}: ${reminder.kind}/${reminder.type} sent`);
  }
}

function startPoller(sock, history, intervalMs = 60000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pollOnce(sock, history);
    } catch (error) {
      console.error('Reminder poll error:', error.message);
    } finally {
      running = false;
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = {
  normalizePhone,
  buildMessage,
  fetchPending,
  fetchDelivery,
  pollOnce,
  startPoller,
};
