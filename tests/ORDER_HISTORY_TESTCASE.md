# ORDER_HISTORY_TESTCASE — Module 1: `order_history` scan tool

Manual QA. Run against the simulator (`POST localhost:3001/simulate`) or
`node test-prompt.js`, with `COOKCONNECT_API_URL` pointing at a backend that has
orders for the test number (at least one `confirmed`, plus newer non-confirmed
ones to prove the status filter).

Legend: `[S]` simulator · `[T]` test-prompt · `[O]` server/API observation

## H1 — Phone plumbing (context, not model)

- Action: `[S]` Message from a number that has a confirmed order that triggers the
  scan (e.g. "do I have an existing order?").
- Expect: `[O]` Backend receives `GET /api/orders?phone=<digits>` where `<digits>`
  are the sender's normalized digits (e.g. `971508320025`) — never a number the
  LLM wrote into tool arguments.
- Action: `[S]` Repeat from a `05…`-style number with `DEFAULT_COUNTRY_CODE=971`.
- Expect: `[O]` Query uses `971…` digits (leading `0` normalized).
- Action: `[T]` `executeTool('order_history', {}, {})` with no `phone` in context.
- Expect: `{ error: 'No phone number is available for this chat' }`, no fetch.

## H2 — Hardcoded limit + status filter

- Action: `[O]` Inspect the request made by `order_history`.
- Expect: Query always contains `status=confirmed` and `limit=1`; the tool schema
  exposes no parameters to the model.
- Action: `[S]` Scan from a number whose newest order is `ready_for_pickup` with
  NO confirmed order.
- Expect: `has_existing_order: false`; the ready_for_pickup order is NOT returned.

## H3 — Output whitelist (what the AI may see)

- Action: `[S]/[T]` Scan from a number WITH a confirmed order.
- Expect: Response contains exactly: `has_existing_order: true`, `name`,
  `mobile_number`, `address` — and nothing else (no items, prices, order id,
  status, email, or map coordinates).
- Expect: The three values match the stored confirmed order; the bot can read them
  back to the customer for confirmation.

## H4 — No confirmed order

- Action: `[S]` Scan from a number with only non-confirmed (e.g. `inquiry`) orders.
- Expect: `{ has_existing_order: false }` only — no detail fields present.

## H5 — API failures

- Action: `[O]` Backend returns 500 / unreachable.
- Expect: `{ error: … }` returned to the model; conversation continues with an
  honest reply, no crash, no stack trace shown to the user.
