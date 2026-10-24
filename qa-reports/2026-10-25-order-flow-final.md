# Order flow: final round (Oct 25, 12:37 AM restart)

Verdict: PASS (minor issues). Order cases O1-O10 pass, 16 extra edge cases X1-X16, 27-case regression batch.
Raw results on laptop: /tmp/probe/order-results.json, extra-results.json, results.json

Minor issues:
1. 26/27: "Caesar Salad (Chicken)" (inactive) answered "Yes" and swapped to active "Grilled Chicken Caesar Salad" without saying it's a different dish.
2. X9: "Order 0 Chicken Biryani" got a checkout link instead of asking how many.
3. O10: Egyptian "إيه" mixed into Gulf Arabic; language not asked before options once.
4. O5: friend-address reply implies the order can be sorted in chat for a first-timer.
5. X13: blank message returns 400 from the simulator (not reachable on real WhatsApp).

Not tested: saved-details direct order (no test number with a confirmed order). Open: GET /api/orders has no auth (Boon will add).
