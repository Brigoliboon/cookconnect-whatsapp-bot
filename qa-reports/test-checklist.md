# Cook Connect WhatsApp Bot – QA Checklist
_Owner: Probe · Created 2026-10-24_

Legend: [S] = simulator (Probe can run) · [W] = real WhatsApp test number · [O] = Oracle server

## 0. Regression (current 27 chats) [S]
- [ ] Rerun all 27 cases after the restart
- [ ] Cheapest meal returns real food, not Water (cheapest main, not a side)
- [ ] Lists show at most 5 items, say how many more there are, and offer the link
- [ ] Inactive dishes never shown
- [ ] Checkout link only after the customer confirms

## 1. Diet & budget filters [S]
- [ ] "High protein under 500 kcal"
- [ ] "Vegan / vegetarian options"
- [ ] "Something under AED 20"
- [ ] "Keto / low carb"
- [ ] Results match the filter (check against recipes.toon)

## 2. Order changes [S]
- [ ] Order with several items (2 Biryani + 1 salad)
- [ ] Change quantity before confirming
- [ ] Swap a dish
- [ ] Cancel before confirming, so no link is sent
- [ ] Checkout link matches the final order

## 3. Long chats & memory [S]
- [ ] 10+ turn chat
- [ ] Refer back to an earlier dish ("the second one")
- [ ] Switch language mid-chat and keep the context
- [ ] Come back after reset or idle and get a clean greeting

## 4. Languages [S]
- [ ] Arabizi ("3ndkom chicken?")
- [ ] Hindi / Urdu
- [ ] Switching between Arabic and English
- [ ] Spelling in Arabic replies (spot-check for typos)

## 5. Failures [S]
- [ ] Menu API down or slow, so the bot replies politely and doesn't make anything up
- [ ] DeepSeek timeout: the customer still gets a reply and the bot doesn't go silent
- [ ] Very long message (2,000+ characters)
- [ ] Same message spammed 10 times
- [ ] Emoji-only message

## 6. Accuracy sweep [S]
- [ ] Ask 30+ dishes by name
- [ ] Price, calories and macros match recipes.toon / the live API
- [ ] No invented dishes or categories

## 7. Real WhatsApp [W] (needs a test number)
- [ ] Voice note
- [ ] Image / photo of a dish
- [ ] Sticker
- [ ] Shared location
- [ ] Reply to an old message
- [ ] Formatting (*bold*, links) renders correctly

## 8. Load [O] (needs server access)
- [ ] 10–20 customers at once
- [ ] Reply time stays under ~10 s
- [ ] No DeepSeek rate-limit errors
- [ ] Bot reconnects after the server restarts

## Open decisions (Boon)
- [ ] Refund formula: fees on the full amount (AED 440) or on the unused portion (AED 472)
- [ ] Cheapest meal: leave out rice and sides as well?
