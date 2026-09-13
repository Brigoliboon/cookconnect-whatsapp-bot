const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date and time in UAE (Asia/Dubai timezone)',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_delivery_areas',
      description: 'Get the list of areas where CookConnect delivers. Returns delivery coverage information.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_subscription_plans',
      description: 'Get all available subscription meal plans with their details',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_menu',
      description: 'Search meals by name, category, or ingredients. Returns price, calories, macros, and allergens.',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Partial name or ingredient match (e.g. "chicken", "salmon salad")',
          },
          category: {
            type: 'string',
            description: 'Exact category match (e.g. "chicken", "beef", "seafood", "salad")',
          },
          min_cal: {
            type: 'number',
            description: 'Minimum calories filter',
          },
          max_cal: {
            type: 'number',
            description: 'Maximum calories filter',
          },
          min_price: {
            type: 'number',
            description: 'Minimum price filter (AED)',
          },
          max_price: {
            type: 'number',
            description: 'Maximum price filter (AED)',
          },
          sort: {
            type: 'string',
            enum: ['name', 'name_desc', 'calories', 'calories_desc', 'price', 'price_desc'],
            description: 'Sort results by name, calories, or price (ascending or descending)',
          },
          limit: {
            type: 'number',
            description: 'Number of results to return (1-100, default 10)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'meal_category',
      description: 'Get all available meal categories to browse by.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_order_link',
      description: 'Build a personal catalog checkout link for the exact meals the user chose. Call with the meal UUIDs from the menu lookup results. Never hand-craft the link or encoding yourself.',
      parameters: {
        type: 'object',
        properties: {
          meal_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Meal UUIDs the user wants to order (from search_menu results)',
          },
        },
        required: ['meal_ids'],
      },
    },
  },
];

module.exports = { TOOLS };
