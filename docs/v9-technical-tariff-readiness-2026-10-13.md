# TCC V9 — état du candidat technique et tarifaire du 13 octobre 2026

## Références et statut

| Rôle | Référence vérifiée |
| --- | --- |
| Production `main` | `30f2c27519691655b64fc87d12212bdb279e0635` |
| Pin de développement | `2026-10-13-fr-spie-exact-candidate` |
| Data Lab / Stable épinglés | `e39a4466096b520b3c459e75539bf9b112235165` / `0a6d2c3415504397310d3dc92fae40be843b2435` |
| Pages public contrôlé par HTTP | `2026-10-13-nine-country-be-belib-exact-candidate`, depuis `v9-production-shell/shell-config.json` |

Le candidat est **validé techniquement comme candidat de développement**. Il ne constitue pas une déclaration de couverture tarifaire exhaustive ni une publication. Aucun déploiement Pages ou Cloudflare n'a été déclenché pendant les travaux décrits ici. Les snapshots précédents restent utilisables.

## Changements prouvés depuis le snapshot public

| Périmètre | Avant → candidat | Statut |
| --- | --- | --- |
| France IRVE | 48 058 stations / 165 792 EVSE → 48 062 / 165 809 | Quatre sites Belib, 17 EVSE exacts actifs ; toutes les lignes anciennes inchangées. |
| Belib direct | 466/473 → 470/473 stations jointes | Quatre offres directes attachées et calculables sur un scénario de 5 kWh / 60 min. Trois parkings sans statut positif exclus. |
| Electra eMSP FR | 92 850 → 92 867 jointures / 97 371 offres source | 17 jointures exactes Belib supplémentaires ; calculabilité de toutes les offres non déduite. |
| Electroverse eMSP FR | 86 782 → 86 794 jointures / 89 991 offres source | 12 jointures validées supplémentaires ; 3 197 offres sans jointure dans ce pin. |
| DOT-NL | 73 557 → 78 529 sites ; 81 531 → 87 984 configurations tarifées | 62 anciens sites tarifés sans identité actuelle prouvée ; prix historiques non transférés. |
| Connected Kerb UK | 2 102/8 100 → 2 054 sites / 7 842 connecteurs tarifés | Baisse expliquée par l'inventaire CPO courant et des réponses applicatives 404 ; aucune conservation artificielle. |
| Source EV UK | 36/323 → 36 sites / 321 connecteurs | Identités exactes du flux courant. |
| Métropolis / SPIE FR direct | 0 → 726 offres à EVSE exact | Sur 740 EVSE source uniques, 14 Neuilly à frais jour/nuit restent exclus du prix calculé. Dans la zone témoin parisienne, 3 321 → 3 323 stations tarifées sur 3 771. |
| Tesla | 1 112/1 167 sites portent un montant de congestion source | Montants gardés en métadonnée non facturable ; condition d'occupation non fournie par le catalogue. |

