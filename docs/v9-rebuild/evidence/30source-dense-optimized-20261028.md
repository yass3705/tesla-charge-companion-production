# Classement dense V9, candidat 30 sources — 28 octobre 2026

Le bundle immuable `dfc5952b5d340131cb0b10c75c81147ca290a0befbf11a930d794ae78cb82d96` et le paquet de référence `site-currency-guard-complete` restent intacts. Le paquet isolé optimisé est `site-timeline-skip`, assemblé depuis les mêmes fragments signés ; aucun déploiement.

Recherche Firefox à froid Amsterdam 100 km avec date, véhicule et paramètres identiques : **62 770 stations correspondantes**, 160 cartes visibles, 62 770 repères. Les empreintes SHA sont identiques avant/après pour l'ordre des 62 770 rangs, leurs montants/coûts/temps, la carte et ses pages, les offres brutes/calculables visibles et les évaluations de la page. Aucune erreur source. [Comparaison complète](30source-dense-optimized-comparison-20261028.json).

Durée de la paire froide : **70 183 ms → 50 049 ms**, soit 28,7 % de moins dans cet essai. Les derniers fragments sont arrivés à 14 328 ms puis 11 875 ms. Un premier essai du même candidat avait pris 69 395 ms avec les derniers fragments à 29 289 ms ; la variation du chargement interdit de présenter un chiffre unique comme garantie de performance.

Le planificateur réutilise l'estimation de charge lorsque ses entrées désirées et réelles sont identiques. La minute locale est mémorisée par instant et fuseau exacts. Les stations sans règles tarifaires additionnelles évitent une copie complète à chaque lot ; la déduplication des offres reste active, en réutilisant les métadonnées de station en lecture seule. Les cessions au navigateur restent présentes après au plus 50 ms de calcul. Une règle unique valable toute la journée évite la recherche d'une frontière temporelle inexistante ; son tarif est toujours évalué par le moteur complet. Le raccourci tarifaire all-day essayé séparément a été annulé faute de gain démontré.

Tests de classement global sur les cinq modes contre l'oracle complet, pagination/cache, portée EVSE/prise, fuseaux/DST, composantes OCPI, devise, puissance minute et planification sous échéance : **PASS**. Firefox neuf pays/mobile et neuf familles tarifaires sur le paquet optimisé : **PASS**. Hébergement et SHA locaux : **PASS**, 3 695 fichiers, `deployed=false`. Aucun tarif, station ou rayon n'a été modifié.

**G7/G8 restent FAIL** : la recherche dense demande encore environ 50 s à froid sur ce poste et il n'existe pas d'URL de préproduction distante. Actions Data Lab reste désactivé.
