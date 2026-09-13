const { buildCatalogUrl } = require('./catalog');

const SITE_LINK = process.env.SITE_LINK || 'https://cookconnect.vercel.app';
const API_BASE = process.env.API_BASE || 'https://cookconnect.vercel.app';
const UTM_SOURCE = process.env.UTM_SOURCE || 'whatsapp_bot';
const UTM_MEDIUM = process.env.UTM_MEDIUM || 'chatbot';

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

async function get_subscription_plans() {
  return {
    plans: [
      { id: 'standard-15', name: '15-Day Meal Plan', type: 'standard', duration: '15 days' },
      { id: 'standard-20', name: '20-Day Meal Plan', type: 'standard', duration: '20 days' },
      { id: 'standard-26', name: '26-Day Meal Plan', type: 'standard', duration: '26 days' },
      { id: 'standard-45', name: '45-Day Meal Plan', type: 'standard', duration: '45 days' },
      { id: 'healthy', name: 'Healthy Diet Plan', type: 'healthy', duration: '30 days', recommended: true },
    ],
    note: 'Contact sales at +971556634050 for pricing and customization.',
  };
}

async function search_menu(params = {}) {
  const url = new URL('/api/recipe', API_BASE);

  if (params.search) url.searchParams.set('search', params.search);
  if (params.category) url.searchParams.set('category', params.category);
  if (params.min_cal != null) url.searchParams.set('min_cal', params.min_cal);
  if (params.max_cal != null) url.searchParams.set('max_cal', params.max_cal);
  if (params.min_price != null) url.searchParams.set('min_price', params.min_price);
  if (params.max_price != null) url.searchParams.set('max_price', params.max_price);
  if (params.sort) url.searchParams.set('sort', params.sort);
  url.searchParams.set('limit', params.limit || 10);
  url.searchParams.set('utm_source', UTM_SOURCE);
  url.searchParams.set('utm_medium', UTM_MEDIUM);
  url.searchParams.set('utm_campaign', 'menu_browse');

  const response = await fetch(url.toString());

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API returned ${response.status}: ${body}`);
  }

  const json = await response.json();
  return {
    total: json.total,
    meals: (json.data || []).map((m) => {
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
    browse_link: `${SITE_LINK}/#meals`,
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

async function generate_order_link(params = {}) {
  const ids = Array.isArray(params.meal_ids) ? params.meal_ids.filter(Boolean) : [];
  if (!ids.length) return { error: 'No meal UUIDs provided' };
  return { checkout_link: buildCatalogUrl(ids, true) };
}

const TOOL_EXECUTORS = {
  get_current_time,
  get_delivery_areas,
  get_subscription_plans,
  search_menu,
  meal_category,
  generate_order_link,
};

async function executeTool(name, params) {
  const fn = TOOL_EXECUTORS[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  return fn(params);
}

module.exports = { executeTool };
