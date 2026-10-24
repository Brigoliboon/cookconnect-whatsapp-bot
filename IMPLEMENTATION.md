# IMPLEMENTATION.md — CookConnect WhatsApp Bot

Source of truth for module breakdown, scope, and progress.
Newest module work is listed last; mark checkpoints only after lint + QA pass.

## Feature: Direct Order via Existing Customer Scan

Let the bot place an order directly in chat (POST /api/orders, origin `whatsapp`)
for customers who already have a confirmed order, reusing their saved details
(name, address, location, phone) instead of collecting them again.

**Decisions (finalized):**
- Existing order = latest order with `status: "confirmed"` for the chat's phone number.
- Reuse scope = customer details ONLY (name / mobile_number / address / location).
  Items are always chosen fresh in the chat from the menu — never copied from history.
- What the AI sees: `order_history` returns ONLY `has_existing_order`, `name`,
  `mobile_number`, `address` — no items, prices, order id, status, or coordinates.
- Who fills the details: `create_order` reuses the saved details itself (tool-side);
  the AI passes items only. Exceptions: `address` may be passed when the customer
  explicitly wants a new one; `name`/`mobile_number`/`address` are passed only for
  customers with no saved order. There is no `location` parameter at all.
- Items contract = server-authoritative: each item is only
  `{ recipe_id, qty (1–100), addon_recipe_id?, note? }` — the backend resolves
  meal name, price, and image from `recipe_id` (must be an active recipe).
- Testing = manual QA (markdown testcase + simulator / `test-prompt.js`), matching the
  repo's existing `qa-reports/` convention. No automated test framework is added.
- UI/UX, color palette, branding = N/A (backend/tool module, no UI surface).

## Architecture / Flow

```
WhatsApp message
  └─ src/index.js        key = sender digits (getNumber / normalizePhone)
       └─ askModel({ text, history, simulated, phone })      [Module 1]
            └─ executeTool(name, params, { simulated, phone })
                 ├─ order_history  → GET  /api/orders?phone=…&status=confirmed&limit=1
                 └─ create_order   → POST /api/orders  (x-bot-secret → origin "whatsapp")
```

- Phone never comes from the LLM — it is injected via tool `context` (no hallucination).
- Backend GET matches `phone` with `ilike %phone%`; normalized digits (`97150…`) match
  the stored `+97150…`.
- GET returns a plain array, newest first (`created_at` desc), already limited by
  `?limit=1`.
- GET `location` is a PostGIS EWKB hex string; `create_order` decodes it to
  `{ lat, lng }` itself (never exposed to the AI).
- POST is server-authoritative: items carry only `recipe_id` / `addon_recipe_id` /
  `qty` / `note`; meal name, price, and image are resolved by the backend.
- Mutating tool calls keep the existing simulator dry-run semantics
  (`apiRequest` logs non-GET calls instead of executing when `simulated` and no
  `SIMULATOR_API_URL`).
- Observability: every operation logs one timestamped line per step —
  `[api]` (HTTP method, URL, status, ms), `[tool]` (dispatcher entry/exit with
  duration + chat phone), `[order_history]` (scan result), `[create_order]`
  (lookup, detail sources, payload summary, creation result). Errors go to
  `console.error`; the bot secret is never printed.

## Modules

### Module 1 — `order_history` scan tool (+ phone context plumbing)

Requirements:
- Pass the sender's phone number through: `src/index.js` → `askModel({ phone })` →
  `executeTool(…, { simulated, phone })`. Normalize with the existing
  `normalizePhone` (`lib/simulated-numbers.js`).
- New tool schema in `lib/tools.js`: `order_history`, no parameters (phone comes
  from context; the model supplies nothing).
- New handler in `lib/tool-executor.js`:
  - `GET ${COOKCONNECT_API_URL}/api/orders?phone=<digits>&status=confirmed&limit=1`
  - `limit=1` is hardcoded — this is an existence scan, not a history listing.
  - Missing phone in context → `{ error: … }`, never a guess.
  - Response whitelist: `{ has_existing_order: true, name, mobile_number, address }`
    or `{ has_existing_order: false }` — nothing else reaches the AI.
  - API failure → `{ error: … }` (no throw).

Checkpoints:
- [x] `lib/tools.js` — `order_history` schema added (no parameters)
- [x] `lib/tool-executor.js` — handler + registry entry + shared `fetchConfirmedOrder`
- [x] `src/index.js` + `lib/llm/index.js` — phone plumbed into tool context
- [x] `node --check` passes on all touched files
- [ ] `tests/ORDER_HISTORY_TESTCASE.md` — all cases pass (manual QA)

### Module 2 — `create_order` tool + prompt flow + docs

Requirements:
- New tool schema in `lib/tools.js`: `create_order` with `required: ['items']`;
  each item `{ recipe_id*, qty* (1–100), addon_recipe_id?, note? }`. Optional
  top-level: `name`, `mobile_number`, `address`, `email` (fallbacks for customers
  with no saved order / explicit address change). No `location`, no
  `shipping_cents`, no per-item name/price/image.
