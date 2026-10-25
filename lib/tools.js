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
      description: 'Get all available subscription meal plans with their details (list prices, meal rules, commitment, concessions)',
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
      name: 'get_subscription_offer',
      description: 'Get the subscription price you may quote for a plan. Call this for every price you quote or counter-offer on a subscription; never quote a subscription price that this tool didn\'t return; increase counter_number by 1 only when the customer pushes back on price. counter_number 0 is the opening (list) price.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: {
            type: 'string',
            description: 'Plan id from get_subscription_plans (e.g. "standard-15", "healthy")',
          },
          counter_number: {
            type: 'integer',
            description: '0 = opening offer (list price), 1..N = the Nth counter-offer; out-of-range or negative values are treated as 0 or clamped to the floor price',
          },
        },
        required: ['plan_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'subscription_signup_link',
      description: 'Build a WhatsApp signup link for a subscription at an agreed price (and optional concession) after the customer confirms. Only pass a price returned by get_subscription_offer.',
      parameters: {
        type: 'object',
        properties: {
          plan_id: {
            type: 'string',
            description: 'Plan id from get_subscription_plans (e.g. "standard-15", "healthy")',
          },
          price: {
            type: 'number',
            description: 'The agreed price — must be a price returned by get_subscription_offer (list price or a counter-offer)',
          },
          concession_id: {
            type: 'string',
            description: 'Optional concession id from get_subscription_plans concessions (e.g. "bonus_meal", "first_week_discount")',
          },
        },
        required: ['plan_id', 'price'],
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
          meals_only: {
            type: 'boolean',
            description: 'exclude drink categories (drinks, beverages, juice, smoothie); use for questions about meals/food/dishes, e.g. cheapest meal',
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
          delivery_eligible: {
            type: 'boolean',
            description: 'true unless the customer already stated an address/area outside Ajman; pass false only then — no link is built, the Ajman-only delivery area is restated',
          },
        },
        required: ['meal_ids', 'delivery_eligible'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'order_history',
      description: 'Check whether this customer already has a confirmed order. Call this before taking a direct order in chat. It uses the chat phone number automatically and returns only the saved delivery details when one exists.',
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
      name: 'create_order',
      description: 'Place an order directly for this customer (ONLY if there is an order history). Saved details from their confirmed order (name, mobile number, address, map location) are reused automatically by the tool — never copy them into the arguments.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'The meals the customer confirmed for this order. The server resolves names, prices, and images from the recipe UUID.',
            items: {
              type: 'object',
              properties: {
                recipe_id: { type: 'string', description: 'Meal UUID from search_menu results' },
                addon_recipe_id: { type: 'string', description: 'Addon UUID when an addon was chosen' },
                qty: { type: 'integer', description: 'Quantity (1-100)' },
                note: { type: 'string', description: 'Item note, e.g. "extra spicy"' },
              },
              required: ['recipe_id', 'qty'],
            },
          },
          name: {
            type: 'string',
            description: 'Only when the customer has no saved order — their name as they want it on the order',
          },
          address: {
            type: 'string',
            description: 'Only when the customer explicitly wants a different delivery address this time, or has no saved order',
          },
          mobile_number: {
            type: 'string',
            description: 'Only when the customer has no saved order; otherwise the chat number is used automatically',
          },
          email: {
            type: 'string',
            description: 'Optional; only if the customer provides an email',
          },
        },
        required: ['items'],
      },
    },
  },
];

module.exports = { TOOLS };
