# CookConnect WhatsApp Bot — Features Checklist

## Core Features

### 1. Browse Menu
- [x] Search meals by name, category, or ingredients
- [x] Display price (AED), calories, macros (protein/carbs/fats), allergens
- [x] Tool: `search_menu(query, category)` — queries `GET /api/recipe`
- [x] Tool: `meal_category` — lists all available categories
- [x] After showing meals, include order link to `{site_link}/#meals`
- [x] UTM tracking on API requests

### 2. Subscription Plans
- [x] List available plans (15/20/26/45-Day, Healthy Diet)
- [x] Walk through customization stepwise (goal, carbs, restrictions, delivery days, payment)
- [x] Hand off to sales via WhatsApp for pricing and activation

### 3. About Us
- [x] Brand story since September 2016
- [x] Mission, philosophy, team info
- [x] Link to website for more info

### 4. Contact Information
- [x] Address, phone, WhatsApp, email, operating hours
- [x] Service area (Ajman only)

### 5. View Subscription Status
- [ ] Tool: `get_subscription_status(customer_id)` — queries subscription DB
- [ ] Show plan name, start/end date, delivery schedule, remaining days
- [ ] Handle pausing/rescheduling requests

### 6. Order Tracking
- [ ] Tool: `track_order(order_id)` — queries order status
- [ ] Show delivery status, estimated time, rider info

## Infrastructure

- [x] Tool calling support (OpenRouter)
- [x] Conversation history (in-memory, per-user)
- [x] System context loaded from `whatsapp-system-context.xml`
- [x] Arabic language support
- [x] Error handling and human escalation
- [x] Separate tool definitions and executors

## Reminders (v1)

- [x] `whatsapp_reminders` table + API (website side)
- [x] Bot authenticates with `x-bot-secret`
- [x] Phone normalization (`0...` → `971...`)
- [x] Templates for `order/confirmed`, `order/out_for_delivery`, `subscription/confirmed`
- [x] `out_for_delivery` fetches `GET /api/delivery/{orderId}` for tracking link + pickup code (404 → skip, retry later)
- [x] Tool: `generate_order_link(meal_ids)` — personal catalog checkout link (b64 UUIDs) via `lib/catalog.js`
- [x] 60s poller: send → mark sent → append to history
- [x] History + queues keyed by phone number (shared inbound/reminder context)
- [ ] End-to-end live send test

## Files

- `whatsapp-system-context.xml` — bot identity, role, constraints, plans, policies
- `lib/tools.js` — tool definitions
- `lib/tool-executor.js` — tool implementations
- `lib/openrouter/index.js` — OpenRouter integration
- `features.md` — this checklist
- `test-prompt.js` — prompt tester script
