# Ze-Watt : offre directe épinglée Data Lab

Le snapshot de développement `2026-10-13-be-energyvision-official-cpo-candidate`
épingle Data Lab `94d4fc6785a0c1d2ed4df1d01b5a30d203bd4cd3`. Ce commit
contient déjà `v9-production-runtime/data/v9/france-zewatt-offers.json`, SHA-256
`a348e2ba192ac6a4f7448703ed088be02acd12904991c65b42532af39ea07b6d`.
Le constructeur copie ce fichier à la place de l'offre Ze-Watt Stable après
contrôle du hash, du canal direct visiteur, des IDs EVSE exacts, de la présence
des règles de prix et de l'absence de baisse du nombre d'EVSE couverts.

Au pin courant, l'ancien fichier Stable contient 39 profils / 757 EVSE exacts ;
le fichier Data Lab a 39 profils / 795 EVSE exacts. Les prix unitaires ne sont
pas comparés : le transfert porte sur la source et le périmètre, sans modifier
le moteur tarifaire. Le snapshot conserve le SHA Data Lab et le résultat du
contrôle dans `snapshot-inputs/FR/zewatt-offer-source.json`.

Ce changement ne publie pas automatiquement le site. Le retrait du
rafraîchissement Ze-Watt Stable demande encore une validation du build et de
son consommateur V9, puis la conservation du rollback Stable.
