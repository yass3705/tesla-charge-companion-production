# Différentiel des sources du candidat de développement — 13 octobre 2026

Comparaison de deux builds avec le **même code Production de la PR #82** et Stable `0a6d2c34` : ancien pin Data Lab `047e1911`, nouveau pin `2cc230af`. Les deux snapshots sont validés localement ; le nouveau manifeste vérifie ses 2 445 empreintes SHA-256. Cette comparaison distingue changement de source et changement de code, sans inférer la validité d'un prix depuis une simple présence dans un JSON.

| Périmètre | Ancien | Nouveau | Interprétation |
|---|---:|---:|---|
| France IRVE chargée | 48 058 stations / 165 792 EVSE | 48 062 / 165 809 | Seulement 4 Belib / 17 EVSE actifs exacts ajoutés ; toutes les anciennes lignes restent identiques. La nouvelle base IRVE entière n'est **pas** promue. |
| Belib direct, stations jointes au pin | 466/473 | 470/473 | Quatre sites restaurés ; trois parkings sans statut positif demeurent hors runtime. Il s'agit de jointures, pas d'un décompte de prix calculables. |
| Electra FR direct, offres source compilées | 724 | 721 | Deux règles de Grosseto-Prugna Sofitel sorties avec la station de la carte officielle ; une règle Hauconcourt Novotel n'est plus retournée par l'API, qui garde une autre grille complexe. Aucune ancienne règle n'est réintroduite sans preuve actuelle. |
| Atlante FR direct | 166 sites / 1 446 connecteurs tarifés | 166 / 1 440 | Huit prises retirées à Châtellerault, toutes `INOPERATIVE` ou `BLOCKED`; deux ajoutées à Puget-sur-Argens, aussi `BLOCKED`/`INOPERATIVE`. Évolution du flux opérateur, pas une attribution par proximité. |
| DOT-NL national | 73 557 sites / 83 648 configurations / 81 531 tarifées | 78 529 / 89 094 / 87 984 | +4 972 sites, +5 446 configurations, +6 453 configurations tarifées. Les IDs de 1 000 anciens sites sortent, 5 972 entrent. |
| Connected Kerb UK direct | 2 102 sites / 8 100 connecteurs exacts | 2 054 / 7 842 | 56 des 57 sites tarifés sortants ont disparu du nouvel inventaire officiel ; Nab Lane reste présent mais ses six connecteurs reçoivent `app HTTP 404`. Ne pas conserver un prix ad-hoc historique sans preuve actuelle. |
| Source EV UK | 36 sites / 323 connecteurs / 2 tarifs source | 36 / 321 / 2 | Trois identités de prise sortent, une entre (Weston Retail Park) ; deux anciennes prises Ipswich ne sont plus présentes dans la collecte. Les offres restent limitées aux identités vérifiées. |
| ChargePoint UK via Eco-Movement | 323 sites / 1 142 connecteurs / 144 tarifs source | 324 / 1 146 / 145 | Source partenaire toujours en quarantaine comme tarif **direct** ChargePoint ; ces nombres n'impliquent aucune offre directe publiée. |
| Atlante IT direct | 461 sites / 1 831 prises tarifées | 462 / 1 833 | Collecte opérateur renouvelée, aucune offre moyenne par station. |
| AVIA CH direct | 589 connecteurs tarifés | 589 | Identités conservées. |
| Maroc Kilowatt / TotalEnergies | 43 sites / 87 lignes ; 18 sites / 38 prises | Identique | Les fichiers source changent, mais les décomptes restent stables. |
| ES, BE, Tesla | Fichiers inchangés | Fichiers inchangés | Aucun nouveau tarif de ces catalogues dans ce changement de SHA. |

Les overlays **compilés** Electra eMSP FR (97 371 offres) et Electroverse eMSP FR (89 991) sont identiques entre les deux Data Lab SHA. Leur jointure sur le pin FR ne recule pas, et le complément Belib peut seulement offrir de nouveaux EVSE exacts. Le remplacement complet de l'IRVE reste interdit tant que ses pertes Electroverse ne sont pas résolues.

## Résidu DOT-NL à ne pas masquer

Parmi les 1 000 anciens IDs de site absents de la source du 13/10, **70 sites** portaient 84 configurations tarifées. Huit ont, dans les nouveaux IDs, un site au même nom, mêmes coordonnées et même opérateur, avec une grille actuelle tarifée ; aucun ancien montant n'est copié. Les **62 autres** n'ont pas cette concordance exacte. Leur dernier état source était `IN_SERVICE` dans 51 cas et `UNKNOWN` dans 11. Le nouveau flux DOT-NL ne les contient plus ; cela justifie de **ne pas publier leur prix historique sous un nouvel ID**, mais ne prouve pas que les sites physiques ont fermé. Le contrôle de statut et d'identité des 62 est un chantier restant avant publication publique.

## Fichiers et validations

Le manifeste passe de 2 444 à 2 445 fichiers : un rapport de supplément Belib ajouté ; **81 fichiers existants** changent d'empreinte, concentrés dans NL (45), UK (20), FR (5 hors base IRVE) et quelques sources CH/DE/IT/MA. Le build ancien et le build nouveau passent `validate_built_snapshot.py`. Sur le nouveau : parité Stable, graphe navigateur (34 dépendances), smoke neuf pays, Tesla Matosinhos, Electra+, Belib exact et Connected Kerb passent localement. CI Production PR #82 : build candidat `38390558857` et preview `38390558824` réussis, **job Pages ignoré**. Le parcours navigateur automatisé de `38390558857` passe. Les 62 sites DOT-NL sans preuve actuelle restent hors publication tarifée tant qu'aucun lien exact nouveau n'est démontré.
