# Recette dense du candidat 30 sources — 28 octobre 2026

Sur le paquet isolé `site-currency-guard-complete`, Firefox a exécuté une recherche à froid depuis Amsterdam (52.3676, 4.9041), rayon 100 km, tous réseaux : 62 770 stations correspondantes, 160 cartes visibles, 160 évaluations tarifaires disponibles sur la page, aucune erreur de source observée, **71 163 ms**. Ces nombres décrivent cette recherche ; ils ne sont pas des seuils de validité des données.

Une seule variante technique a porté le lot de classement de 40 à 160 stations, sans modifier les données, les prix ni le rayon. Les tests de classement global (cinq modes), pagination spatiale et cache passaient ; sur le même poste et le même paquet, la recherche à froid a pris **67 432 ms**, avec les mêmes 62 770 correspondances, 160 cartes et aucune erreur. Ce faible écart sur un essai unique ne démontre pas une amélioration suffisante. La variante et son paquet dérivé ont été supprimés ; le code et le paquet final validé restent inchangés.

**G7/G8 restent FAIL sur la performance dense**. Prochaine opération : profiler séparément chargement/décodage SHA des shards, rapprochement spatial et classement global sur ce candidat ; corriger le poste dominant sans tronquer les résultats ni réduire silencieusement le rayon, puis mesurer à nouveau sur le même scénario avant toute promotion.
