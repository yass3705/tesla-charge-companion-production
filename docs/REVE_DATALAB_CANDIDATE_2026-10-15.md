# REVE : candidat de source Espagne épinglée

Le candidat `2026-10-15-es-reve-datalab-seed-candidate` conserve le pin Data Lab
historique `94d4fc67` pour les autres pays et épingle séparément le bundle ES
Data Lab `d5bff031a95e96a76c765457e65ce1a2cc4a9524`. La graine de ce
commit a été produite par Data Lab run #38748165729, sans appel API, et ses
170 blobs Espagne sont identiques à ceux du pin Stable utilisé par le build.

Le workflow candidat construit et valide le runtime V9 avec la source ES Data
Lab, vérifie les manifestes, la parité exacte des répertoires Espagne, le
chargement de Madrid et le graphe des assets. Il ne change ni le snapshot de
développement par défaut, ni la publication Pages. L'ancien rafraîchissement
mensuel vers Stable ne peut être retiré qu'après réussite de ce candidat et
preuve que Production consomme le pin Espagne lors du cutover de publication.
