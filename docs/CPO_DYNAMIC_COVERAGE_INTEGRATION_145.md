# Couverture CPO dynamique — correction empilée sur #145

Référence métier unique : [Data Lab `CPO_DYNAMIC_COVERAGE_POLICY.md`](https://github.com/yass3705/tesla-charge-companion-data-lab/blob/docs/universal-cpo-dynamic-coverage-332/docs/CPO_DYNAMIC_COVERAGE_POLICY.md). Cette branche corrige la validation du snapshot courant ; le pin tarifaire `2026-10-15-v9-tesla-mac-ingress-verified`, ses octets et ses SHA ne sont pas réécrits. Aucun flag shadow ou prix candidat n'est activé.

## Avant / après et preuve IONITY

Le run Production [#39165311966](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/39165311966) s'arrête au compilateur UK : `IONITY: count drift: 84 locations / 878 connectors / 878 tariffs`, contre la constante historique `83/872/872`. Reproduction locale avec l'ancien code et la source `origin/main` Data Lab : même exception. Le nouveau compilateur accepte toute variation non nulle si les identités, la visibilité, le pays/CPO, la puissance, les références exactes et les tarifs restent cohérents. Le run local du batch UK complet compile **20 CPO, 9 297 stations**, dont IONITY **84/878/878**. Source IONITY SHA-256 `fd95e3035d8e3d3aa569516f8d1cdc06a32b4a2a78fe984fdd289dcd778607bb`, collecte `2026-10-18T09:32:58.715271Z`.

IONITY ne fournit pas d'EVSE physique dans ce lot (`sourceEvseId` vide sur les 878 prises du pin précédent). La sortie porte l'UUID source en `uid` et ne crée pas d'`evse_id`. Une prise sans `pricePerKwhGbp` garde `tariff_ids=[]` ; un zéro explicite est conservé. Les autres CPO gardent leurs identifiants source. Un lot courant vide est un incident, sauf retrait officiel décidé séparément. Le compilateur accepte un aggregate UK validé et daté en second argument pour réutiliser **le même CPO** en `last_good_stale`, avec date et SHA préservés ; sans précédent daté, il refuse le CPO plutôt que d'inventer une fraîcheur. `build_snapshot.py` expose ce chemin avec `--uk-last-good-batch`. La collecte Data Lab garde aussi le précédent CPO dans l'archive nationale lorsqu'un seul flux échoue.

Le premier run CI de cette PR a dépassé le compilateur UK puis s'est arrêté sur une cause indépendante : le manifeste de provenance IONITY DE ne reconnaissait pas le SHA source `2f4052b0…` de Data Lab `76d47e35…`. Les 200 stations source restent les mêmes ; cinq payloads changent, avec un connecteur supplémentaire. Le supplément de présentation non tarifé garde exactement **188** déjà proches d'IONITY national, **8** quarantaines et **4** stations isolées. Après vérification des deux SHA source et des identifiants/quarantaines par le constructeur conservateur, le manifeste a reçu une entrée explicite pour ce commit. Aucune offre ni prix IONITY DE n'est créé par cette mise à jour. Une nouvelle CI globale doit confirmer la suite du parcours.

## Inventaire ciblé des validations

| Contrôle | Classe | Décision |
| --- | --- | --- |
| `compile_uk_direct_batch.py` : 20 triplets, doublons de quarantaine Wenea/Monta/ParkRecharge, Shell et GeniePoint | A | Retrait des égalités et comptes absolus ; identités et quarantaines restent vérifiées. |
| `verify_zephyre_offer_source.py`, `verify_zewatt_offer_source.py` : comparaison EVSE au précédent | A | Retrait de la condition de non-baisse ; SHA du pin et portée exacte conservés. |
| `build_snapshot.py` : Gridserve `<100`, Electroverse `<5000` ; compilateur Electroverse `<1000` | A | Retrait des minimums historiques ; parité du même lot, références et pin conservés. |
| `validate_built_snapshot.py` et workflow Mac preview : minimums Ubitricity, Gridserve, Atlante, IONITY FR/IT/DE, Electroverse et compteurs DE/MA figés | A | Remplacés par la non-vacuité du réseau historiquement présent et les équations du même snapshot ; prix absents admis sans zéro fictif. |
| Data Lab Zephyre, Suisse, Gridserve, Electra, France IRVE, BUMP et IONITY | A | Correctifs dans la PR Data Lab sœur, sans toucher aux collectes Tesla/Mac. |
| Pagination annoncée, SHA du pin, identité publique, source/CPO/pays, prix et références tarifaires | B | Conservés ; une page absente ou un lot courant vide ne devient pas une baisse admissible. |
| Compteurs internes d'un même run (Gridserve, BUMP, manifeste, génération de tuiles) | B | Conservés comme équations de complétude du lot courant, pas comme seuils entre deux jours. |
| Autres sondes exploratoires non exécutées dans la chaîne UK/V9 | D | Pas réactivées ; toute promotion ultérieure doit appliquer la politique unique. |

Le rapprochement physique #134 reste limité à la présentation. Ni le compilateur UK ni le shadow #145 ne joignent les offres par site. Bois-d'Arcy conserve trois stations source, 28 PDC et seulement 12 portées Electra prouvées. Lully Direct et les cohortes non qualifiées restent hors promotion.

## Contrôles et décision de fusion

Local : huit tests UK ciblés verts, compilation UK complète sur source IONITY courante verte, `validate_built_snapshot.py` sur le dist pin du 15/10 vert (10 datasets, 2 466 fichiers). Fichier IONITY volontairement corrompu avec aggregate précédent daté : IONITY `last_good_stale` au SHA `fd95e303…`, Be.EV `complete`, 20 CPO conservés. Les neuf tests shadow/Phase 7 passent : 666 631 RawOffer, 721 lignes historiques identiques et 64 évaluations Midhope. Rejouer en CI la construction globale et le parcours navigateur sur la PR. Le workflow #39165311966 demeure **rouge historiquement** ; seule une nouvelle exécution sur ce commit peut clore le blocage. Le chemin `--uk-last-good-batch` doit recevoir une archive validée, datée et protégée en opération ; une archive absente ne produit aucun fallback fictif.

**NO-GO fusion** tant que les CI des deux PR correctives, la validation globale actuelle et la revue humaine ne sont pas vertes. Aucun déploiement Pages/Cloudflare, aucune fusion et aucune activation shadow. Après revue : #135 conception, #134 identité physique, puis #136→#137→#138→#139→#141→#142→#143→#144→#145, chaque branche rebasée sur la précédente et validée ; ensuite cette PR de politique Production. La PR Data Lab de politique est examinée séparément après #332, puis sa politique durable est intégrée à `main` Data Lab. #140 Lully reste indépendant. Résoudre les conflits probables dans `build_snapshot.py`, `bridge.js` et les listes de modules shell avant les vérifications de pin, 666 631 RawOffer, 721 résultats, Midhope et regroupement Bois-d'Arcy. Aucun passage à la fusion suivante sur simple concordance de deux moteurs.

| PR | État de revue au 18/10 | Gate avant fusion |
| --- | --- | --- |
| #135 conception | Draft, fusion Git propre ; **NO-GO** | Approbation humaine du contrat et CI documentaire. |
| #134 identité physique | Draft, fusion Git propre ; **NO-GO** | Tests 3 stations source/28 PDC/12 portées Electra ; aucun changement OfferScope. |
| #136→#137→#138→#139→#141→#142→#143→#144 | Draft empilées ; **NO-GO** | Rebase une par une, CI source/oracle/golden et comparaison des SHA du pin après chaque étage. |
| #145 shadow | Draft, état Git `UNSTABLE` ; **NO-GO** | Nouvelle CI globale corrigée, 64 Midhope, 721 lignes, navigateur et rollback. |
| Correction Production présente | Draft à ouvrir sur #145 ; **NO-GO** | CI globale courante et revue de la politique sans publication. |
| Data Lab #332 | Draft, conflit `main` ; **NO-GO** | Résolution explicite du conflit et revue du passage de relais. |
| Correction Data Lab présente | Draft à ouvrir sur #332 ; **NO-GO** | CI des collectes touchées, scan public et intégration de la politique à `main` après validation. |
| #140 Lully | Draft indépendante ; **NO-GO activation** | Preuve Scan Pay et décision distincte. |
