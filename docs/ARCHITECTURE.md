# Architecture TCC V9 — reconstruction du 5 novembre 2026

L’acquisition Tesla/Mac reste dans Updater Test. Data Lab exécute les méthodes conservées dans des répertoires isolés ; les checkpoints incomplets sont distincts des artefacts validés. Production importe des sources explicitement épinglées par manifeste et SHA, prépare un snapshot isolé, puis son moteur et son interface consomment ce snapshot.

Dans FR/BE/CH/DE/ES/NL, le catalogue national qualifié est l’unique origine des stations et PDC. Les CPO/eMSP ne fournissent que des enrichissements de portée unique démontrée. IT/GB/MA utilisent les archives CPO qualifiées faute de base nationale exploitable qualifiée dans ce candidat. Ce choix décrit les archives disponibles, pas une affirmation d’absence de registre dans le pays. Les identifiants officiels restent inchangés.

Les branches de reconstruction possèdent deux workflows communs Data Lab et une vérification Production en lecture seule. Les anciens YAML Production sont restaurables depuis `archive/v9-production-workflows-20261105/manifest.json`. Cette consolidation ne modifie pas les workflows de main. Actions Data Lab reste désactivé ; un pilote historique a réellement réussi, les autres transferts n’ont pas de preuve distante.

Netlify héberge uniquement des brouillons manuels du projet indépendant autorisé, sans connexion Git ni `--prod`. Chaque URL est immuable ; le candidat G9 précédent et son bundle restent disponibles pour retour arrière. Le site public demeure sur son snapshot antérieur et sa promotion exige un accord distinct.

Stable est une référence historique/rollback uniquement. Cloudflare est abandonné. L’ancienne architecture est conservée dans [l’archive documentaire](v9-rebuild/archive/architecture-before-20261105.md), sans valeur de consigne active.

Voir [la conformité et les limites](v9-rebuild/FINALIZATION_CONFORMANCE_20261105.md), le [contrat d’hébergement](v9-rebuild/PREPRODUCTION_HOSTING.md) et le journal Data Lab `memory/V9_REBUILD_PROGRESS.md`.
