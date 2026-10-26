# Subscription Signup Link — Negotiated Price Testcase

Scope: `subscription_signup_link` produces the restaurant onboarding URL with the
agreed price embedded in the signed token.

Run date: TBD · `node --check lib/tools.js lib/tool-executor.js`

## S — Success paths

- [x] **S1** Chat quoted AED 420 (list) for `standard-15` → link is the restaurant `/subscription-onboarding` URL, not `wa.me`
- [x] **S2** Counter-offer AED 375 quoted and accepted → `price_cents: 37500` sent to the API
- [x] **S3** `first_week_discount` on the list price → `base_price_cents: 42000`, `price_cents: 37800`, `concession_id: "first_week_discount"`
- [x] **S4** `locale: "ar"` → returned URL contains `/ar/subscription-onboarding`
- [x] **S5** Tool returns `{ link, price, effective_price }`; `link` is exactly the API `url`
- [x] **S6** `x-bot-secret` header is sent (never logged)

## R — Rejections (no link)

- [x] **R1** Price never quoted in this chat (e.g. an unoffered counter) → `{ error }`
- [ ] **R2** Price below the plan floor after a concession → `{ error }`
- [x] **R3** Unknown plan → `{ error }`
- [x] **R4** Concession not allowed on the plan → `{ error }`
- [x] **R5** Opening-price-only concession after a counter-offer → `{ error }`
- [x] **R6** Invite API returns 4xx/5xx → `{ error }`, no link
- [x] **R7** Simulator dry-run (`POST` suppressed) → `{ error }`, no forged link
- [ ] **R8** Missing `COOKCONNECT_BOT_SECRET` → `{ error }` (cannot create a trusted invite)

## P — Prompt / conversational rules

- [ ] **P1** After agreement the bot sends the tool URL verbatim
- [ ] **P2** Bot never writes a `wa.me` or hand-made onboarding link
- [ ] **P3** Bot restates the exact agreed AED amount from the tool result
- [ ] **P4** On tool error the bot does not send a link and re-checks the offer
