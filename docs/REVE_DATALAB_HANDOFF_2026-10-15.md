# Espagne REVE : entrée Data Lab épinglée

Le constructeur accepte désormais `datasets[ES].primarySource=dataLab` avec
`path=data/reve_v2/validated_runtime` dans une configuration de snapshot
immuable. Il vérifie les deux manifestes, les SHA-256 des fichiers compressés,
les comptes de tuiles, le nombre de stations et la cohérence de génération,
puis copie les tuiles et offres dans les chemins V9 existants. La provenance
est conservée dans `snapshot-inputs/ES/reve-source.json`.

La configuration de développement reste inchangée : elle lit encore le pin
Stable `0a6d2c34`. Le bundle public Stable de ce pin et celui du dernier
`main` Stable sont identiques pour les deux répertoires Espagne au 15/10.
Le portage du constructeur et la graine Data Lab sont suivis dans Data Lab
PR #309. Après le seed, créer un candidat avec SHA Data Lab exact, comparer
les fichiers ES et le build complet, puis seulement changer le pin de
développement. L'ancien rafraîchissement mensuel Updater Test reste actif
jusqu'à ce contrôle et la possibilité de rollback.
