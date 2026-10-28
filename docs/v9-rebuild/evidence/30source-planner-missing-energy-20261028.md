# G6 : le planificateur conserve une énergie inconnue

`SessionPlannerEngine.planStation()` ne convertit plus une énergie absente en 0 kWh quand capacité et SOC ne permettent pas de la déduire. La session transmise au moteur conserve `energyKwh:null` et une chronologie vide ; une quantité explicite ou déduite d'une batterie/SOC connus conserve son calcul.

Tests `v9-session-planner-reuse`, `v9-missing-energy-session` et `v9-global-ranking-pages` **PASS**. Le paquet isolé `site-planner-missing-energy` utilise le bundle immuable 30 sources `dfc5952b5d340131cb0b10c75c81147ca290a0befbf11a930d794ae78cb82d96`. Contrôle SHA/hébergement **PASS** : 3 695 fichiers, `deployed=false`. Firefox neuf pays/mobile **PASS**.

Amsterdam 100 km à froid : 62 770 stations, 160 fiches, 48 081 ms. Les empreintes de l'ordre global, de la page, de la carte et des évaluations/offres sont identiques à l'oracle complet antérieur. Ce temps d'un essai varie avec le chargement des fragments ; il ne prouve pas un budget de performance durable.

G2–G8 restent FAIL ; préproduction distante et handoffs Actions non vérifiés. Aucune donnée source, tarif, Action active, `main` ou site public n'a été modifié.
