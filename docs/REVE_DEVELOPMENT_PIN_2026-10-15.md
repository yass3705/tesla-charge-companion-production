# Développement V9 : pin Espagne Data Lab

Le candidat Production #107, run #38749026980, a construit V9 avec le bundle
REVE Data Lab `d5bff031a95e96a76c765457e65ce1a2cc4a9524` : 170 fichiers
Espagne identiques au pin Stable, manifestes valides, chargement de Madrid et
graphe des assets validés. Data Lab #309 a transféré le constructeur national
et la graine ; Updater Test #17 a retiré les déclencheurs historiques en
gardant les dispatchs pour rollback.

Le snapshot de développement désigne ce candidat. Son autre pin Data Lab
`94d4fc6785a0c1d2ed4df1d01b5a30d203bd4cd3` ne change pas et fournit
aussi les offres directes Ze-Watt épinglées. Les workflows de validation et
Pages utilisent le second checkout Data Lab uniquement pour l'Espagne. Le
workflow Pages ne déploie qu'avec `workflow_dispatch` et `publish=true`.

Cette promotion concerne le snapshot **de développement**. La publication
publique V9, la suppression du relais France IRVE et le retrait du site Stable
restent des opérations distinctes soumises à leurs validations.