- New handler in `lib/tool-executor.js`:
  - Validates items locally (recipe_id + qty 1–100) → `{ error }`, no API call.
  - Re-fetches the saved confirmed order itself (`fetchConfirmedOrder`); on lookup
    failure it errors out instead of creating an order.
  - Detail precedence: `name` → saved first, then param; `mobile_number` → saved →
    param → `+<chat phone>`; `address` → param (explicit change) → saved;
    `location` → decoded from saved EWKB only (`decodeLocation`, malformed → null).
  - Missing name/address with no saved details → `{ error }` telling the AI what
    to collect.
  - `POST ${COOKCONNECT_API_URL}/api/orders` with `Content-Type: application/json`
    and `x-bot-secret: <COOKCONNECT_BOT_SECRET>` (must equal backend
    `WHATSAPP_BOT_SECRET`) → backend tags `origin: "whatsapp"`; secret missing →
    console warning, order still sent (untagged).
  - Payload: `{ name, email, mobile_number, address, location, shipping_cents: 0,
    items: [{ recipe_id, addon_recipe_id, qty, note }] }`.
  - Simulator mode → existing dry-run (no real order created during QA).
  - Success → `{ success, order_id, status, reused_saved_details }`; failure →
    `{ error }`.
- `whatsapp-system-context.xml` — `<direct_order>` flow rules:
  - Call `order_history` first; if found, read back saved name/mobile/address for
    confirmation, pick items via `search_menu`, then `create_order` with items ONLY.
  - Different address → pass items + only the new address.
  - Not found → collect name + address in chat first, then pass them with items.
  - Never call `create_order` before explicit customer confirmation.
- Docs: `features.md` checklist, `README.md` tool list + `COOKCONNECT_BOT_SECRET`
  note (must match backend `WHATSAPP_BOT_SECRET`).

Checkpoints:
- [x] `lib/tools.js` — `create_order` schema added (items-only contract)
- [x] `lib/tool-executor.js` — handler + registry entry + secret header + EWKB decode
- [x] `whatsapp-system-context.xml` — `<direct_order>` flow rules
- [x] `features.md` + `README.md` updated
- [x] `node --check` passes on all touched files
- [x] Detailed operation logging (`[api]` / `[tool]` / `[order_history]` / `[create_order]`)
- [ ] `tests/CREATE_ORDER_TESTCASE.md` — all cases pass (incl. simulator dry-run)

## Feature: Checkout Link Hardening (Oct 25)

Ticket: make checkout links unforgeable end-to-end + 3 prompt fixes.

**Changes:**
- `generate_order_link` requires a boolean `delivery_eligible`; the executor
  returns `{ error: 'Not eligible for delivery — …' }` (no link) unless it is
  strictly `true`.
- `lib/llm/index.js` reply guard: tracks checkout links returned by
  `generate_order_link` during the turn; before the reply is returned, any
  cookconnectae.com URL that looks like an order link (`/checkout`, `items=`,
  `ids=`, `checkout=true`) and is not exactly a tool-built link this turn is
  removed (logged via `[reply_guard]` warning). The plain
  `/menu?utm_source=whatsapp` browse link is allowed.
- Prompt (`whatsapp-system-context.xml`, merged into existing bullets, 0 net
  lines): pass `delivery_eligible` honestly / no link when false; 1–100 qty cap
  only for `create_order` (checkout-link orders: any qty > 0, set in cart);
  say the exact dish isn't available then offer the closest real match; order
  tracking → support contact, never "note"/look up an order number.

Checkpoints:
- [x] `lib/tools.js` — `delivery_eligible` required boolean param
- [x] `lib/tool-executor.js` — eligibility gate before building the link
- [x] `lib/llm/index.js` — per-turn link allowlist + strip + warn
- [x] `whatsapp-system-context.xml` — 4 clauses merged, size unchanged (143 lines)
- [x] `node --check` on all touched files
- [x] Acceptance script: ineligible → error/no link; invented `/checkout?items=` stripped; tool-built `/menu?ids=` + plain menu link pass through

**Follow-up QA (same day):**
- Reply guard now also trusts catalog links found in prior tool results / prior
  assistant history (so "send link again" re-sends survive), while `/checkout`
  and `items=` URLs are always stripped; a removed link that leaves a dangling
  lead-in ("Here it is:") gets "— I'll resend the link in a moment." Prompt
  additionally requires calling generate_order_link again on any resend.
- Prompt: off-menu dish rule extended to ordering; pause requests → team/support
  contact, never an invented website link; Arabic complaint order-number wording
  fixed ("ممكن ترسل لي رقم الطلب؟").

**Direction change (Boon):** link/order enforcement moved from code to prompt —
the reply guard in `lib/llm/index.js` is removed (plain
`return sanitizeWhatsApp(reply)`); the `<ordering>` section is a single
explicit rule block (link/order gating, browse-link-only rule, chat-claim
injection rule). The `delivery_eligible` param + executor check stay in code.

## QA Strategy (manual)

1. `node --check` on every touched file (repo has no linter configured).
2. Module testcase files under `tests/` — Action/Expect style, run via:
   - Simulator: `POST localhost:3001/simulate` with a number that has / hasn't a
     confirmed order (`SIMULATOR_API_URL` unset ⇒ POST dry-run).
   - `node test-prompt.js` for prompt-only checks.
3. Log findings in `qa-reports/` per existing convention.

## Environment

| Var | Used by | Notes |
|---|---|---|
| `COOKCONNECT_API_URL` | both tools | backend base (default `http://localhost:3000`) |
| `COOKCONNECT_BOT_SECRET` | `create_order` | sent as `x-bot-secret`; must equal backend `WHATSAPP_BOT_SECRET` |
| `DEFAULT_COUNTRY_CODE` | phone normalize | default `971` |
| `SIMULATOR_API_URL` | both tools | optional simulator base; unset ⇒ POST dry-run |

## Progress

| Module | Status | Testcase |
|---|---|---|
| M1 — `order_history` scan tool | 🟡 implemented, QA pending | `tests/ORDER_HISTORY_TESTCASE.md` |
| M2 — `create_order` tool + prompt flow | 🟡 implemented, QA pending | `tests/CREATE_ORDER_TESTCASE.md` |
