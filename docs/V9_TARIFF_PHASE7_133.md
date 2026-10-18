# Issue #133 — phase 7, recensement complet du pin et branches par cohorte

Statut : PR Draft sur #142 → #141 → #139 → #138 → #137 → #136. Conception #135 et mémoire Data Lab #332 relues ; identité de site #134 reste sans effet tarifaire. Aucun flag, moteur, UI, classement, collecte, pin ou déploiement n'est modifié. Lully Direct reste inactif sous #140.

## Inventaire pin-wide : dénominateurs et identifiants

Le [recensement en lecture seule](../reports/v9-tariff-133/phase7-inventory-pin-2026-10-15.json) parcourt la base dérivée du même pin `2026-10-15-v9-tesla-mac-ingress-verified` (manifeste SHA-256 `2b7b9964d8fce26f65aaf1e508717a114cb68ca16c66fb3c06ba9a076f2db52f`). Il conserve et hache dans un ordre stable **362 234 SourceStation, 654 932 ChargePoint, 460 144 Connector, 666 631 RawOffer et 710 386 OfferScope**. Les 757 cohortes catalogue ont pour clé `(pin,pays,CPO source,canal source,famille du payload brut)`. Pour chacune : nombres de stations/PDC/prises joints exactement, RawOffer, OfferScope par état, tuples `RawOffer+PDC+prise` uniques, SHA du jeu d'IDs RawOffer et nombre de stations à l'intérieur des rayons interrogés. Les stations sans lien tarifaire restent dans les totaux SourceStation par pays ; elles ne sont jamais attribuées artificiellement à une cohorte.

Le recensement physique séparé par `(pays,CPO)` inclut aussi les stations, PDC et prises sans offre liée. Leur canal et leur famille tarifaire ne sont pas inventés pour les faire entrer dans une cohorte.

**434 401 tuples source exacts et uniques** atteignent une prise enregistrée. Les autres assertions restent explicites : `exact_unique` 361 947, `source_exact_join` 306 363, station seule sans PDC 29 746, ID exact non trouvé 7 746, ID ambigu 3 535 et sans portée 1 049. Un lien EVSE sans Connector enregistré n'est pas compté comme tuple prise. Aucune clé de site, proximité ou puissance similaire n'entre dans la jointure.

Le [rejeu Phase 7](../reports/v9-tariff-133/dualrun-phase7-pin-2026-10-15.json) garde strictement les **mêmes 721 lignes** de #142 : 719 offres évaluées et deux sans offre exacte, sans changement d'ID, statut, montant, devise/FX, composante, provenance, portée, diagnostic ou classification. Les 21 zones contiennent **17 237 tuples exacts uniques** et **21 379 occurrences de tuple-session**, dont 4 142 répétitions entre scénarios. Ces nombres ne sont ni les 434 401 tuples catalogue ni un taux projetable sur les 666 631 RawOffer.

Les libellés source et runtime ne sont pas interchangeables : une seule des 181 clés runtime égale textuellement une clé catalogue. La correspondance passe **uniquement par RawOffer exacte**, jamais par nom ou site : 177 cohortes runtime se rattachent à une cohorte catalogue, deux à deux canaux catalogue (abonnement/direct), deux refus DE/GeniePoint n'ont pas de RawOffer runtime. Les 719 lignes offertes représentent **123/757** cohortes catalogue ; **634** ne sont pas vues dans les 21 zones. Le fichier inventaire donne les 181 correspondances et leurs compteurs.

### Lacunes géographiques vérifiables

Les rayons fixes ci-dessous donnent une **borne supérieure** à la couverture de #142 : certains scénarios ajoutent filtre de nom/ID, et les origines Tesla dynamiques sont traitées séparément. Les stations sans coordonnées lisibles sont conservées et comptées.

