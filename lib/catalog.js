const SITE_LINK = process.env.SITE_LINK || 'https://cookconnect.vercel.app';

function encodeMealIds(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  return encodeURIComponent(Buffer.from(JSON.stringify(list)).toString('base64'));
}

function decodeMealIds(encoded) {
  const normalized = decodeURIComponent(String(encoded || ''))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf-8'));
}

function buildCatalogUrl(ids, checkout = true) {
  const base = SITE_LINK.replace(/\/$/, '');
  const params = `ids=${encodeMealIds(ids)}${checkout ? '&checkout=true' : ''}`;
  return `${base}/catalog?${params}`;
}

module.exports = {
  encodeMealIds,
  decodeMealIds,
  buildCatalogUrl,
};
