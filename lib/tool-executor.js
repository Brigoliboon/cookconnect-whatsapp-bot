const path = require('path');
const fs = require('fs');
const { buildCatalogUrl } = require('./catalog');
const { normalizePhone } = require('./simulated-numbers');

const SUBSCRIPTIONS_CONFIG_PATH = path.join(__dirname, '..', 'config', 'subscriptions.json');

function loadSubscriptionsConfig() {
  return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_CONFIG_PATH, 'utf8'));
}

const SITE_LINK = process.env.SITE_LINK || 'https://cookconnectae.com';
const API_BASE = process.env.API_BASE || 'https://cookconnectae.com';
const COOKCONNECT_API_URL = process.env.COOKCONNECT_API_URL || 'http://localhost:3000';
const UTM_SOURCE = process.env.UTM_SOURCE || 'whatsapp_bot';
const UTM_MEDIUM = process.env.UTM_MEDIUM || 'chatbot';

function resolveApiBase(base, context = {}) {
  if (context.simulated && process.env.SIMULATOR_API_URL) {
    return process.env.SIMULATOR_API_URL;
  }
  return base;
}

function logOp(scope, message) {
  console.log(`${new Date().toISOString()} [${scope}] ${message}`);
}

function logErr(scope, message) {
  console.error(`${new Date().toISOString()} [${scope}] ${message}`);
}

// Per-chat bargaining backstop (in-memory; resets with the process).
// phone → { counters: Map<plan_id, last counter returned>, quoted: Set<price>, lastOffer }
const chatSubscriptionState = new Map();

function subscriptionState(phone) {
  const key = phone || '';
  let state = chatSubscriptionState.get(key);
  if (!state) {
    state = { counters: new Map(), quoted: new Set(), lastOffer: null };
    chatSubscriptionState.set(key, state);
  }
  return state;
}

// Every subscription price this chat has been shown (plans list + offers).
function getQuotedSubscriptionPrices(phone) {
  const state = chatSubscriptionState.get(chatPhone({ phone }) || '');
  return state ? Array.from(state.quoted).sort((a, b) => a - b) : [];
}

// [floor_price, list_price] for every plan in the config.
function getSubscriptionPriceRanges() {
  return (loadSubscriptionsConfig().plans || []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    floor_price: plan.floor_price,
    list_price: plan.list_price,
  }));
}

// Last get_subscription_offer result for this chat (used as a safe fallback).
function getLastSubscriptionOffer(phone) {
  const state = chatSubscriptionState.get(chatPhone({ phone }) || '');
  return state?.lastOffer || null;
}

async function apiRequest(path, { base = COOKCONNECT_API_URL, method = 'GET', headers, body, context = {} } = {}) {
  const verb = method.toUpperCase();
  const targetBase = resolveApiBase(base, context);

  if (context.simulated && !process.env.SIMULATOR_API_URL && verb !== 'GET') {
    logOp('api', `${verb} ${new URL(path, base).toString()} → dry-run (simulated, SIMULATOR_API_URL unset) — not sent`);
    return { success: true, simulated: true, dry_run: true };
  }

  const url = new URL(path, targetBase).toString();
  const started = Date.now();
  const options = { method: verb };
  if (headers) options.headers = headers;
  if (body !== undefined) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const ms = Date.now() - started;

    if (!response.ok) {
      const responseBody = await response.text();
      logErr('api', `${verb} ${url} → ${response.status} ms=${ms} body="${responseBody.slice(0, 300)}"`);
      throw new Error(`API returned ${response.status}: ${responseBody}`);
    }

    logOp('api', `${verb} ${url} → ${response.status} ms=${ms}`);
    return await response.json();
  } catch (error) {
    if (!String(error.message).startsWith('API returned')) {
      logErr('api', `${verb} ${url} → failed ms=${Date.now() - started} error="${error.message}"`);
    }
    throw error;
  }
}

async function get_current_time() {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' });
  return { current_time: now, timezone: 'Asia/Dubai' };
}

