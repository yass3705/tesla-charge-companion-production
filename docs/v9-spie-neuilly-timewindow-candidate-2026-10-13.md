# Métropolis Neuilly — taux post-charge selon l'heure locale

## Preuve et périmètre

La [grille publique Métropolis](https://www.metropolis-recharge.fr/) et les [conditions 2026, article 8](https://www.metropolis-recharge.fr/wp-content/uploads/2026/01/CGAUV-Metropolis-2026-01.pdf) fixent à Neuilly-sur-Seine un post-charge de **0,20 €/minute de 08h à 20h** et **0,10 €/minute de 20h à 08h**, après dix minutes sans charge. Les minutes entamées sont dues. La source Data Lab épinglée `e39a4466096b520b3c459e75539bf9b112235165` rattache cette règle à **14 EVSE exacts** de trois stations : `FRMGPP92051T`, `FRMGPP92051U`, `FRMGPP92051V`. Les tarifs énergie et les deux taux restent dans la voie Direct CPO, séparée des eMSP.

Le candidat précédent `2026-10-13-fr-spie-exact-candidate` excluait ces 14 offres faute de calcul des taux horaires post-charge. Le nouveau candidat immuable `2026-10-13-fr-spie-neuilly-timewindow-candidate` compile **740/740 EVSE source uniques** avec une offre exacte chacun : 726 grilles standard inchangées, plus ces 14. Le pin Data Lab et le pin Stable ne changent pas ; l'ancien candidat reste disponible pour rollback.

## Calcul sûr

Le moteur emploie le fuseau `Europe/Paris`, l'instant de fin de charge fourni par le planificateur (ou dérivé d'un début et d'une durée de charge connus), puis les dix minutes de franchise. Il choisit le taux pour chaque minute post-charge entamée selon l'heure locale. Une session traversant 20h additionne les minutes effectivement tombées dans chaque plage ; le passage à l'heure d'hiver est évalué sur la chronologie UTC réelle.

Le détail tarifaire de la voie appliquée affiche uniquement les taux de post-charge effectivement facturés et leurs plages horaires ; les plages non utilisées ne sont pas ajoutées au résumé.

L'évaluation retourne **« Tarif incalculable »** si l'instant de fin de charge ou le fuseau manque, si deux fenêtres se chevauchent ou si une minute entamée traverse elle-même la frontière de 08h/20h : l'attribution contractuelle de cette fraction de minute n'est pas prouvée. Les autres frais post-charge, notamment la règle Ubitricity avec exemption nocturne, continuent d'utiliser leurs chemins antérieurs.

Oracle indépendant du moteur : post-charge débutant à 19h45, vingt minutes stationnées → dix minutes libres, cinq minutes à 0,20 €, cinq à 0,10 € = **1,50 €**. À 10h, 11,2 minutes stationnées → deux minutes entamées après franchise à 0,20 € = **0,40 €**. Le test couvre aussi le changement d'heure d'automne, la fin de charge manquante et le chevauchement de fenêtres.

## Différentiel et publication

Par rapport au candidat précédent, les deux manifests ont 2 447 fichiers et **aucun fichier ajouté ou supprimé**. Le contrat runtime, le moteur tarifaire, les offres compilées Métropolis, le pont du shell et la configuration du shell changent d'empreinte. Nouveau build : **745 876 157 octets**. Les tests du snapshot, SHA-256, parité Stable, graphe navigateur, smoke neuf pays et parcours navigateur doivent être verts avant fusion. Le shell Pages public reste `2026-10-13-nine-country-be-belib-exact-candidate` ; aucun déploiement Pages ou Cloudflare n'est demandé.
