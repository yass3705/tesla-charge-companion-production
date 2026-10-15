# Diagnostic différentiel des 449 EVSE BUMP — 15 octobre 2026

Périmètre : PR Production #104, sans changement des suppléments, offres, prix, pins ni publications. La [table individuelle](FRANCE_IRVE_BUMP_449_DIAGNOSTIC_2026-10-15.csv) classe exactement les 449 IDs de la [liste de départ](FRANCE_IRVE_BUMP_449_MISSING_2026-10-15.csv). Elle donne pour chaque ID la station historique et brute, l'ID PDC local, l'opérateur, les coordonnées, l'ancienne signature, la puissance, les cinq indicateurs de prise, les dates, le statut dynamique, les générations limites, le SHA de source et l'action proposée.

## Résultat vérifié

| Classe | EVSE | Preuve |
| --- | ---: | --- |
| Présents dans le CSV national brut, puis filtrés car aucune prise EF/Type 2/CCS déclarée | **449** | CSV PAN SHA-256 `ba0f806ed55da93f7c4f70c933447b9a99baed2005664c56c253f87eaebc921d`, identique au manifeste Data Lab `045283b7c`; 449 IDs uniques, 449 lignes brutes, opérateur `Bump`, même ID de station et même puissance que l'ancien inventaire. |
| Dont aucune prise déclarée du tout | **373** | `prise_type_ef`, `prise_type_2`, `prise_type_combo_ccs`, `prise_type_chademo`, `prise_type_autre` valent tous `false`. |
| Dont seule la prise « autre » déclarée, sans type physique précisé | **76** | Quatre prises standard `false`, `prise_type_autre=true`. Les 76 anciennes lignes sont à 3,7 kW ; la puissance seule ne démontre pas le type de prise. |
| Station toujours dans le snapshot statique récent | **262** | ID de station présent dans `all.json.gz` de `045283b7c`. |
| Station entière absente du snapshot statique récent | **187** | ID de station absent de `all.json.gz`, mais station et EVSE présents dans le CSV brut ; ses PDC sont écartés par le filtre. |
| ID EVSE remplacé ou modifié | **0 établi** | Les 449 IDs exacts existent dans la source brute récente, avec le même ID de station ; aucune recherche par proximité n'est nécessaire. |
| Filtrés en raison du statut dynamique | **0** | Le constructeur statique ne lit pas le statut dynamique. Aucun des 449 IDs n'est dans les enregistrements dynamiques aux pins des 13 et 15 octobre ; cette absence ne démontre pas une mise hors service. |
| Disparus en amont de Data Lab | **0** | Tous présents dans le CSV brut de même SHA que le snapshot du 15 octobre. |
| Absence active légitime prouvée | **0** | Type de prise utilisable et statut actif restent à établir pour les 449. |

Les 449 sont ainsi **retrouvés** et leur disparition du snapshot statique est **entièrement expliquée par le filtre de connecteurs**. Leur caractérisation physique et leur éligibilité à la couverture active restent **incertaines pour 449/449**. Il s'agit d'un défaut de données source / de caractérisation des prises à instruire, pas d'une preuve de perte dans le téléchargement Data Lab. La condition d'accès brute indique « Accès libre » pour les 449, mais ne prouve ni disponibilité effective ni type de prise. Les dates `date_maj` individuelles (de 2025-11-04 à 2026-08-17) et `date_mise_en_service` figurent dans le CSV ; elles ne sont pas des statuts temps réel.

## Chronologie et cause précise

| Génération Data Lab | Source brute | Constructeur | 449 IDs présents |
| --- | --- | --- | ---: |
| `eb12158297` (5/10) à `558605e096` (10/10), cinq snapshots | Sources successives | Constructeur initial | 449/449 |
| `372a95fd77` (11/10 08:52 UTC) | `d82557bddd45…` | Constructeur initial | 449/449 |
| `5a5b29aa9f` (11/10 10:07 UTC) | **même** `d82557bddd45…` | Constructeur `d89b0ebf6` : seules EF/Type 2/CCS admises | **0/449** |
| `d63710f867` (13/10, pin de #104) | `0bccf0ba9192…` | Même filtre | 0/449 |
| `045283b7c` (15/10, génération plus récente) | `ba0f806ed55d…` | Même filtre | 0/449 |

Le changement de constructeur `d89b0ebf6` a retiré le comportement antérieur qui transformait les lignes sans prise en groupe `INCONNU` et acceptait `prise_type_autre`. Il saute désormais les lignes sans EF, Type 2 ni CCS. Le basculement `372a95fd77` → `5a5b29aa9f` se fait sur **le même SHA de CSV brut** : la disparition initiale n'est donc pas due à une suppression en amont ni à une mise hors service. Les anciennes étiquettes `IRVE · DC 150 kW`, etc. provenaient de la puissance d'une prise `INCONNU` ; elles ne prouvent pas CCS. Pour les 76 lignes « autre », `true` ne caractérise pas davantage la prise. Les puissances brutes et historiques concordent 449/449 ; les types physiques approuvés ne sont pas déductibles.

La nouvelle extraction du 15 octobre ne rétablit **aucun** des 449 dans le snapshot normalisé. Son fichier brut public a été retéléchargé en lecture seule et son SHA vérifié identique au manifeste ; aucun pin Production n'a été modifié. Les deux générations dynamiques vérifiées (13/10 10:39 UTC et 15/10 08:21 UTC) ont 0 enregistrement exact parmi ces 449, 0 `en_service` et 0 `hors_service` explicite pour eux.

## Suite nécessaire pour #104

1. Faire qualifier à la source publique ou par preuve CPO, ID par ID, le type physique de prise et l'état exploitable. Pour les 373 lignes sans prise déclarée, corriger les indicateurs source si une prise EF/Type 2/CCS existe réellement ; pour les 76 « autre », documenter ce que « autre » signifie. Ne pas inférer CCS d'une puissance DC ni Type 2 d'une puissance AC.
2. Data Lab doit conserver le filtre EF/Type 2/CCS actuel tant que cette preuve manque. Après correction amont vérifiée, produire un **nouveau snapshot candidat**, tester l'intégrité par ID et prise, puis examiner l'effet sur les offres BUMP approuvées et le comparatif de builds. Si certains EVSE sont réellement non couverts, documenter l'écart métier et décider explicitement de leur traitement ; ne pas les réinjecter ni forcer la parité.
3. #104 reste bloquée pour le canary : le validateur BUMP exact a raison de refuser 449 identités attachées aux offres mais absentes de la base utilisable. Aucun calcul tarifaire ni relais historique ne doit être changé par ce diagnostic.

Méthode : lecture des neuf manifests et `all.json.gz` versionnés Data Lab, comparaison des 449 IDs exacts et de leurs stations ; `git diff` du constructeur avant/après `d89b0ebf6` ; lecture du CSV national brut du 15 octobre (même SHA que le manifeste), et des snapshots dynamiques épinglé/récent. Pas d'audit tarifaire général, pas de rapprochement GPS, pas de build Production relancé.
