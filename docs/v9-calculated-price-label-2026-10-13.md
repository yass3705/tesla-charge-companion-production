# V9 calculated-price label (13 October 2026)

The Data Lab pricing-result policy distinguishes a complete calculated quote from an identified but uncomputable offer and from an absent tariff. The V9 shell already displayed `Tarif incalculable` and `Prix non disponible`; complete lanes showed only a number. They now show `Prix calculé` beside the amount. Congestion on/off controls retain the same label after updating the number. This is presentation only: eligibility, amounts, ranking and source pins are unchanged.

The targeted lane test checks that only complete offers carry the label, including Tesla. Global and pinned browser CI must pass before merge. No Pages deployment is involved.
