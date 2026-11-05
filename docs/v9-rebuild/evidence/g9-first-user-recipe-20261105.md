# Première recette utilisateur G9 — 5 novembre 2026

## Candidat et portée

Le brouillon Netlify immuable `6ae257f7d0d52c2b2ba9636b` et son paquet `site-rule-key-guard` restent inchangés. Le candidat corrigé `site-g9-first-recette` est un clone local APFS du paquet 31 sources. `diff -qr` ne trouve qu'un fichier différent : `v9-production-shell/bridge.js`. Le bundle de données reste `29e2a5e9331a9d2949e342d245128d45480647f4eed1fc37977f83bc67e059fb`. Aucun nouveau déploiement n'a été lancé.

## Fiches et carte

Le shell affiche initialement **au plus 20 fiches** par recherche, puis 20 de plus par clic sur « Afficher les stations suivantes ». La pagination de 160 stations par page, la carte complète, le rayon utilisateur de 100 km et le classement global restent dans le moteur. Les repères cartographiques sans prix affichent désormais « Sans prix » ou « Incalculable » selon la présence d'une offre brute, avec libellé d'accessibilité complet ; aucun zéro ou prix n'est créé.

Preuves locales : [11 recherches ordinaires](g9-20261105-ordinary-search.json), [10 parcours tarifaires](g9-20261105-targeted-browser.json), [neuf pays et mobile](g9-20261105-multicountry-browser.json). Le test global des cinq modes `tests/v9-global-ranking-pages.test.mjs` et `tests/v9-shell-grouping.test.mjs` passent. Recherche France de la recette : 8 655 stations dans le classement et la carte, **20 fiches avant** et **40 après** une action explicite ; la page suivante reste disponible. Mobile 390 px : 20 fiches initiales, aucun débordement. Le contrôle SHA/hébergement local du candidat passe sur 3 777 fichiers ; `deployed=false`.

## Carrefour Fécamp, rue Charles Leborgne

Station canonique nationale `FRALLPEVCARSFCAMP`, clé interne `tcc:9b113cb493f52405cda4d54933f6865d47b224bad46fec7c1a5e15fe946d51f9`. Huit EVSE officiels `FRALLEGO9004281`, `9004282`, `9004341`, `9004342`, `9007021`, `9007022`, `9007331`, `9007332` ; **4 PDC AC 22 kW et 4 DC 150 kW** dans l'interface. La source nationale `FR:irve_static` n'a aucune offre tarifaire.

La méthode Allego Direct migrée lit l'archive figée Data Lab `data/national/allego_direct_stations_france.json.gz` (SHA et contrat : `docs/v9-rebuild/ALLEGO_FR_CANONICAL_ARCHIVE_20261028.md`). Aucun des huit EVSE, ni la station Fécamp, ne figure dans cette archive. Le bundle `FR:allego_direct` n'a donc pas perdu d'offre pour cette station lors de la normalisation. Aucun des huit EVSE ne figure dans les autres sources tarifaires canoniques du bundle 31 sources.

L'historique Electra documente séparément cette localisation dans `reports/france/irve/electra-pricing-action-queue-latest.csv` (ligne 886) et `reports/france/electra/electra-residual-station-typologies-latest.csv` (ligne 912). Deux tarifs sont connus au niveau de la localisation, mais **la relation chargeTariffId → EVSE/prise et puissance exacte n'est pas prouvée** ; disposition historique `hold_electra_emsp_price_unattributed`. Ils ne sont pas attribués artificiellement aux huit prises. Aucun rapprochement Electroverse exact ne fournit d'offre à ces EVSE dans le candidat.

Recherche navigateur Fécamp à 5 km : 16 stations, zéro offre calculable, un autre site avec offre brute. La station demandée a `offers=0`, `unparsedOffers=0`, `eligibleOfferCount=0`, `comparableOfferCount=0`, `best=null`. La simulation a pourtant 45 kWh demandés, une prise DC 150 kW choisie et une devise EUR : **ce n'est pas un défaut de paramètres**. La fiche et les trois canaux affichent « Prix non disponible », sans montant inventé. Classification : **absence d'offre attribuable aux EVSE dans le candidat**, avec offre Electra historique retenue hors portée faute de preuve ; aucune régression de calcul ou d'affichage démontrée pour ce site.

## Couverture des recherches ordinaires

Les valeurs ci-dessous sont des observations à rayon **5 km**, sans seuil d'acceptation ni comparaison de volumes historiques. La recherche classe les stations calculables avant celles sans prix quand les deux existent.

| Recherche | Stations | Calculables | Stations avec offre brute |
| --- | ---: | ---: | ---: |
| Fécamp | 16 | 0 | 1 |
| Rouen | 217 | 0 | 9 |
| Lyon | 230 | 4 | 1 |
| Milan | 11 | 10 | 0 |
| Berlin | 813 | 0 | 0 |
| Amsterdam | 1 365 | 305 | 92 |
| Londres | 2 406 | 0 | 2 405 |
| Bruxelles | 968 | 116 | 104 |
| Zurich | 180 | 0 | 149 |
| Madrid | 325 | 0 | 0 |
| Agadir | 2 | 1 | 0 |

Ces résultats expliquent la perception de peu de tarifs dans certaines recherches ordinaires : sources nationales sans offre dans la zone, ou offres brutes conservées hors calcul. Les régions avec offres prouvées montrent leur prix en tête du mode « Prix ». Aucun nouveau tarif ni rapprochement fournisseur n'a été recherché.

## Décision et suite

La correction UI et la recette locale ciblée sont **PASS**. G8 global reste FAIL pour les lacunes de chaîne et de couverture déjà consignées ; G9 reste en cours. Le paquet Netlify actuellement accessible ne porte pas ces corrections. Prochaine opération : soumettre le candidat local corrigé à un **nouveau déploiement brouillon Netlify uniquement après autorisation**, sans remplacer l'URL immuable actuelle ni publier sur le domaine TCC ; rejouer alors SHA et navigateur sur la nouvelle URL avant une seconde recette utilisateur.
