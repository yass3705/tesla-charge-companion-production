# French IRVE AC power unit correction

A real Firefox comparison from 60 rue Gabriel Péri, Saint-Cyr-l’École, 20 km, 2026-10-13 12:00 local, 20→80% SOC exposed `SAFRAN VELIZY (NON RESERVABLE)` at **AC 7,360 kW**. The first public pinned Stable compact IRVE record stores `7360.0` in the kW position for `FRZWOEZW02962`; its EVSE IDs are `FRZWOEZW029621/2`. The pinned Data Lab's later IRVE builder explicitly divides `puissance_nominale` values above 1,000 by 1,000, confirming that these older AC values were watts in the wrong field. The newer national row identifies the same EVSEs as 7 kW AC. The code correction uses the exact old watt reading, 7,360 W = 7.36 kW, without changing EVSE identity or adding prices.

The pinned public IRVE base has 675 affected AC power groups across 663 stations. The V9 national adapter now converts only French AC values above 1,000 whose watt conversion falls between 1 and 43 kW. Display and grouping retain power precision to two decimals, so the corrected connector is shown as 7.36 kW and remains separate from 7.4 or 22.1 kW groups. The targeted test checks all 675 groups, their PDC IDs, the Safran case and unchanged normal AC readings.

Nine DC groups across six stations also exceed 1,000 in the older static data. Their source interpretation is mixed (for example, `1601.6` maps to 160 kW in a later exact-EVSE source, while `1200` maps to 1.2 kW). The AC correction does not silently apply a DC conversion. Those DC records need a separate exact-EVSE source reconciliation before being treated as trustworthy power values.

The first public Pages snapshot remains unchanged. This correction applies to the development candidate after CI validates its build, browser journey and hashes.