Ces mesures couvrent respectivement la **source**, la **jointure** ou la **calculabilité du scénario indiqué** ; elles ne sont pas interchangeables. [Détail du différentiel des sources](v9-candidate-source-delta-2026-10-13.md), [preuve Belib](v9-fr-belib-exact-supplement-candidate-2026-10-13.md), [preuve Tesla](v9-tesla-congestion-conditions-2026-10-13.md), [preuve Métropolis](v9-spie-metropolis-exact-candidate-2026-10-13.md), [audit DOT-NL](https://github.com/yass3705/tesla-charge-companion-data-lab/blob/main/docs/v9-dotnl-pinned-transition-2026-10-13.md).

## Régressions et intégrité

- Build candidat actuel : dix jeux nationaux/plateformes, 2 447 fichiers, 745 853 449 octets ; toutes les empreintes SHA-256 vérifiées. Stable et graphe navigateur (34 dépendances) vérifiés.
- Smoke runtime : FR, IT, CH, DE, ES, NL, GB, MA, BE et Tesla ; navigateur automatisé, exemples Saint-Cyr-l'École/Lidl/Electric 55/Electra, Tesla Matosinhos, libellés, Electra+, Belib et Connected Kerb.
- Tests spécifiques Tesla : les 1 112 montants de congestion ne deviennent pas des frais applicables sans condition d'occupation ou de seuil vérifiée. Quatre Belib chargées par le vrai registre runtime possèdent chacune une offre directe exacte calculable et les offres eMSP distinctes.
- [Production #82](https://github.com/yass3705/tesla-charge-companion-production/pull/82) fusionnée `d459fa0d` ; [Production #83](https://github.com/yass3705/tesla-charge-companion-production/pull/83) fusionnée `32e20e22`. CI de la PR #83 [38393330007](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38393330007) et `main` [38393575432](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38393575432) vertes ; preview `38393575180` verte avec job Pages ignoré.
- [Production #85](https://github.com/yass3705/tesla-charge-companion-production/pull/85) fusionnée `30f2c275` : 726 offres Métropolis exactes, 14 exceptions horaires exclues. CI candidat [38398045169](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38398045169) et preview [38398045097](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38398045097) vertes avec navigateur ; job Pages **ignoré**. Le test parcourt les 726 jointures et compare chaque devis au calcul indépendant kWh/minute entamés.

## Couverture et limites connues

- **France :** la base IRVE récente ne remplace pas encore le pin : elle ferait perdre 3 955 jointures Electroverse uniques tout en en créant 2 173. Les quatre sites Belib sûrs ont été ajoutés séparément. Trois parkings Belib restent sans preuve dynamique positive. Les grilles directes Electra multiples de Carré Vélizy et La Boursidière attendent la relation officielle `chargeTariffId` → EVSE ; elles restent incalculables. Electric 55 Place Lully et Bois-d'Arcy : aucun prix direct consommateur exact n'est prouvé, leurs voies eMSP restent indépendantes. [Audit IRVE](https://github.com/yass3705/tesla-charge-companion-data-lab/blob/main/docs/v9-france-irve-pinned-transition-2026-10-13.md).
- **Pays-Bas :** DOT-NL demeure la source nationale canonique. Parmi 70 anciens sites tarifés sortants, huit candidats de nouveau nom/ID disposent de leur propre grille actuelle et 62 n'ont aucun ancien ID dans la source normalisée du 13 octobre ; 51 étaient `IN_SERVICE` et 11 `UNKNOWN` dans l'ancien flux. L'absence de l'ID ne prouve pas la fermeture physique. Une correspondance EVSE actuelle et le statut CPO sont nécessaires avant toute restauration.
- **Royaume-Uni :** Ubitricity PCPR renvoie un inventaire vide ; EVYVE renvoie 869 sites Blink et reste en quarantaine. GeniePoint 281/1 138 prises avec offre exacte, Zest 2 797/3 469 ; le reste n'a pas de prix direct vérifié. Les 1 146 connecteurs ChargePoint issus d'un partenaire ne sont pas publiés comme prix direct. Les autres CPO déjà intégrés (Allego, Gridserve, Blink, Connected Kerb, Source EV) gardent leurs preuves par connecteur. Fournisseur requis pour Ubitricity/EVYVE et tarifs manquants ; aucune réattribution approximative.
- **Electroverse :** le recensement des statuts publics est à 1 550/22 818, avec 49 erreurs API persistantes malgré petits lots/reprises ; [Data Lab #219](https://github.com/yass3705/tesla-charge-companion-data-lab/pull/219) reste brouillon. Les remises Powerdot/IONITY ne créent pas un prix final sans tarif de référence vérifié. Les overlays eMSP à EVSE exact restent démontrés en France seulement ; pas de généralisation aux huit autres pays.
- **Italie, Suisse, Allemagne, Espagne, Maroc, Belgique :** les entrées épinglées et les adaptateurs passent le smoke, sans revendication de couverture nationale intégrale. AVIA CH 589 connecteurs tarifés stable ; Atlante IT 1 831 → 1 833 ; BE NAP 16 961 sites / 70 523 EVSE dont 57 548 avec prix ad-hoc dans l'entrée source (la calculabilité runtime est un niveau distinct). Le Maroc reste une consolidation CPO partielle, sans base exhaustive. ES/BE/Tesla n'ont pas changé de fichier source entre les deux pins comparés.

Le pin actuel inclut le nouveau fichier SPIE Metropolis : 740 IDs EVSE uniques, dont 726 grilles directes complètes publiées. L'ancien fichier en comptait 1 651 lignes mais seulement 911 IDs uniques ; ces anciens doublons ne sont pas publiés. Les collectes brutes BUMP, ETotem, WAAT et REVE changées entre les deux SHA Data Lab ne deviennent pas automatiquement des offres du candidat : la comparaison des manifestes trouve seulement deux nouveaux fichiers Métropolis, aucun fichier supprimé et cinq fichiers existants changés, dont l'adaptateur Tesla déjà corrigé. Les PR Production #28, #17 et #4 ainsi que Data Lab #219/#197 restent ouvertes ou brouillons ; aucune n'est utilisée comme nouvelle source sans revue.

## Décision de publication future

Le candidat actuel est reproductible et ses exclusions empêchent les faux prix identifiés. Avant publication, trancher la politique concernant les **62 sites DOT-NL anciennement tarifés mais absents du flux actuel**, et confirmer qu'une couverture partielle UK/eMSP explicitement affichée est acceptable. Toute promotion publique nécessite une nouvelle autorisation ; le shell Pages demeure sur l'ancien pin.