async function get_delivery_areas() {
  return {
    delivery_areas: ['Ajman only'],
    note: 'Delivery is not supported outside Ajman. Hours: Sat-Thu, 08:00 AM - 10:00 PM. Closed Friday.',
  };
}

async function get_subscription_plans(params = {}, context = {}) {
  const config = loadSubscriptionsConfig();
  const durationFilter = params.duration_days == null ? null : Number(params.duration_days);
  const mealsFilter = params.meals_per_day == null ? null : Number(params.meals_per_day);
  const plans = (config.plans || [])
    .filter((plan) => durationFilter == null || plan.duration_days === durationFilter)
    .filter((plan) => mealsFilter == null || plan.meals_per_day === mealsFilter)
    .map((plan) => ({
      id: plan.id,
      duration_days: plan.duration_days,
      meals_per_day: plan.meals_per_day,
      total_meals: plan.total_meals,
      ...(plan.tags?.length ? { tags: plan.tags } : {}),
    }));

  const hasPlanFilter = durationFilter != null || mealsFilter != null;
  return {
    currency: config.currency,
    plans,
    plan_details: config.plan_details,
    meal_choice: config.meal_choice,
    ...(hasPlanFilter ? { meal_rules: config.meal_rules } : {}),
    commitment: config.commitment,
  };
}

function findPlan(config, planId) {
  return (config.plans || []).find((plan) => plan.id === planId) || null;
}

async function fetchSubscriptionRate(plan, context = {}) {
  const query = new URLSearchParams({
    plan: plan.plan_slug || plan.id,
    meals_per_day: String(plan.meals_per_day),
  });
  return apiRequest(`/api/subscription-rates?${query.toString()}`, { context });
}

const MEAL_CHOICE_OPTIONS = ['breakfast', 'lunch', 'dinner', 'extra meal'];

function normalizeMealSelection(value) {
  if (value == null || value === '') return null;
  const meals = String(value)
    .split(',')
    .map((meal) => meal.trim().toLowerCase().replace(/_/g, ' '))
    .filter(Boolean);
  const normalized = [];
  for (const meal of meals) {
    if (!MEAL_CHOICE_OPTIONS.includes(meal)) return null;
    if (!normalized.includes(meal)) normalized.push(meal);
  }
  return normalized.length ? normalized.join(',') : null;
}

async function get_subscription_offer(params = {}, context = {}) {
  const config = loadSubscriptionsConfig();
  const plan = findPlan(config, params.plan_id);
  if (!plan) {
    logErr('get_subscription_offer', `rejected — unknown plan_id="${params.plan_id ?? ''}"`);
    return { error: `Unknown plan_id: ${params.plan_id ?? ''}` };
  }

  let rate;
  try {
    rate = await fetchSubscriptionRate(plan, context);
  } catch (error) {
    logErr('get_subscription_offer', `rate lookup failed plan=${plan.id} error="${error.message}"`);
    return { error: `Could not load the price for ${plan.name}: ${error.message}` };
  }

  const counterOffers = (rate.counter_offers_cents || []).map((cents) => Number(cents) / 100);
  const listPrice = Number(rate.list_price_cents) / 100;
  const floorPrice = Number(rate.floor_price_cents) / 100;

  const state = subscriptionState(chatPhone(context));
  const lastCounter = state.counters.has(plan.id) ? state.counters.get(plan.id) : -1;
  const counterRaw = Number(params.counter_number);
  const requested = Number.isInteger(counterRaw) && counterRaw > 0 ? counterRaw : 0;
  // The model may never skip ahead of the last counter given, nor go back below it
  // (prices never go back up). The first call for a plan in a chat is capped at 0.
  let counter = Math.max(Math.min(requested, lastCounter + 1), lastCounter);
  if (counter !== requested) {
    logOp('get_subscription_offer', `chat=${chatPhone(context) || 'none'} plan=${plan.id} counter capped ${requested} → ${counter}`);
  }

  let price;
  if (counter <= counterOffers.length) {
    price = counter === 0 ? listPrice : counterOffers[counter - 1];
  } else {
    price = floorPrice;
    counter = counterOffers.length;
  }
  if (price < floorPrice) price = floorPrice;

  const isFinal = price === floorPrice;
  const result = {
    plan_id: plan.id,
    plan_name: rate.plan_name,
    duration_days: rate.validity_days,
    meals_per_day: rate.meals_per_day,
    total_meals: rate.total_meals,
    price,
    currency: rate.currency,
    counter_number: counter,
    final: isFinal,
    ...(isFinal ? { message: 'This is the lowest price available for this plan.' } : {}),
  };

  state.counters.set(plan.id, counter);
  state.quoted.add(price);
  state.lastOffer = result;
  return result;
}

