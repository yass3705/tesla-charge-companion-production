# Métropolis / SPIE CityNetworks — offres directes exactes V9

## Sources et périmètre

- [Tarifs publics Métropolis](https://www.metropolis-recharge.fr/) et [conditions générales 2026, article 8](https://www.metropolis-recharge.fr/wp-content/uploads/2026/01/CGAUV-Metropolis-2026-01.pdf) : prix TTC, kWh entamé, post-charge après franchise, minute entamée. Les clients en itinérance relèvent de leurs accords propres ; ces montants restent **Direct CPO** et ne remplacent pas Electra ou Electroverse.
- Source structurée Data Lab `data/operator_direct/metropolis_spie_official_france.json`, pin `e39a4466096b520b3c459e75539bf9b112235165`, générée le 13 octobre à 12:05 UTC. Elle couvre uniquement le sous-réseau Métropolis, pas tout SPIE CityNetworks.
- Nouveau snapshot immuable **de développement** `2026-10-13-fr-spie-exact-candidate`, Stable `0a6d2c34`. Le snapshot Pages public reste `2026-10-13-nine-country-be-belib-exact-candidate`.

## Jointure et calcul

La source actuelle a **740 EVSE exacts uniques**. Les 740 existent chacun une fois dans l'IRVE épinglé, avec le même ID de station et le CPO SPIE CityNetworks. **204** portent 7,0 kW dans la grille officielle et 7,4 kW dans l'IRVE : cette seule variante de puissance AC nominale est acceptée. Les autres puissances doivent être identiques. La source antérieure du 6 octobre comptait 1 651 lignes mais seulement 911 IDs EVSE uniques ; elle ne sert pas à publier des offres supplémentaires.

Le compilateur publie **726 offres directes à EVSE exact** avec énergie, franchise de 10 minutes et frais post-charge complets. La règle facture le kWh entamé et les minutes post-charge entamées après franchise. Les **14 EVSE de Neuilly-sur-Seine** avec barème post-charge différent entre 08h–20h et 20h–08h restent sans nouvelle offre directe : le format actuel de `postChargeFee` n'exprime pas ce changement de taux ; produire un prix à partir du taux de jour ou de nuit seul serait incorrect. Aucun prix Métropolis n'est propagé à un autre site SPIE.

L'adaptateur `direct-offer-json` conserve Direct CPO séparé des voies eMSP, impose simultanément pays, station, EVSE, opérateur et type AC/DC. Le smoke vérifie chaque offre compilée contre l'IRVE normalisé et contre un oracle arithmétique indépendant pour 10,1 kWh, 60 minutes de charge et 11,2 minutes post-charge. Le cas réel Juvisy-sur-Orge contrôle en plus l'attachement au runtime chargé.

## Contrôle des autres sources du nouveau pin

Entre les SHA Data Lab `2cc230af` et `e39a44660`, onze fichiers de données changent (BUMP, ETotem, WAAT, SPIE et flux brut REVE). Le comparatif **des artefacts réellement construits** trouve deux nouveaux fichiers, le tarif Métropolis compilé et sa preuve source, **aucun fichier retiré**, et cinq fichiers existants modifiés : contrat runtime, adaptateur Tesla (déjà corrigé dans Production #83), registre des sources, provenance du supplément IONITY DE et configuration du shell. Les collectes brutes BUMP/ETotem/WAAT/REVE ne deviennent donc pas automatiquement des offres de ce candidat.

Build local : dix datasets, **2 447 fichiers / 745 853 449 octets**. Validateur du snapshot, manifeste et toutes les empreintes SHA-256, parité Stable et graphe de 34 dépendances navigateur réussis. Le smoke runtime passe dans les neuf pays et pour Tesla ; dans sa zone témoin parisienne, les stations tarifées passent de **3 321 à 3 323** sans changement du nombre de stations visibles (3 771). Le test Tesla Matosinhos confirme toujours zéro montant de congestion facturé sans preuve d'occupation. Le parcours navigateur de CI reste à confirmer avant fusion. Aucun déploiement Pages ou Cloudflare.
