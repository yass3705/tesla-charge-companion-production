# Issue #133 — phase 4, intégration réversible préparée

Statut : PR Draft empilée sur #138, sans branchement du moteur au runtime, sans changement de collecte ni publication. Contrat : #135 ; identité physique #134 seulement après évaluation ; mémoire Data Lab #332. Pin immuable `2026-10-15-v9-tesla-mac-ingress-verified`, dist Phase 3 vérifié, manifeste SHA-256 `2b7b9964d8fce26f65aaf1e508717a114cb68ca16c66fb3c06ba9a076f2db52f`.

## Population, méthode et résultat exact

Le [dual-run ligne par ligne](../reports/v9-tariff-133/dualrun-phase4-pin-2026-10-15.json) explore les **21 requêtes géographiques et scénarios** déjà épinglés. Pour chaque zone, il énumère les tuples runtime à portée exacte `(station source, PDC, prise, offre)` des sources chargées. Il prend en ordre ASCII les deux premiers tuples par `(pays, CPO, canal, bande de puissance, famille tarifaire)` ; pour Bois-d'Arcy, il garde les douze tuples exacts dans chacun des deux scénarios de congestion. Les deux zones sans offre exacte conservent chacune une ligne de refus. Cette règle est déterministe, traçable et réexécutable avec `TCC_V9_PHASE4_SAMPLE=1`. Les 21 requêtes contiennent 21 379 tuples comptés **avec répétition entre scénarios**, 719 évaluations sélectionnées et 2 refus, soit **721 lignes**. Elles ne constituent ni un tirage aléatoire du catalogue, ni un dénominateur de couverture des 666 631 RawOffer.

Le [rapport de couverture](../reports/v9-tariff-133/coverage-phase4-pin-2026-10-15.json) ventile les **286 combinaisons observées** de pays/CPO/canal/bande de puissance/famille. Les compteurs ci-dessous concernent uniquement ces 721 lignes, sans extrapolation.

| Statut candidat | Lignes |
| --- | ---: |
| Calculable | 652 |
| Incalculable | 55 |
| Inéligible, abonnement non choisi | 12 |
| Sans offre runtime exacte | 2 |

| Comparaison après rapprochement de RawOffer | Lignes |
| --- | ---: |
| Concordance | 689 |
| Correction démontrée par oracle source et portée exacte | 14 |
| Données insuffisantes | 18 |
| Régression démontrée | 0 |