async function subscription_signup_link(params = {}, context = {}) {
  const config = loadSubscriptionsConfig();
  const plan = findPlan(config, params.plan_id);
  if (!plan) {
    logErr('subscription_signup_link', `rejected — unknown plan_id="${params.plan_id ?? ''}"`);
    return { error: `Unknown plan_id: ${params.plan_id ?? ''}` };
  }

  let rate;
  try {
    rate = await fetchSubscriptionRate(plan, context);
  } catch (error) {
    logErr('subscription_signup_link', `rate lookup failed plan=${plan.id} error="${error.message}"`);
    return { error: `Could not load the price for ${plan.name}: ${error.message}` };
  }

  const counterOffers = (rate.counter_offers_cents || []).map((cents) => Number(cents) / 100);
  const listPrice = Number(rate.list_price_cents) / 100;
  const floorPrice = Number(rate.floor_price_cents) / 100;
  const price = Number(params.price);
  const validPrices = [listPrice, ...counterOffers];
  if (!Number.isFinite(price) || !validPrices.includes(price)) {
    logErr('subscription_signup_link', `rejected — plan=${plan.id} price=${params.price ?? ''} is not a valid price`);
    return { error: `Price ${params.price ?? ''} is not a valid price for ${plan.name}` };
  }

  // Only prices actually quoted in this chat may be turned into an invite.
  const state = subscriptionState(chatPhone(context));
  if (!state.quoted.has(price)) {
    logErr('subscription_signup_link', `rejected — plan=${plan.id} price=${price} was never quoted in this chat`);
    return { error: `Price ${price} was not quoted in this chat. Call get_subscription_offer first.` };
  }

  const mealSelection = normalizeMealSelection(params.meal_selection);
  if (params.meal_selection && !mealSelection) {
    logErr('subscription_signup_link', `rejected — unknown meal_selection="${params.meal_selection}"`);
    return { error: `Unknown meal_selection: ${params.meal_selection}. Use comma-separated meals from breakfast, lunch, dinner, extra meal.` };
  }

  if (price < floorPrice) {
    logErr('subscription_signup_link', `rejected — plan=${plan.id} price ${price} is below the floor price`);
    return { error: `Price ${price} is below the floor price for ${plan.name}` };
  }

  const currency = rate.currency || config.currency;
  const secret = process.env.COOKCONNECT_BOT_SECRET;
  if (!secret) {
    logErr('subscription_signup_link', 'rejected — COOKCONNECT_BOT_SECRET is not set');
    return { error: 'Signup links are temporarily unavailable. Please contact the team.' };
  }

  const payload = {
    plan: plan.plan_slug || plan.id,
    price_cents: Math.round(price * 100),
    base_price_cents: Math.round(price * 100),
    meals_per_day: rate.meals_per_day,
    ...(mealSelection ? { meal_selection: mealSelection } : {}),
    expiresInDays: 14,
    locale: params.locale === 'ar' ? 'ar' : 'en',
  };

  let result;
  try {
    result = await apiRequest('/api/subscription-invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: payload,
      context,
    });
  } catch (error) {
    logErr('subscription_signup_link', `invite API failed error="${error.message}"`);
    return { error: `Could not create the signup link: ${error.message}` };
  }

  if (result?.dry_run || result?.simulated) {
    logErr('subscription_signup_link', 'invite API dry-run (simulated) — no link created');
    return { error: 'Signup links are disabled in simulation mode.' };
  }
  if (!result?.url) {
    logErr('subscription_signup_link', 'invite API returned no url');
    return { error: 'Could not create the signup link. Please contact the team.' };
  }

  logOp(
    'subscription_signup_link',
    `plan=${plan.id} price=${price} cents=${payload.price_cents} meals_per_day=${rate.meals_per_day} `
    + `meal_selection=${mealSelection || 'none'} locale=${payload.locale}`,
  );
  return {
    link: result.url,
    price,
    effective_price: typeof result.price_cents === 'number' ? result.price_cents / 100 : price,
    meals_per_day: rate.meals_per_day,
    meal_selection: mealSelection || undefined,
    total_meals: rate.total_meals,
    currency: result.currency || currency,
  };
}

