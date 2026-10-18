# Issue #133 — raccordement technique du shadow tarifaire V9

PR Draft empilée sur #144. Contrat #135, site physique #134, mémoire Data Lab #332 et preuves Phases 5–7 conservés. Pin unique : `2026-10-15-v9-tesla-mac-ingress-verified`. **Aucun prix candidat, flag ou cohorte n'est activé dans la configuration livrée.** Le moteur historique garde seul l'UI, les prix, le tri et les cartes.

## Branchement et périmètre

`runtime-engine.createEngine` enveloppe `evaluateStation` et son usage dans `queryArea` : il termine d'abord l'évaluation historique, puis donne le même objet au shadow. `evaluateArea` conserve aussi l'ordre et les objets retournés. Le bridge charge le module statique avant le runtime et ne transmet que `cfg.tariffShadowFlag` si son pin égale le snapshot. `v9-production-shell/shell-config.json` et le dist reconstruit n'ont **aucun** `tariffShadowFlag`. Le chemin désactivé produit zéro calcul candidat et zéro diagnostic.

Le [module navigateur](../runtime-owned/assets/v9/tariff-shadow-adapter.js) contient seulement les quatre relations `station source GB:ocpi:CK0:cd20…` + EVSE + prise + offre Direct Midhope, issues des RawOffer/OfferScope exacts de #144 et vérifiées contre leurs pointeurs source par test. Il réutilise le calcul pur `PricingEngine.evaluateOffer` du dist avec la sémantique durée de charge + après charge. Aucun SQLite ni export des 666 631 RawOffer n'entre dans Pages. Le fichier source gzip SHA-256 `f19c37f917a692a4d6efd0d1f42cfb94707941fbfb990f987bf938ecd4a12796` reste inchangé.

Une recette locale peut fournir `tariffShadowFlag={enabled:true,mode:'shadow',pin,country:'GB',cpo:'Connected Kerb',channel:'Connected Kerb',stationId,exactTuples:[les quatre triplets EVSE/prise/offre]}`. Toute clé, offre, prise, station, canal ou pin différent refuse le flag ou le tuple ; une clé de site physique n'entre jamais dans la jointure. Le contrôle `engine.rollbackTariffShadow()` coupe immédiatement les calculs suivants ; dans le shell d'une recette explicitement activée, `window.__TCC_V9_TARIFF_SHADOW_CONTROL__.rollback()` donne le même arrêt sans changer de snapshot. La configuration livrée n'expose pas ce contrôle car elle n'active rien. Les événements gardent des empreintes courtes et des drapeaux de divergence, sans IDs ni montants bruts ; les 32 derniers restent en mémoire seulement.

La fraîcheur du prix Midhope est bornée au pin du 15/10 : la source observe les valeurs le 10/10 sans `validTo`, mais un autre pin nécessite une nouvelle validation. L'horaire local lundi–samedi 08:30–18:00 Europe/London ne porte aucune garde saisonnière. Dimanche : stationnement gratuit, énergie et après charge conservés.

## Recette et résultats

| Contrôle | Résultat |
| --- | --- |
| Source / portée | Quatre RawOffer, quatre prises et quatre tuples exacts, SHA source vérifié. Aucune propagation par site #134. |
| Branches | 16 scénarios × 4 prises = 64 évaluations, dont été/hiver, samedi/dimanche, 08:30/18:00 et deux transitions DST. Oracle indépendant de #144 : montants et composantes conservés. |
| États refusés | `missing`, `ambiguous`, `uncomputable`, `ineligible` exercés ; Direct, Electra et Electroverse isolés. |
| Runtime ancien | Les mêmes 721 lignes et SHA de replay Phase 6/7 sont inchangés. Tests intégrés comparent objet historique complet et entrées de classement avant/après shadow. |
| Navigateur | [Mesures desktop/mobile](../reports/v9-tariff-133/shadow-runtime-browser-pin-2026-10-15.json) : vrai second calcul Chromium hors Production ; mobile = viewport tactile 390×844 avec CPU émulé 4×, **pas un appareil physique ni un SLA**. Zéro divergence de statut, montant, devise, composante ou provenance dans les 64 cas ; DOM et entrées de classement identiques. |
| Rollback | Zéro rappel ou diagnostic nouveau après arrêt, même snapshot. |
| Parcours global | Shell V9 du dist épinglé : scénario CH Altnau/Tesla 20–80 %, 20 stations classées, aucune erreur de page ; source GB Midhope testée à part sur les 64 branches. |

