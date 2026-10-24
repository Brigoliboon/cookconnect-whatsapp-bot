const simulatedNumbers = new Set();

function normalizePhone(raw) {
  const defaultCountry = process.env.DEFAULT_COUNTRY_CODE || '971';
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = defaultCountry + digits.slice(1);
  return digits;
}

function markSimulatedNumber(raw) {
  const phone = normalizePhone(raw);
  if (phone) simulatedNumbers.add(phone);
  return phone;
}

function isSimulatedNumber(raw) {
  return simulatedNumbers.has(normalizePhone(raw));
}

module.exports = {
  normalizePhone,
  markSimulatedNumber,
  isSimulatedNumber,
};
