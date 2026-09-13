# CookConnect WhatsApp Bot

WhatsApp chatbot for CookConnect (meal-plan platform, Ajman UAE). Built on
Baileys (linked-device session), answers via OpenRouter with tool calling,
and sends order/subscription reminders polled from the website API.

## Run

```bash
npm install
cp .env.example .env   # then fill in keys
node src/index.js
```

Scan the QR code via WhatsApp → Linked devices. Session persists in `auth/`.
Test prompts without WhatsApp: `node test-prompt.js` (`clear` resets history).

## Env variables

| Name | Required | Default | Purpose |
|---|---|---|---|
| `OPENROUTER_API_KEY` | yes | — | AI model access |
| `OPENROUTER_MODEL` | no | `openai/gpt-4o-mini` | Model id (`openrouter/free` routes free models) |
| `OPENROUTER_BASE_URL` | no | `https://openrouter.ai/api/v1` | API endpoint |
| `OPENROUTER_SITE_URL` | no | — | `HTTP-Referer` header |
| `OPENROUTER_APP_NAME` | no | — | `X-Title` header |
| `COOKCONNECT_API_URL` | for reminders | `http://localhost:3000` | Website API base |
| `COOKCONNECT_BOT_SECRET` | for reminders | — | `x-bot-secret` auth header |
| `DEFAULT_COUNTRY_CODE` | no | `971` | Prefix for `0...` local numbers (`63` for PH testing) |
| `SITE_LINK` | no | `https://cookconnect.vercel.app` | Links sent to users |
| `API_BASE` | no | `https://cookconnect.vercel.app` | Menu API base |
| `UTM_SOURCE` / `UTM_MEDIUM` | no | `whatsapp_bot` / `chatbot` | Tracking on menu API calls |
| `AUTH_DIR` | no | `./auth` | Session storage (never delete while running) |
| `LOG_LEVEL` | no | `info` | Baileys log level (`silent` recommended) |
| `BOT_NAME` | unused | — | Legacy, ignored |
| `OPENROUTER_SYSTEM_PROMPT` | unused | — | Legacy — prompt now loads from `whatsapp-system-context.xml` |

## How it works

- `src/index.js` — socket, per-user message queues (concurrent across users,
  ordered per user), history keyed by phone number.
- `whatsapp-system-context.xml` — the whole brain: identity, role,
  responsibilities, response behavior, constraints, plans, policies. Reloaded
  on every request, so edits apply without restart.
- `lib/tools.js` + `lib/tool-executor.js` — tool definitions and implementations:
  `search_menu`, `meal_category`, `generate_order_link`, `get_subscription_plans`,
  `get_delivery_areas`, `get_current_time`.
- `lib/catalog.js` — meal-UUID base64 encode/decode + checkout URL builder.
  The AI passes raw UUIDs; encoding stays in code (see `CATALOG.md`).
- `lib/reminder-poller.js` — 60s tick over `GET /api/whatsapp-reminder`,
  sends template per `kind`/`type`, `PATCH`es sent, appends to history.
  `out_for_delivery` enriches via `GET /api/delivery/{orderId}` (404 → retry later).
- `features.md` — implementation checklist. `test-prompt.js` — CLI prompt tester.

Commands in chat: `reset` clears that user's history.

## Ops notes

- `Bad MAC` / decrypt errors after phone logout/reinstall → delete `auth/`,
  restart, re-scan (identity keys rotated, old session is dead).
- Never run two processes on one `auth/` dir — it corrupts the session.
- Code or `.env` changes need a bot restart; XML context changes do not.
- `sendMessage` resolving means accepted by WhatsApp, not delivered —
  wrong numbers get marked sent anyway. Store E.164 numbers website-side.
# cookconnect-whatsapp-bot
