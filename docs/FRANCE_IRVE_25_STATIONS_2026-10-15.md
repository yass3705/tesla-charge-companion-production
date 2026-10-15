# France IRVE — 25 stations Belib/BUMP, comparaison épinglée

Sources : Stable `0a6d2c3415504397310d3dc92fae40be843b2435` après application inchangée des suppléments Belib puis BUMP ; Data Lab `94d4fc6785a0c1d2ed4df1d01b5a30d203bd4cd3` ; statut dynamique au même SHA, généré le `2026-10-13T10:39:11Z`. Les lignes compactes sont comparées par multiensemble `(EVSE, libellé de prise, AC/DC, kW, attributs de groupe)` ; les identifiants EVSE sont dédoublonnés entre prises. Les champs station autres que le compte EVSE et les groupes sont identiques pour les 25 stations. Tous les 56 EVSE historiques approuvés sont `en_service` dans la preuve dynamique épinglée.

| Chaîne | Station | Opérateur | EVSE historiques | EVSE nouveaux | Prises historiques identiques | EVSE supplémentaires |
| --- | --- | --- | ---: | ---: | --- | --- |
| Belib | `FRV75PPX0750` | TOTALENERGIES MARKETING FRANCE | 5 | 5 | oui | 0 |
| Belib | `FRV75PPX1633` | TOTALENERGIES MARKETING FRANCE | 4 | 4 | oui | 0 |
| Belib | `FRV75PPX1634` | TOTALENERGIES MARKETING FRANCE | 5 | 5 | oui | 0 |
| Belib | `FRV75PPX1817` | TOTALENERGIES MARKETING FRANCE | 3 | 4 | oui | 1 |
| BUMP | `FRBMPP750037P500110671593290` | BUMP | 1 | 2 | oui | 1 |
| BUMP | `FRBMPP752936P` | BUMP | 1 | 1 | oui | 0 |
| BUMP | `FRBMPP752963P` | BUMP | 1 | 1 | oui | 0 |
| BUMP | `FRBMPP752964P` | BUMP | 2 | 2 | oui | 0 |
| BUMP | `FRBMPP753047P` | BUMP | 1 | 2 | oui | 1 |
| BUMP | `FRBMPP753082P` | BUMP | 6 | 6 | oui | 0 |
| BUMP | `FRBMPP753146P` | BUMP | 3 | 4 | oui | 1 |
| BUMP | `FRBMPP762610P` | BUMP | 1 | 1 | oui | 0 |
| BUMP | `FRBMPP762660P` | BUMP | 1 | 1 | oui | 0 |
| BUMP | `FRBMPP762675P` | BUMP | 3 | 3 | oui | 0 |
| BUMP | `FRBMPP763214P` | BUMP | 1 | 2 | oui | 1 |
| BUMP | `FRBMPP763217P` | BUMP | 2 | 6 | oui | 4 |
| BUMP | `FRBMPP764658P` | BUMP | 1 | 1 | oui | 0 |
| BUMP | `FRBMPP764661P` | BUMP | 1 | 3 | oui | 2 |
| BUMP | `FRBMPP765303P` | BUMP | 2 | 2 | oui | 0 |
| BUMP | `FRBMPP769180P` | BUMP | 5 | 5 | oui | 0 |
| BUMP | `FRBMPP769464P` | BUMP | 1 | 1 | oui | 0 |
| BUMP | `FRBMPP774893P` | BUMP | 1 | 1 | oui | 0 |
| BUMP | `FRBMPP781203P` | BUMP | 1 | 1 | oui | 0 |
| BUMP | `FRBMPP781386P` | BUMP | 1 | 1 | oui | 0 |
| BUMP | `FRBMPP782250P` | BUMP | 3 | 3 | oui | 0 |

Les 25 lignes nationales sont conservées ; 18 ne gagnent aucun EVSE au-delà des approuvés. Les 6 autres BUMP et la station Belib concernée gardent leurs EVSE supplémentaires, sans nouvelle attribution tarifaire.