Le dist final est reconstruit depuis les checkouts sources du pin, avec **2 466 fichiers** et manifeste SHA-256 `2391553a5eba1647bd77fe9b586c62c70d3f51139d99fae8a20be42758b8683c`. `verify_candidate_manifest.py` vérifie les 2 466 SHA ; `validate_built_snapshot.py` passe (10 jeux, 46 CPO UK). Par rapport au dist de #144 (manifeste `2b7b9964d8fce26f65aaf1e508717a114cb68ca16c66fb3c06ba9a076f2db52f`), un seul fichier est ajouté (`tariff-shadow-adapter.js`) et seuls `runtime-engine.js`, `bridge.js`, `v9-production-shell/index.html` changent. **Zéro fichier `snapshot-inputs/`, `data/` ou `runtime/data/` n'a changé.** Les 721 résultats runtime historiques sont conservés octet pour octet dans les rapports du dépôt.

Sur le dist final et ce Mac, le vrai second calcul Chromium a un p95 de **0,70 ms** en desktop et **4,80 ms** en mobile émulé avec CPU 4× ; le p95 de l'évaluation entière passe de 1,30 à 2,20 ms en desktop et de 6,90 à 12,50 ms en mobile émulé. Les 64 diagnostics ont zéro divergence et zéro erreur. Ces mesures sont locales, chaudes et hors Production ; elles ne définissent pas un budget universel. Le parcours global V9 final classe 20 stations CH/Tesla, sans erreur de page, avec shell flag absent. Le mini dist de CI utilise les modules Production/overrides et seulement la fixture gzip Midhope exacte ; il ne prétend pas remplacer le parcours global sur le dist complet.

## Matrice GO / NO-GO

| Décision | État | Gate |
| --- | --- | --- |
| Raccordement shadow hors Production | **GO pour revue** | Pin, quatre tuples, flag explicite, zéro mutation, latence mesurée et rollback testés. |
| Activation du flag dans la configuration livrée | **NO-GO** | Interdite dans cette PR ; revoir prix fournisseur sur un pin ultérieur, source, CI et décision humaine. |
| Remplacement du moteur de prix ou du classement | **NO-GO** | Le contrat #135 exige couverture exhaustive et oracle pour toute cohorte promue ; les 62 montants sans oracle et 18 divergences insuffisantes restent bloqués. |
| Autres cohortes | **NO-GO** | DE*EDH sans source CHF/FX, Lully Direct inactif, Electra/Electroverse et autres sources hors flag. |
| Déploiement / fusion | **NO-GO** | Rebase et CI sur chaque SHA réellement intégré, revue humaine, publication séparée. |

Arrêt immédiat si pin différent, tuple ou canal inexact, contradiction de composants ou provenance, disparition d'ID ou offre non couverte. Le rollback est synchrone et ne touche ni snapshot, ni réponse ancienne, ni collecte.

## Ordre de fusion proposé, sans exécution

1. **#135** : revoir puis intégrer le contrat de conception, documentation seulement ; vérifier que les gates source/prise/branche et l'arrêt sur divergence sont acceptés.
2. **#134** : intégrer le regroupement physique de présentation. Rejouer `v9-physical-site-identity-132`, `v9-station-card-lot1` et `v9-shell-grouping` ; Bois-d'Arcy doit rester **3 stations source, 28 PDC, 12 seules portées Electra prouvées**. Vérifier aucun changement à RawOffer/OfferScope, aucun tarif transféré par le site. Le conflit potentiel est `v9-production-shell/bridge.js` avec cette PR ; résoudre au niveau de l'appel au runtime, sans remplacer la logique de regroupement.
3. **#136** sur le `main` incluant #135/#134 : rebase de la base historique (actuellement `main`), CI catalogue, 666 631 RawOffer et IDs. Puis **#137**, **#138**, **#139**, **#141**, **#142**, **#143**, **#144** dans cet ordre de base empilée, chacun rebasé sur le SHA nouvellement intégré avant fusion. Les scripts dual-run, oracle, reconcile, golden et rapports sont retouchés à plusieurs étages ; résoudre par ordre de phase et exécuter les validations propres à chaque PR, sans régénérer le pin par une collecte.
4. **Cette PR** après #144 : rebase sur la nouvelle tête ; résoudre `bridge.js` avec #134, `runtime-engine.js`, `build_snapshot.py` et la liste des modules shell contre le `main` alors courant. Refaire build du pin, validation de tous les SHA, 721 lignes, 64 branches Midhope, tests desktop/mobile et parcours global. Vérifier `tariffShadowFlag` absent du shell-config construit. Aucun merge automatique.
5. **Data Lab #332** : intégrer le passage de relais mémoire une fois les décisions Production versionnées. **#140 Lully** reste un chantier indépendant d'activation Scan Pay.

Chaque fusion éventuelle doit recontrôler les déclencheurs Actions et l'état de branche avant push. Aucune étape ci-dessus n'autorise publication Pages/Cloudflare ni activation du flag.
