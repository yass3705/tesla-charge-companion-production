# Exact-offer provenance merge correction

Confirmed regression: mergeEquivalentOffers compared a cloned winner with the original input by object identity. When the next offer won priority, metadata present only on the prior exact equivalent offer disappeared; reversing arrival order retained it. Select winner/loser before cloning. Existing semantic equivalence, identity scopes, priority and pricing remain unchanged.

Tests compare both arrival orders, preserve winner precedence and lower-priority provenance, official scope and pricing; immutable preparation, exact-offer scope and all five global ranking modes pass (offer-provenance-tests.log). This change is not yet in the remote draft6af855c4. Include it in the next grouped candidate and execute relevant browser/integrity checks before delivery.