async function search_menu(params = {}, context = {}) {
  const query = new URLSearchParams();
  const requestedLimit = params.limit || 10;
  const applyMealsOnly = params.meals_only === true && !params.category;
  const drinkCategories = new Set(['drinks', 'beverages', 'juice', 'smoothie']);

  if (params.search) query.set('search', params.search);
  if (params.category) query.set('category', params.category);
  if (params.min_cal != null) query.set('min_cal', params.min_cal);
  if (params.max_cal != null) query.set('max_cal', params.max_cal);
  if (params.min_price != null) query.set('min_price', params.min_price);
  if (params.max_price != null) query.set('max_price', params.max_price);
  if (params.sort) query.set('sort', params.sort);
  query.set('limit', applyMealsOnly ? 100 : requestedLimit);
  query.set('is_active', 'true');
  query.set('utm_source', UTM_SOURCE);
  query.set('utm_medium', UTM_MEDIUM);
  query.set('utm_campaign', 'menu_browse');

  const json = await apiRequest(`/api/recipe?${query.toString()}`, {
    base: API_BASE,
    context,
  });

  let meals = (json.data || []).filter((m) => m.is_active !== false);
  if (applyMealsOnly) {
    meals = meals.filter((m) => !drinkCategories.has(String(m.category || '').toLowerCase()));
  }

  return {
    total: json.total,
    meals: meals.slice(0, requestedLimit).map((m) => {
      const serving = m.servings?.[0] || {};
      const nutrition = serving.nutrition || {};
      return {
        id: m.id,
        name: m.name,
        category: m.category,
        description: m.description,
        price: serving.price,
        calories: serving.calories,
        protein: nutrition.protein_g,
        carbs: nutrition.carbs_g,
        fats: nutrition.fats_g,
      };
    }),
    browse_link: `${SITE_LINK}/menu?utm_source=whatsapp`,
  };
}

async function meal_category() {
  return {
    categories: [
      'beef', 'chicken', 'seafood', 'soup', 'biryani', 'risotto',
      'vegetable', 'breakfast', 'salad', 'rice-sides', 'platters',
      'pasta', 'wrap', 'pizza', 'burgers', 'desserts', 'drinks',
      'smoothie', 'juice', 'beverages',
    ],
  };
}

