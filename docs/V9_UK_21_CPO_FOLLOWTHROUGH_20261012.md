# UK V9 — traitement des 21 CPO absents au 12 octobre 2026

Le candidat global `2026-10-12-uk-21-cpo-global-candidate` est construit avec Data Lab `7d8c9045cbd5f52f9398715e1507baaabfe9887b` et Stable `3b2d4776029e2ce72d0de9a102d68e5afe5a0ef8`. Il n'est ni le pin de développement promu ni un déploiement Pages. `scripts/compile_uk_direct_batch.py` compile les sources nationales publiques épinglées dans `snapshot-inputs/UK/all.json.gz`, écrit leur empreinte et leurs exclusions dans `direct-batch-report.json`, puis l'audit compare ce rapport aux stations/offres réellement normalisées par le runtime. Les reconstructions historiques et le pin NL de développement conservent leur périmètre UK antérieur.

| Décision | CPO | Inventaire / offres exactes du candidat |
| --- | --- | --- |
| Prix par prise et puissance | IONITY | 83 sites, 872 prises et 872 offres directes |
| Prix par prise et puissance | Be.EV | 600 sites, 2 539 prises et 2 539 offres |
| Prix par prise et puissance | Applegreen Fast Charge | 261 sites, 534 prises et 534 offres invitées |
| Prix par prise et puissance | Wenea | 209 sites, 630 prises et 630 offres ; une prise dupliquée et un site de test vide écartés |
| Prix partiel vérifié | Zest | 1 987 sites, 3 469 prises et 2 797 offres. Les 642 prises à frais d'inactivité jour/nuit et 30 prises sans prix exploitable restent sans montant. |
| Prix partiel vérifié | GeniePoint | 306 sites, 1 138 prises et 235 offres TTC. Les 903 prises à tarif multiple, incomplet ou à frais de temps non couverts restent sans montant. |
| Inventaire exact, aucun montant classé | Shell Recharge, Monta, RAW Charging, ParkRecharge, Qwello, TotalEnergies, JOLT, 3ti Energy Hubs | Identifiants de prise conservés. Les unités, frais, périodes, TVA ou restrictions nécessaires au coût complet ne sont pas encore tous prouvés ou pris en charge. Voir le rapport compilé pour les comptes et quarantaines propres à chaque source. |
| Sites seulement, prises inconnues | Osprey Charging, Fastned, Roam, Lidl, Charge My Street, Believ | Sites publics géolocalisés conservés. Le flux épinglé ne permet pas de rattacher un tarif à un connecteur et une puissance exacts ; aucune prise ni offre n'est inventée. |
| Bloqué par preuve externe | Shell Recharge ubitricity | Source entière inactive faute de collecte PCPR fraîche : le jeton actuel renvoie zéro site/tarif. L'audit initial des 458 prises a été rectifié : les 183 prises `2ad...` ont une grille PCPR OCPI ordonnée ; le PAYG sert de diagnostic. Pour 33 prises, la référence a changé et les frais `PARKING_TIME` restent non réconciliés. |

L'audit du candidat donne **32 CPO marqués terminés, 31 présents en inventaire, 15 avec au moins une offre exacte, 16 présents sans montant vérifié et un absent sous blocage support**. Parmi les 31 présents, six n'ont que des sites sans prise, dix ont des prises sans offre (dont Arnold Clark Charge et ScottishPower Recharge déjà présents avant ce lot), onze ont un tarif exact pour chaque prise et quatre n'en ont qu'une partie. Ces catégories décrivent le **snapshot construit**, pas le site Pages actuellement servi. Un CPO `complete` dans le ledger Data Lab n'est donc pas automatiquement `tarif complet V9`.

Les sources sans tarif restent hors classement. Les prix par simple analogie réseau, les frais incomplets, les identifiants de prise inventés et les coordonnées hors UK sont refusés. Le cas GeniePoint suit le [dossier de collecte Data Lab](https://github.com/yass3705/tesla-charge-companion-data-lab/blob/feat/uk-geniepoint-official-20261012/docs/uk-geniepoint-official-ocpi-2026-10-12.md) : tarif OCPI hors TVA converti en TTC uniquement lorsque chaque composante vaut 20 % et qu'un seul tarif simple s'applique à la prise. Les autres tarifs restent visibles dans la preuve source, pas dans le classement.

Le build global local, le validateur du snapshot, le manifeste SHA-256, la parité Stable, le graphe navigateur, les tests de fuseau/libellés, l'identité des offres, le smoke runtime multi-pays et l'audit UK du rapport compilé ont réussi. Les checks GitHub de la branche et toute promotion restent à vérifier séparément.
