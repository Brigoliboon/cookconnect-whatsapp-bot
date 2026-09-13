# Dynamic Ordering — Catalog Links

Personal checkout links encode the chosen meal UUIDs in the URL. The website
opens the catalog with those meals preloaded in checkout mode.

## URL format

```
{SITE_LINK}/catalog?ids={b64}&checkout=true
```

- `ids` — URI-encoded base64 of a JSON UUID array, e.g.
  `["ac78a36b-...", "2f21ab25-...", "51bfec1f-..."]`
- `checkout=true` — opens checkout mode directly

## Util (`lib/catalog.js`)

```js
const { encodeMealIds, decodeMealIds, buildCatalogUrl } = require('./lib/catalog');

encodeMealIds(['uuid-1', 'uuid-2']); // → URI-safe base64 string
decodeMealIds(encoded);              // → ['uuid-1', 'uuid-2']
buildCatalogUrl(ids, true);          // → full checkout URL (SITE_LINK based)
```

## Bot tool (`generate_order_link`)

The AI passes **raw UUIDs** from `search_menu` results — never base64.
Encoding happens deterministically in the executor:

```js
await executeTool('generate_order_link', { meal_ids: ['uuid-1', 'uuid-2'] });
// → { checkout_link: 'https://cookconnect.vercel.app/catalog?ids=...&checkout=true' }
```

## Bot flow (`whatsapp-system-context.xml`)

1. Browse → generic link `/#meals`
2. User commits to specific meals → collect UUIDs → `generate_order_link`
3. Send the personal checkout link — payment happens on the website, never in chat