async function generate_order_link(params = {}, context = {}) {
  if (params.delivery_eligible !== true) {
    logErr('generate_order_link', 'rejected — not eligible for delivery (delivery_eligible !== true)');
    return { error: 'Not eligible for delivery — do not send any order link; restate the Ajman-only delivery area.' };
  }
  const ids = [...new Set(
    (Array.isArray(params.meal_ids) ? params.meal_ids : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];
  if (!ids.length) return { error: 'No meal UUIDs provided' };

  let recipes = [];
  try {
    const query = new URLSearchParams({
      ids: ids.join(','),
      is_active: 'true',
      limit: '100',
    });
    const result = await apiRequest(`/api/recipe?${query.toString()}`, {
      base: API_BASE,
      context,
    });
    recipes = Array.isArray(result?.data) ? result.data : [];
  } catch (error) {
    logErr('generate_order_link', `menu validation failed error="${error.message}"`);
    return { error: `Could not verify the selected meals: ${error.message}` };
  }

  const found = new Set(recipes.map((recipe) => recipe.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    logErr('generate_order_link', `rejected — unknown/inactive meal ids: ${missing.join(',')}`);
    return {
      error: `These meal IDs are not on the current menu: ${missing.join(', ')}. Call search_menu again and use only IDs it returns.`,
    };
  }

  const checkout_link = buildCatalogUrl(ids, true);
  logOp('generate_order_link', `checkout link built meals=${ids.length}`);
  return { checkout_link };
}

function chatPhone(context = {}) {
  return normalizePhone(String(context.phone || '').split('@')[0]);
}

// Latest confirmed order for this chat's phone number (existence scan).
// Returns the raw order row or null; throws on API failure.
async function fetchConfirmedOrder(phone, context = {}) {
  if (!phone) return null;
  const query = new URLSearchParams({ phone, status: 'confirmed', limit: '1' });
  const rows = await apiRequest(`/api/orders?${query.toString()}`, { context });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// PostGIS EWKB point (hex) → { lat, lng }. Returns null when absent/malformed.
function decodeLocation(hex) {
  if (typeof hex !== 'string' || hex.length < 18) return null;
  try {
    const buf = Buffer.from(hex, 'hex');
    if (buf.length < 21 || buf[0] !== 1) return null;
    const type = buf.readUInt32LE(1);
    if ((type & 0xff) !== 1) return null;
    const hasSrid = (type & 0x20000000) !== 0;
    const base = hasSrid ? 9 : 5;
    if (buf.length < base + 16) return null;
    const lat = buf.readDoubleLE(base);
    const lng = buf.readDoubleLE(base + 8);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function order_history(params = {}, context = {}) {
  const phone = chatPhone(context);
  if (!phone) {
    logErr('order_history', 'scan skipped — no phone number in chat context');
    return { error: 'No phone number is available for this chat' };
  }

  const started = Date.now();
  try {
    const order = await fetchConfirmedOrder(phone, context);
    const ms = Date.now() - started;
    if (!order) {
      logOp('order_history', `phone=${phone} → no confirmed order ms=${ms}`);
      return { has_existing_order: false };
    }
    logOp('order_history', `phone=${phone} → confirmed order found ms=${ms} name="${order.name || ''}" mobile="${order.mobile_number || ''}" address="${order.address || ''}"`);
    return {
      has_existing_order: true,
      name: order.name || '',
      mobile_number: order.mobile_number || '',
      address: order.address || '',
    };
  } catch (error) {
    logErr('order_history', `phone=${phone} → lookup failed ms=${Date.now() - started} error="${error.message}"`);
    return { error: `Order lookup failed: ${error.message}` };
  }
}

async function create_order(params = {}, context = {}) {
  const items = Array.isArray(params.items) ? params.items.filter(Boolean) : [];
  if (!items.length) {
    logErr('create_order', 'rejected — no items provided');
    return { error: 'At least one item is required' };
  }
  for (const item of items) {
    if (!item.recipe_id || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 100) {
      logErr(`create_order`, `rejected — invalid item recipe_id="${item.recipe_id || ''}" qty=${item.qty}`);
      return { error: 'Each item needs a recipe_id (meal UUID) and a qty between 1 and 100' };
    }
  }

  const phone = chatPhone(context);
  let saved = null;
  const lookupStarted = Date.now();
  try {
    saved = await fetchConfirmedOrder(phone, context);
    logOp('create_order', `saved-details lookup phone=${phone || 'none'} → ${saved ? 'confirmed order found' : 'none'} ms=${Date.now() - lookupStarted}`);
  } catch (error) {
    logErr('create_order', `saved-details lookup phone=${phone || 'none'} → failed ms=${Date.now() - lookupStarted} error="${error.message}" — order NOT created`);
    return { error: `Could not check saved order details: ${error.message}` };
  }

  const name = String(saved?.name || '').trim() || String(params.name || '').trim();
  const mobileNumber =
    String(saved?.mobile_number || '').trim() ||
    String(params.mobile_number || '').trim() ||
    (phone ? `+${phone}` : '');
  const address = String(params.address || '').trim() || String(saved?.address || '').trim();

  if (!name || !address) {
    logErr(`create_order`, `rejected — missing ${!name ? 'name' : ''}${!name && !address ? ' and ' : ''}${!address ? 'address' : ''} (saved=${Boolean(saved)})`);
    return {
      error: saved
        ? 'The saved order is missing a name or delivery address. Ask the customer for the missing detail and call create_order again with it.'
        : 'No saved order details for this number. Call generate_order_link instead',
    };
  }

  const headers = { 'Content-Type': 'application/json' };
  const secret = process.env.COOKCONNECT_BOT_SECRET;
  if (secret) headers['x-bot-secret'] = secret;
  else logErr('create_order', 'COOKCONNECT_BOT_SECRET is not set — order will not be tagged origin=whatsapp');

  const payload = {
    name,
    email: String(params.email || '').trim() || String(saved?.email || '').trim() || '',
    mobile_number: mobileNumber,
    address,
    location: decodeLocation(saved?.location),
    shipping_cents: 0,
    items: items.map((item) => ({
      recipe_id: item.recipe_id,
      addon_recipe_id: item.addon_recipe_id || null,
      qty: item.qty,
      note: item.note || null,
    })),
  };

  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  logOp(
    'create_order',
    `details: name_from=${saved?.name ? 'saved' : 'params'} mobile_from=${saved?.mobile_number ? 'saved' : params.mobile_number ? 'params' : 'chat'} `
    + `address_from=${params.address ? 'params' : saved?.address ? 'saved' : 'none'} has_location=${Boolean(payload.location)} `
    + `items=${items.length} total_qty=${totalQty} secret=${Boolean(secret)} reused_saved_details=${Boolean(saved)}`
  );

  const postStarted = Date.now();
  try {
    const created = await apiRequest('/api/orders', {
      method: 'POST',
      headers,
      body: payload,
      context,
    });
    if (created?.dry_run) {
      logOp('create_order', 'POST dry-run (simulated) — no order created');
      return { success: true, simulated: true, dry_run: true };
    }
    logOp('create_order', `order created id=${created?.id} status=${created?.status} ms=${Date.now() - postStarted} reused_saved_details=${Boolean(saved)}`);
    return {
      success: true,
      order_id: created?.id,
      status: created?.status,
      reused_saved_details: Boolean(saved),
    };
  } catch (error) {
    logErr('create_order', `POST failed ms=${Date.now() - postStarted} error="${error.message}"`);
    return { error: `Order creation failed: ${error.message}` };
  }
}

const TOOL_EXECUTORS = {
  get_current_time,
  get_delivery_areas,
  get_subscription_plans,
  get_subscription_offer,
  subscription_signup_link,
  search_menu,
  meal_category,
  generate_order_link,
  order_history,
  create_order,
};

async function executeTool(name, params, context = {}) {
  const fn = TOOL_EXECUTORS[name];
  if (!fn) {
    logErr('tool', `op=${name} status=unknown_tool chat=${context.phone || 'none'}`);
    return { error: `Unknown tool: ${name}` };
  }

  const started = Date.now();
  try {
    const result = await fn(params, context);
    const ms = Date.now() - started;
    if (result?.error) logErr('tool', `op=${name} status=error ms=${ms} chat=${context.phone || 'none'} error="${result.error}"`);
    else logOp('tool', `op=${name} status=ok ms=${ms} chat=${context.phone || 'none'}`);
    return result;
  } catch (error) {
    logErr('tool', `op=${name} status=throw ms=${Date.now() - started} chat=${context.phone || 'none'} error="${error.message}"`);
    throw error;
  }
}

module.exports = {
  executeTool,
  getQuotedSubscriptionPrices,
  getSubscriptionPriceRanges,
  getLastSubscriptionOffer,
};
