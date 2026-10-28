# G6 : énergie de session absente — 28 octobre 2026

Le contrôle transversal du moteur a révélé qu'une session sans `energyKwh` pouvait devenir une session de 0 kWh dans `stationSession()`, puis recevoir un coût calculé de 0 avec un tarif énergie positif. Ce résultat violait la règle « Tarif incalculable » quand une entrée indispensable manque. Le moteur conserve désormais `energyKwh:null` et renvoie `energy_required` ; l'énergie d'approche du trajet ne remplace pas une quantité de charge absente. Une session avec 10 kWh et 0,40 €/kWh donne toujours 4 €.

Tests source et paquet isolé **PASS** pour énergie absente, nulle ou vide et énergie connue. Le même bundle 30 sources a été empaqueté dans `site-missing-energy`, sans toucher au paquet de référence ni au site public. La recherche froide Amsterdam 100 km conserve les **62 770 stations**, l'ordre, les montants, les offres brutes, les évaluations et la carte avec les mêmes empreintes que le candidat antérieur ; 48 909 ms observés dans cet essai. Firefox neuf pays/mobile **PASS**, intégrité SHA/hébergement **PASS**, `deployed=false`. La variation de temps d'un essai ne constitue pas une garantie de performance.

**G6/G7/G8 restent FAIL** pour couverture complète, performance dense, transfert GitHub non vérifié et absence d'URL distante.