## Onze EVSE supplémentaires

| Station | EVSE distinct | Opérateur national | Prise et puissance | État dynamique épinglé |
| --- | --- | --- | --- | --- |
| `FRV75PPX1817` | `FRV75EPX18171` | TOTALENERGIES MARKETING FRANCE | EF 7 kW (AC, 7 kW) + Type 2 7 kW (AC, 7 kW) | `hors_service` (2026-09-28 10:54:44.052000+00:00) |
| `FRBMPP750037P500110671593290` | `FRBMPEBMP7054` | BUMP | Type 2 22 kW (AC, 22 kW) | aucun statut dynamique correspondant |
| `FRBMPP753047P` | `FRBMPE5987` | BUMP | Type 2 22 kW (AC, 22 kW) | aucun statut dynamique correspondant |
| `FRBMPP753146P` | `FRBMPEBMP7073` | BUMP | Type 2 22 kW (AC, 22 kW) | aucun statut dynamique correspondant |
| `FRBMPP763214P` | `FRBMPEBMP9311` | BUMP | Type 2 22 kW (AC, 22 kW) | aucun statut dynamique correspondant |
| `FRBMPP763217P` | `FRBMPE1336` | BUMP | Type 2 3.6 kW (AC, 3.6 kW) | `hors_service` (2026-10-06 05:40:30.712000+00:00) |
| `FRBMPP763217P` | `FRBMPE2561` | BUMP | Type 2 3.6 kW (AC, 3.6 kW) | aucun statut dynamique correspondant |
| `FRBMPP763217P` | `FRBMPEBMP9366` | BUMP | Type 2 22 kW (AC, 22 kW) | `hors_service` (2026-10-06 03:31:36.624000+00:00) |
| `FRBMPP763217P` | `FRBMPEBMP9367` | BUMP | Type 2 22 kW (AC, 22 kW) | `hors_service` (2026-10-06 03:31:36.898000+00:00) |
| `FRBMPP764661P` | `FRBMPEBMP3931` | BUMP | Type 2 22 kW (AC, 22 kW) | aucun statut dynamique correspondant |
| `FRBMPP764661P` | `FRBMPEBMP3932` | BUMP | Type 2 22 kW (AC, 22 kW) | aucun statut dynamique correspondant |

Ces 11 identifiants sont distincts des 56 EVSE approuvés et sont rattachés à des stations du jeu national public avec des groupes de prises et puissances explicites. Le jeu dynamique épinglé n’en atteste **aucun** `en_service` : 4 sont `hors_service`, 7 n’ont aucun enregistrement dynamique correspondant. Leur accessibilité publique et leur état actif individuel restent donc non confirmés au-delà de la présence dans le jeu national ; ils ne reçoivent aucun prix par ce correctif. Ils ne sont ni supprimés ni convertis en EVSE approuvés.

## Parité et données nouvelles

- Historique ciblé : 25/25 stations et 56/56 EVSE approuvés présents, signatures de prises et puissances identiques, opérateurs et autres champs station identiques ; 0 signature historique manquante.
- Nouvelle génération nationale : 49 185 stations contre 48 058 avant supplément historique, soit +1 127 avant traitement. Après les 25 ajouts historiques, la comparaison brute donne 49 185 contre 48 083, soit +1 102 stations conservées. Ce delta n’est pas qualifié de parité stricte avec l’ancien inventaire.
- Offres sources Belib et BUMP dans Stable `0a6d2c34` et `6b1c6261` : SHA-256 inchangés respectivement `92d4904ecd8b9517dd4c2e388dfea422accb4c4000992cce4291af4703cf1a7e` et `5db950bd8418a633af49f436ccf53a7c39336646416a6ae94457a168db4b83d4`. La parité des offres **construites** et des prix reste à confirmer par CI.