Sur les 14 corrections, 12 sont des offres italiennes à montant prouvé (Ewiva, Enel On Your Way, Repower et Free To X), 2 sont les prises Kilowatt gratuites déjà prouvées en Phase 3. Les 18 données insuffisantes incluent 12 abonnements non choisis (leur différence avec l'ancien moteur est un état `ineligible`, aucun prix nouveau), 4 offres italiennes dont l'oracle ou la sémantique ne tranche pas, et les 2 absences DE/GeniePoint. Une concordance entre moteurs ne suffit pas : **230 des 652 résultats calculés n'ont pas de montant confirmé par oracle indépendant**, notamment des grilles `component_groups` Espagne. Ces cohortes ne sont pas admissibles à une bascule.

La filiation est exacte pour **301 lignes 1:1** et **267 lignes dérivées** ; **151 lignes runtime ne sont pas énumérées ou rapprochées dans RawOffer**, même si beaucoup produisent un prix concordant. Deux lignes n'ont pas d'offre runtime. Les lignes dérivées gardent leurs identifiants runtime et pointent sur RawOffer par clé source ; aucune fusion ou déduplication destructive. Les 151 lignes sont une dette de preuve et un **arrêt de promotion**. Le rapport distingue ces unités des 666 631 offres source ; il ne les soustrait pas du catalogue.

## Conservation et portée

La base relationnelle construite sur le même dist contient **666 631 RawOffer**, **362 234 SourceStation**, **654 932 ChargePoint**, **460 144 Connector** et **710 386 OfferScope**. Les clés RawOffer sont uniques et chaque ligne a payload, chemin et SHA source ; aucune assertion OfferScope n'a une RawOffer absente. Les tests Phase 1–3 préexistants vérifient la conservation additive et les jointures, dont les 87 984 feuilles DOT-NL actives. Ces totaux sont des inventaires source, pas des prix calculables ni des PDC distincts physiques : un `ChargePoint` peut représenter une entrée de plusieurs sources. Les IDs source EVSE/PDC/prise sont conservés dans leurs colonnes et JSON bruts, tandis que la sélection Phase 4 utilise la clé runtime exacte.

Bois-d'Arcy conserve trois stations source et 28 PDC ; seules les 12 offres GraphQL jointes aux PDC 400 kW de `FRELCP12954082` sont évaluées. Dans le scénario où la congestion est demandée sans preuve de saturation/SOC, les 12 restent incalculables ; lorsque la simulation exclut explicitement cette composante, les 12 valent **12,20 €** pour 20 kWh. Les 16 autres PDC et six EVSE GraphQL non joints ne reçoivent aucun prix Electra. La réunion visuelle #134 ne figure jamais dans `OfferScope`. Une session réelle exige saturation, SOC, DC, grâce et plafond vérifiés pour calculer la congestion.

## Refus DE et GeniePoint UK

**DE Wirelane** : la RawOffer épinglée `snapshot-inputs/DE/all.json.gz:/sites/27486/pricing/directCpo` (SHA du fichier `ba14bb9eceed07f04aa0caa47ac2aaafc3f2133e5962e492c5ff54b8e0f2d318`) nomme `DEWLNES000348` et donne une grille source 0,64 €/kWh + 1 € de départ. Le scénario runtime choisit `DE:national:bnetza-site:009e09626ee7d2c74e1b` et `DEWLNES000348`, mais ne contient **aucune offre runtime exacte**. Il faut prouver le raccordement de cette grille au tuple runtime et le canal Direct avant d'émettre un devis : aucune somme n'est attribuée dans ce dual-run. La preuve source existe ; le passage de source à Evaluation manque.

**GeniePoint** : dans `snapshot-inputs/UK/all.json.gz` (SHA `105943ce790b885dafc59d522cffa9f91f2be6a565e23fee04ce22ebde73436c`), l'EVSE `GB*GPT*EBCKSMWMZDXDJRKHE1L17QJQRU` de Memorial Park & Ride porte la prise `1` avec `tariff_ids: []` et un statut `OUTOFORDER`. La source a des tarifs GeniePoint ailleurs, mais aucune référence de tarif de cette prise. Le refus est explicite : zéro offre exacte, zéro prix attribué. Une nouvelle référence OCPI vérifiée serait nécessaire.

## Composantes validées et limites

Les **24 golden source Phase 3** et leurs tests indépendants restent la preuve ciblée pour horaires et DST Europe/London/Paris, frais fixes, kWh, minute de charge, stationnement et après-charge Midhope, `afterMinutesRate`, FLAT/OCPI DOT-NL et minuit, FX daté et vérifié par SHA, offres Tesla SuC/Mac, Electra avec/sans congestion, et Lully en source inactive. Les tests runtime du pin vérifient aussi les seuils, plafonds et abonnements éligibles. Le rapport Phase 4 sépare 422 lignes calculées avec oracle indépendant de 230 lignes calculées sans oracle : ces dernières exigent des golden source supplémentaires **par famille et par portée** avant admission. Aucune conclusion universelle n'est tirée pour les grilles absentes de l'échantillon. `ambiguous=0` dans les lignes évaluées ne prouve pas absence de conflits dans le catalogue.

Direct Lully reste **inactif**. La [PR Draft documentaire distincte #140](https://github.com/yass3705/tesla-charge-companion-production/pull/140) définit l'exigence de checkout Scan Pay, identité des quatre PDC et deux profils de puissance, TVA, frais uniques, stationnement, transitions horaires/DST et contrôle par offre avant toute activation. Les prix source Phase 3 ne deviennent pas des offres runtime par ce plan.

## Plan d'intégration réversible, non activé

1. Ajouter ultérieurement un flag **éteint par défaut** par `(pin, pays, CPO, canal)`, sans valeur globale « tous ». Le moteur courant reste l'unique réponse à l'UI. Le candidat s'exécute en lecture seule après la réponse courante et émet une trace redigée par clé exacte de prise/offre/scénario : états, raisons, composants, montants locaux, FX daté, pointeurs source et SHA. Pas de regroupement par site dans la décision.
2. Construire le catalogue à partir du même pin, comparer multiensembles d'IDs et payloads bruts. Bloquer le flag si une RawOffer ou une identité PDC/prise/source manque, si une offre dérivée n'a pas une filiation exacte, si une portée change via #134, ou si l'ancienne réponse est altérée par le shadow run.
3. Qualifier chaque cohorte `(pays, CPO, canal, famille)` : zéro régression démontrée, zéro ligne sans RawOffer ou oracle pour toute offre candidate calculée, aucun montant pour `ambiguous`, `uncomputable`, `ineligible` ou `missing`, et oracles aux frontières horaires, DST, seuil, plafond, abonnement, FX et congestion pour les familles présentes. Les 151 + 230 et les 18 divergences Phase 4 bloquent actuellement toute cohorte qui les contient. Toute nouvelle entrée ou source réouvre sa gate.
4. Seulement après revue humaine, préparer une PR d'activation séparée pour une cohorte explicitement listée. Une alerte sur conservation, portée, composant, total ou latence retire immédiatement la cohorte du flag et revient au moteur courant **sur le même snapshot épinglé** ; aucune migration de stockage ni suppression d'offre n'est nécessaire. Conserver logs de comparaison et indicateur de version de moteur pour prouver le retour. La publication Pages/Cloudflare est une décision distincte.

## Ordre proposé, sans fusion automatique

Revoir puis intégrer #135 (contrat), puis #134 (présentation physique, contrôle 3 stations/28 PDC et absence de changement OfferScope). Ensuite traiter la chaîne empilée #136 → #137 → #138 → cette Phase 4 dans cet ordre, en rebasant les descendants et en rejouant leurs gates après chaque intégration. #332 est le passage de relais mémoire à synchroniser après validation des SHA et décisions de cette chaîne ; il ne prouve aucune publication. La PR Lully est indépendante et reste documentaire. Aucune PR de cette séquence n'active le flag ni ne publie.

## Reproduction

Avec le dist et la base catalogue Phase 3 vérifiés :

```sh
TCC_V9_PHASE4_SAMPLE=1 node scripts/v9_tariff_dualrun_133.mjs "$TCC_V9_DIST" /tmp/phase4-raw.json
python3 scripts/v9_tariff_reconcile_133.py "$TCC_V9_PHASE3_CATALOG_DB" /tmp/phase4-raw.json /tmp/phase4-reconciled.json
python3 scripts/v9_tariff_phase4_coverage_133.py "$TCC_V9_PHASE3_CATALOG_DB" /tmp/phase4-reconciled.json /tmp/phase4-coverage.json
```

Les chemins `reports/v9-tariff-133/` contiennent les sorties figées, leur SHA et les détails par ligne ; les tests Phase 4 contrôlent les invariants et refus. Le dist est vérifié par `validate_built_snapshot.py` et `verify_candidate_manifest.py`. La chaîne Tesla/Mac Updater Test, les collectes, le moteur Production et les déclencheurs de publication sont inchangés.
