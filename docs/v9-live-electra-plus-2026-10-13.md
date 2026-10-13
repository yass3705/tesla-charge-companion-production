# Electra+ on verified direct Electra tariffs

The published V9 selector advertises Electra+ Essentiel and Smart, but selecting either plan does not create a corresponding priced offer. The shell also omits selected subscription lanes when rendering the station card. The candidate fixes both paths and folds the multiselect into a compact disclosure.

[Electra's France terms](https://www.go-electra.com/fr/electra-plus/) checked on 2026-10-13 state €1.99/month and €0.10/kWh off for Essential, or €4.99/month and €0.20/kWh off for Smart on Electra stations. Monthly fees are shown separately. Partner-network Smart prices are separate offers and are not inferred from this discount.

The pinned exact direct catalogue has 724 tariff records across 521 Electra stations. 320 stations have one verified station tariff with a complete ENERGY component and qualify for derived subscription prices; 201 have multiple station-level grids without a tariff-to-EVSE attribution and remain outside this calculation. Every non-ENERGY component and restriction is copied unchanged. The derivation requires the physical operator to be Electra, country FR, an exact direct source offer, EUR currency, and a verified unique grid. It cannot discount an Electra eMSP offer at Lidl, Electric 55 or another CPO.

The targeted test verifies both plan discounts, unchanged flat and idle fees, rejection of an ambiguous station and unrelated CPO, the presence of all independent tariff lanes, and a real runtime evaluation of 30 kWh (€15.70 direct, €12.70 Essential including the same €1 connection fee). The public Pages release and its immutable snapshot are unchanged.