| Pays | Stations source | Dans un rayon fixe | Hors rayons | Coordonnées absentes | Lacune notable |
| --- | ---: | ---: | ---: | ---: | --- |
| BE | 13 181 | 1 188 | 10 765 | 1 228 | Bruxelles seulement |
| CH | 13 419 | 40 | 13 207 | 172 | zone Bodensee seulement ; DE*EDH hors zone |
| DE | 11 818 | 115 | 11 703 | 0 | Francfort ; zéro tuple exact sélectionné dans #142 |
| ES | 14 085 | 756 | 13 329 | 0 | Madrid seulement |
| FR | 51 416 | 111 | 48 898 | 2 407 | Bois-d'Arcy et Métropolis seulement, plus Tesla dynamique |
| GB | 27 747 | 192 | 27 555 | 0 | Midhope et autres petits rayons, pays majoritairement absent |
| IT | 30 306 | 1 846 | 27 958 | 502 | Rome seulement |
| LU | 1 | 0 | 1 | 0 | aucun scénario |
| MA | 84 | 4 | 37 | 43 | Tanger et Tesla dynamique ; coordonnées incomplètes |
| NL | 200 167 | 7 942 | 192 225 | 0 | Amsterdam seulement |
| PT | 10 | 0 | 10 | 0 | aucun scénario |

## Rectification Midhope — horaire fixe toute l'année (18/10/2026)

**Règle métier confirmée par l'utilisateur et déjà rectifiée dans Data Lab** : à Midhope Road (Connected Kerb), le stationnement payant s'applique **du lundi au samedi, de 08:30 à 18:00 heure locale `Europe/London`, toute l'année**, sans grille horaire été/hiver. Le dimanche reste gratuit pour la composante stationnement ; les autres composantes vérifiées demeurent indépendantes. En été (BST), 08:30 local = 07:30 UTC ; en hiver (GMT), 08:30 local = 08:30 UTC. Le passage DST ne justifie **ni garde de fin au 24/10, ni suspension automatique, ni changement de prix**. Référence : `tesla-charge-companion-data-lab/docs/uk-midhope-release-readiness-2026-10-10.md`, section « Rectification horaire ».

**Dette technique identifiée** : la source historique épinglée contient encore `winterEvidence=not_confirmed_not_activated`, la qualification ci-dessous contient `hourly_dst=calculation_proved_supplier_winter_price_unconfirmed`, et les tests/golden exigent toujours un `supplierWinterPriceProven=false`. Ces champs reflètent une *ancienne hypothèse saisonnière erronée* ; ils **ne doivent plus bloquer Midhope au seul motif du changement d'heure**. Le rapport machine Phase 7 n'a pas été régénéré par cette correction documentaire : son `pinWideCandidate=false` et le flag désactivé restent inchangés jusqu'à correction coordonnée du contrat, de la source future (sans altérer les octets du pin), des oracles, des tests/golden et de la qualification. La fraîcheur / validité **du montant fournisseur** se contrôle séparément des horaires et ne doit pas être présumée éternelle.

## Deux cohortes choisies sur le pin, sans promotion

La [matrice de qualification et ses IDs exhaustifs](../reports/v9-tariff-133/phase7-qualification-pin-2026-10-15.json) choisit **deux petites cohortes** à partir de leurs portées exactes et de leurs règles, et non du volume ou de la couleur locale de #142.

| Cohorte source | Dénominateur pin | Couverture de branches | Décision |
| --- | --- | --- | --- |
| GB Connected Kerb Midhope, Direct, tarif guest exact | 1 station, 4 PDC, 4 prises, 4 RawOffer, 4 OfferScope exacts, 4 tuples uniques ; #142 n'avait vu que 2 lignes | [36 évaluations](../reports/v9-tariff-133/phase7-midhope-branches-pin-2026-10-15.json) : 9 scénarios × 4 prises. Énergie, occupation payante lundi–samedi 08:30–18:00 Europe/London, dimanche, ouverture/fermeture, tranche de 30 min entamée, 15 min après charge, préautorisation £25 exclue, GBP et FX EUR du 15/10, validité avant le 10/10 refusée. Calcul DST testé. Les champs de prix sont tous énumérés ; pas de plafond, abonnement ni congestion dans cette offre. [Oracle source indépendant et golden](../tests/golden/v9-tariff-phase7-midhope-source-133.json), octets gzip/SHA exacts. | **Résultat machine Phase 7 : interdite, à recalculer après rectification**. La source épinglée porte l'ancien champ `winterEvidence=not_confirmed_not_activated` désormais reconnu comme **garde saisonnière erronée** (voir rectification ci-dessus). L'horaire est fixe toute l'année en `Europe/London` : le DST n'est pas un motif de suspension. Le prix source et sa fraîcheur doivent être évalués séparément avant promotion ; aucun flag n'est activé. |
| CH DE*EDH, Direct, règles all-day | 1 station, 2 PDC, 2 prises, 2 RawOffer, 2 OfferScope exacts, 2 tuples uniques ; aucune ligne #142 | [Oracle et golden source dérivée](../tests/golden/v9-tariff-phase7-ch-edh-source-133.json) : 2 offres × durées 239/240/241/300 min, énergie et temps connecté après 240 min, aucune autre composante dans le payload. | **Interdite** : le fichier amont CHF et le taux daté cité par les offres ne figurent pas dans le pin. Les octets EUR dérivés et la concordance du moteur ne prouvent pas le prix fournisseur. |

