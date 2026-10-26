# CREATE_ORDER_TESTCASE — Module 2: `create_order` tool + prompt flow

Manual QA. `[S]` simulator · `[T]` test-prompt · `[O]` server/API observation ·
`[W]` live WhatsApp. Keep `SIMULATOR_API_URL` unset for dry-run cases.

## C1 — Schema & validation

- Action: `[T]` `create_order` with `items: []` / missing `items`.
- Expect: `{ error: … }` locally; NO request reaches `POST /api/orders`.
- Action: `[T]` Item missing `recipe_id`, or `qty` not an integer 1–100.
- Expect: `{ error: … }` locally; no request sent.
- Expect: Each sent item contains ONLY `recipe_id`, `qty`, and optional
  `addon_recipe_id` / `note` — no name, price, or image (server resolves them
  from the recipe UUID).
- Expect: Schema requires only `items` — `name`, `mobile_number`, `address`,
  `email` are optional fallbacks; there is NO parameter for `location` or
  `shipping_cents` (the AI never decides those).

## C2 — Bot secret → origin whatsapp

- Action: `[O]` Valid call with `COOKCONNECT_BOT_SECRET` set (equal to backend
  `WHATSAPP_BOT_SECRET`).
- Expect: Request header `x-bot-secret` present + `Content-Type: application/json`;
  created order has `origin: "whatsapp"`, HTTP 201.
- Action: `[O]` Call with the secret unset.
- Expect: Bot logs a `COOKCONNECT_BOT_SECRET is not set` warning; request sent
  WITHOUT the header; backend falls back to non-whatsapp origin (config error
  visible in logs, ordering still works).

## C3 — Saved details reused BY THE TOOL (core)

- Action: `[T]/[O]` Number WITH a confirmed order (name `Mishka`,
  `+971508320025`, Ajman address, EWKB location
  `0101000020E6100000BA380F80C2C24B40EEF5602E87653940`) → `create_order` with
  items ONLY (no name/mobile/address args).
- Expect: `[O]` Payload carries the SAVED `name`, `mobile_number`, `address` and
  `location: { lat: ~25.4052, lng: ~55.4333 }` — decoded server-side by the tool;
  the AI never sees or passes coordinates.
- Expect: `[O]` Payload items are trimmed to
  `{ recipe_id, addon_recipe_id, qty, note }` (+ `shipping_cents: 0` at top level);
  no `name`/`unit_price_cents`/`image_path` per item.
- Expect: `[O]` Backend accepts the payload (201) and resolves meal name/price
  from `recipe_id` (server-authoritative).
- Expect: Response includes `reused_saved_details: true`.
- Action: `[T]` Same call but the model hallucinates a different `name` /
  `mobile_number`.
- Expect: `[O]` Saved values still win in the payload (tool decides, not the AI).
- Action: `[T]` Customer explicitly wants a new address → model passes `address`
  (items + new address only).
- Expect: `[O]` New `address` used; saved `name`/`mobile_number` unchanged.

## C4 — New customer (no saved order)

- Action: `[T]` No confirmed order; `create_order` with items but no `name`.
- Expect: `{ error: … }` telling the AI to collect name + address first; no POST.
- Action: `[T]` Items + `name` + `address` provided; `context.phone = 971508320025`.
- Expect: `[O]` Payload `mobile_number = "+971508320025"` (context default),
  `location: null`, `reused_saved_details: false`.
- Action: `[T]` Saved order exists but is missing name/address and the model
  provides nothing.
- Expect: `{ error: … }` asking for the missing detail.

## C5 — Simulator dry-run (no real order)

- Action: `[S]` Full chat flow in simulator mode, `SIMULATOR_API_URL` unset.
- Expect: Log `[simulator dry-run] POST …/api/orders`; tool returns
  `{ success: true, simulated: true, dry_run: true }`; NO row created in backend.
- Action: `[S]` Same with `SIMULATOR_API_URL` set.
- Expect: Request goes to the simulator base instead of `COOKCONNECT_API_URL`.

## C6 — End-to-end flow: existing customer

- Action: `[S]/[W]` Customer with a confirmed order says "I want to order
  Grilled Beef Steak".
- Expect: Bot calls `order_history` FIRST, reads back saved name/mobile/address
  for confirmation, picks items via `search_menu`, gets explicit confirmation,
  then calls `create_order` with items ONLY.
- Expect: `[O]` Created order carries the reused details + map location; items are
  the freshly chosen ones; response `success: true` with `order_id`.
- Action: `[W]` Customer changes the address before confirming.
- Expect: Only the new address is passed; order created with it.

## C7 — End-to-end flow: new customer

- Action: `[S]` Number with NO confirmed order says "I want to order".
- Expect: `order_history` → `has_existing_order: false`; bot collects name +
  address in chat; `create_order` only after explicit confirmation; no guessed
  details, no order before confirmation.

## C8 — Guardrails & errors

- Action: `[S]` "Just order it" without item/details confirmation.
- Expect: Bot does NOT call `create_order`; it confirms first (prompt rule).
- Action: `[O]` Backend returns 400/500 on POST, and separately GET fails during
  the saved-details lookup.
- Expect: `{ error: … }` to the model in both cases; bot apologizes / gives
  +971563356051; no crash; no order created when the lookup fails.

## C9 — Docs

- Action: Review `whatsapp-system-context.xml`, `features.md`, `README.md`.
- Expect: `<direct_order>` flow documented (scan → confirm → items-only create);
  `COOKCONNECT_BOT_SECRET` ↔ backend `WHATSAPP_BOT_SECRET` noted; tool list
  includes `order_history` and `create_order`.

## L1 — Operation logs (both tools)

Every log line is timestamped ISO + scope, e.g.
`2026-10-24T18:00:00.000Z [order_history] phone=971… → confirmed order found ms=42 …`.
Secret values are never printed.

- Action: `[S]` Run an `order_history` scan (found and not-found).
- Expect: `[api] GET /api/orders?phone=…&status=confirmed&limit=1 → 200 ms=…`
  and `[order_history] phone=… → confirmed order found|no confirmed order ms=…`
  with name/mobile/address in the "found" line.
- Action: `[S]` Run `create_order` in dry-run, then (if possible) a real call.
- Expect: `[create_order]` logs, in order: saved-details lookup result →
  details sources (`name_from`, `mobile_from`, `address_from`, `has_location`,
  `items`, `total_qty`, `secret`, `reused_saved_details`) →
  `[api] POST … → status ms=…` → `order created id=… status=…` (or
  `POST dry-run (simulated) — no order created`).
- Action: `[T]` Trigger validation failures (no items; bad qty; missing details).
- Expect: `[create_order] rejected — …` error lines; nothing sent.
- Action: Any tool call, success or failure.
- Expect: A dispatcher line `[tool] op=<name> status=ok|error|throw ms=… chat=<phone>`;
  `x-bot-secret` value never appears in any log.
