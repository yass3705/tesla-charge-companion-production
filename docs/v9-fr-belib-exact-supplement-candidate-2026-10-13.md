# Candidat FR Belib exact et révision Connected Kerb — 13 octobre 2026

## Pin et publication

Le candidat de développement `2026-10-13-fr-belib-exact-supplement-candidate` utilise Production de cette PR, Data Lab `2cc230af128b316bf980d9e7cd7fc5408301b6a4` et Stable `0a6d2c3415504397310d3dc92fae40be843b2435`. La base France publiée reste celle de Stable ; seuls quatre sites Belib sont ajoutés à partir de la collecte IRVE statique et dynamique épinglée. Le snapshot public `2026-10-13-nine-country-be-belib-exact-candidate` reste inchangé. Aucun déploiement Pages ou Cloudflare.

## France : intégration exacte

Le [rapport Data Lab](https://github.com/yass3705/tesla-charge-companion-data-lab/blob/main/docs/v9-france-irve-pinned-transition-2026-10-13.md) prouve les 17 EVSE actifs des quatre stations suivantes. Le script de build vérifie le SHA-256 statique `7113daf7…`, le SHA-256 source dynamique `92c0d6dc…`, l'identité de l'opérateur, l'accès libre, les coordonnées, les 7 kW AC, l'unicité de l'EVSE et le périmètre tarifaire `flex`.

| Station Belib | EVSE exacts ajoutés et actifs | Offres directes ajoutées |
|---|---:|---:|
| Avenue Émile Deschanel 15 | 5 | 1 offre à 5 EVSE |
| Rue Cortambert 55 | 4 | 1 offre à 4 EVSE |
| Avenue Paul Doumer 39 | 5 | 1 offre à 5 EVSE |
| Rue Pierre Mauroy 15 | 3 | 1 offre à 3 EVSE |

La nouvelle source IRVE contient un quatrième EVSE rue Pierre Mauroy, sans statut dynamique positif ni EVSE correspondant dans l'offre Belib : il est exclu. Les trois sites de parking Belib sans statut positif restent absents. Le supplément conserve toutes les 48 058 lignes de station du pin à l'identique. Résultat France : **48 062 stations, 165 809 EVSE**, contre 48 058 / 165 792. Les offres Belib exactes gagnent quatre stations jointes ; aucun tarif n'est généralisé au réseau.

## Connected Kerb : variation sourcée, contrôle CI corrigé

Data Lab a collecté un nouveau référentiel opérateur le 13/10 09:28 UTC et une nouvelle vérification d'application le 13/10 09:38 UTC. Par rapport au pin précédent, le référentiel opérateur passe de 2 447 à 2 398 sites : 59 IDs sortent et 10 entrent. Le sous-ensemble de prix exacts passe de 2 102 sites / 8 100 connecteurs à **2 054 / 7 842** : 57 sites et 280 connecteurs disparaissent, 9 sites et 22 connecteurs entrent. Parmi les 57 sites sortants, 56 ne figurent plus dans le nouveau référentiel opérateur. Le dernier, Nab Lane, figure encore dans l'inventaire, mais ses six connecteurs sont exclus après réponses `app HTTP 404` ; aucun prix n'est maintenu artificiellement.

Le validateur de snapshot vérifie désormais les nombres du rapport d'exclusion et du dossier d'intégration **épinglés dans le snapshot**, leurs dates de collecte identiques et l'unicité des identités station/EVSE/prise. Le builder avait déjà vérifié, connecteur par connecteur, la présence d'une offre GBP exacte, de ses tranches et de sa provenance application. La constante historique 2 102/8 100 empêchait d'accepter une collecte récente légitime ; sa suppression ne diminue pas le contrôle de provenance. Une diminution non expliquée par les rapports ou un périmètre de prix incohérent reste bloquante.

## Validation locale

- Build complet du candidat : 10 datasets, 2 445 fichiers, 744 593 705 octets ; validateur du snapshot réussi.
- Manifeste : toutes les empreintes SHA-256 vérifiées ; graphe navigateur : 34 dépendances présentes, 7 sources de registre vérifiées.
- Test France : 48 058 stations anciennes identiques, quatre ajoutées, 17 EVSE exacts actifs avec une offre directe chacun ; aucune prise hors périmètre.
- Test Connected Kerb : 2 054 sites / 7 842 offres exactes, fuseau UTC et rejet d'une identité de connecteur altérée.
- Smoke runtime neuf pays, test de puissance IRVE FR, test Belib exact et Electra+ réussis.

Le parcours navigateur automatisé et la CI de la PR passent ([run candidat](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38390558857), [preview](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38390558824), déploiement ignoré). Le [différentiel des deux builds](v9-candidate-source-delta-2026-10-13.md) classe les variations de couverture ; 62 anciens sites DOT-NL tarifés manquent dans la nouvelle source sans identité de remplacement prouvée. Ce pin reste un **candidat de développement**, pas une autorisation de publication publique.