Le [contrôle source Midhope en CI](../tests/fixtures/v9-tariff-phase7-midhope-source-133.json.gz) réutilise exactement les 4 Ko gzip du pin (même SHA). Le test local sur dist revérifie aussi le manifeste. Les tests CH vérifient les octets/SHA du fichier dérivé complet du dist local. La matrice de branches énumère `energy/fixed/time/parking/hourly_dst/threshold/cap/subscription/congestion/fx/validity`, y compris les dimensions absentes. **Zéro cohorte candidate et zéro activation.** Pour rouvrir ces décisions : corriger les artefacts et tests Midhope qui imposent à tort une garde saisonnière, confirmer séparément la validité/fraîcheur du montant source selon les règles de preuve, et retrouver la source CHF/FX DE*EDH.

Les **62 prix calculés sans oracle** (ES22, IT20, NL8, GB8, FR2, MA2) et **18 divergences data_insufficient** (IT16, DE, GeniePoint) ne touchent aucune des six RawOffer retenues et restent hors promotion. Les 12 abonnements non choisis demeurent inéligibles. Les 28 PDC Bois-d'Arcy et 12 seules portées Electra prouvées restent séparés ; aucun tarif n'est transféré par #134.

## Vrai second calcul et rollback isolé

Le [banc instrumenté](../reports/v9-tariff-133/phase7-second-engine-pin-2026-10-15.json) charge le dist et appelle **réellement `evaluatePure` une seconde fois** pour les 719 mêmes tuple-sessions, via le shadow #141, après le dual-run initial. Sur ce Mac et ce jeu chaud : callback p50 **1,55 ms**, p95 **8,13 ms**, maximum **153,18 ms**, total **2 261 ms** ; enveloppe avec calcul p95 **8,23 ms**. Flag absent : 0 rappel/log ; rollback simulé : 0 nouveau rappel/log. L'objet réponse du moteur courant et l'ordre des offres source restent intacts. Ce coût n'est pas une latence Production ou une mesure pin-wide ; les métriques de provenance/composants du wrapper ne servent pas de preuve tarifaire car les représentations ancien/nouveau moteur diffèrent. Il n'y a aucun branchement UI ni modification de classement en Production.

## Reproduction et intégration

`python3 scripts/v9_tariff_phase7_inventory_133.py "$TCC_V9_PHASE3_CATALOG_DB" config/v9-tariff-dualrun-133-scenarios.json reports/v9-tariff-133/phase6-matrix-pin-2026-10-15.json reports/v9-tariff-133/dualrun-phase6-pin-2026-10-15.json /tmp/phase7-inventory.json` : lecture seule, assertion de tous les compteurs et empreintes d'IDs. `TCC_V9_PHASE4_SAMPLE=1 TCC_V9_PHASE6_CENSUS=1 TCC_V9_PHASE7_UNIQUE=1 TCC_V9_PHASE7_TIMING=1 node scripts/v9_tariff_dualrun_133.mjs "$TCC_V9_DIST" /tmp/phase7-raw.json` puis réconciliation #141 reproduisent 721 lignes et la mesure réelle. Le fichier de scénarios Midhope est fourni séparément. Le script `v9_tariff_phase7_qualification_133.py` vérifie les deux cohortes sur base SQLite, manifeste et rapports. Golden, tests source et CI ciblée contrôlent les artefacts versionnés.

L'ordre de fusion éventuel reste celui de #142 : revue #135, #134 sans effet OfferScope, puis #136 → #137 → #138 → #139 → #141 → #142 → cette PR, avec rebase et CI à chaque étape ; Data Lab #332 après décisions Production, #140 Lully indépendant. Aucune fusion ou publication automatique n'est préparée.
