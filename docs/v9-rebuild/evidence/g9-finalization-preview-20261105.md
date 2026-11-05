# Candidat de finalisation — recette distante du 5 novembre 2026

**Candidat de test vérifié, conformité globale partielle.** Les portes G2–G8 ne sont pas promues. L’utilisateur peut effectuer sa recette G9 sur le nouvel environnement, sans remplacement du précédent.

URL : https://6aecb7777c40e2f98d53a4fb--tcc-v9-preproduction-20261028.netlify.app

Projet Netlify `c4df2a8f-f57a-4d59-9e8f-df6da40f713f`, déploiement `6aecb7777c40e2f98d53a4fb`, `ready`, `deploy-preview`, `published_at=null`, aucune liaison Git. Commande utilisée : `netlify deploy --site c4df2a8f-f57a-4d59-9e8f-df6da40f713f --dir <workspace>/.tcc-v9-cache/finalization-20261105/site --no-build --json` (sans option de production).

Code Production `1b9df09d5e27693ee331d110ed2a649ca0d25247`, puis corrections du harnais CI seulement jusqu’à `2c3bbe238876349dcd196894a728f9387ca43905`. Data Lab `72b8b2256`. Les modifications documentaires/tests suivantes ne modifient pas le paquet déployé.

## Données et intégrité

- Bundle `3f5a9b347aaf824c3433728b8e54dae3051e07bd918efbc597c801150bbf2bb9`, 32 sources : les 31 SHA du bundle précédent sont conservés, ajout du dérivé `FR:electra_emsp_exact`, cinq preuves archivées. Aucun renouvellement fournisseur n’est annoncé.
- Paquet 3 780 fichiers / 289 148 795 octets, hors checkout. L’extension du candidat réutilise 31 sources inchangées, vérifie leurs fragments puis recalcule les manifestes de jointure avec le nouveau bundle.
- [Contrôle distant](finalization-20261105/integrity-remote.json) : HTTP 200 HTTPS, noindex, SHA des ressources critiques et **2 523/2 523 fragments**. Le crosswalk de **11 669 931 octets** est intact. [SHA exacts des ressources](finalization-20261105/local-assets.json), vérifiés à l’identique à distance.
- Les sources publiques nationales FR/BE/CH/DE/ES/NL définissent seules le catalogue. CPO en enrichissement exact uniquement, index national global des EVSE ambigus signé ; pas de correspondance géographique, ni de PDC inventé.
- IT/GB/MA restent des catalogues CPO qualifiés en l’absence de base nationale exploitable démontrée dans ce candidat. Les sources historiques non qualifiées ne sont pas intégrées artificiellement.

## Résultats effectivement exécutés

| Contrôle | Résultat et preuve |
|---|---|
| Archive nationale complète, identités et topologie | PASS [audit](finalization-20261105/national-archive-audit.json), fixtures absent/exact/ambigu/multiple ; aucune station CPO autonome dans six catalogues nationaux |
| Replay Electra eMSP | PASS, mêmes SHA après validation renforcée du manifeste/compteur interne ; garde refuse frais, restrictions, mutation de prix ou portée non prouvée |
| Moteur empaqueté | PASS session combinée Direct/Electra/Electroverse, frais, abonnement, FX ; Midhope 64/64 mêmes entrées ; [exécution locale](finalization-20261105/code-validation.json) |
| Classement global | PASS oracle indépendant cinq modes, cache, aucune restriction moteur aux 20 premières fiches |
| Parcours tarifaires distants | PASS [11 parcours](finalization-20261105/targeted-remote.json) ; six cohortes calculables, deux brutes, trois anciennes fiches autonomes exclues conformément à la règle nationale |
| Recherche ordinaire distante | PASS [11 recherches / 9 pays](finalization-20261105/ordinary-remote.json), classement des prix calculables, carte, résultats supplémentaires, aucune erreur de chargement source |
| Correctifs G9 et contrôles UI | PASS [recette distante](finalization-20261105/controls-remote.json), Buc six EVSE, Milan EUR, libellés, mémorisation adresse, Paris 20/40/60 et dernière page, filtres multiples, puissance, Tesla/tous, batterie/consommation/puissance véhicule, rejet batterie invalide |
| Mobile / accessibilité de base | PASS même URL, vrai viewport iframe 390 px sans débordement, 20 cartes et 13 marqueurs, boutons voisins et formulaire de signalement accessible |
| CI GitHub Production read-only | PASS [run 42071503610](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/42071503610), 14 suites Node, 11 tests Python, 64 workflows archivés à SHA exacts ; [étapes](finalization-20261105/github-verification.json) |
| Sécurité | Scans publics des deux dépôts et du paquet PASS ; Data Lab Actions désactivé ; main/Updater/Stable inchangés |
| Retour arrière et site public | PASS [contrôle](finalization-20261105/rollback-remote.json), ancien brouillon accessible à SHA inchangé, ancien paquet validé localement ; ressources index/manifest publiques inchangées |

Les deux premiers runs CI `42071206148` et `42071437228` ont échoué : un oracle chargeait un dossier `dist` absent d’un checkout propre, puis une dépendance répartie entre les deux répertoires runtime. Le harnais utilise désormais les modules versionnés comme les autres tests, et conserve un argument explicite pour tester le paquet. Les deux modes sont PASS ; aucun changement moteur pour faire passer la CI. Les 64 YAML Production archivés ne sont neutralisés que sur la branche de reconstruction ; main n’a pas été modifié.

La recette tarifaire conserve volontairement trois exclusions : FR Atlante, DE IONITY et FR Powerdot ne créent plus de fiches autonomes nationales lorsque leur portée exacte n’est pas démontrée. Ce n’est pas une preuve de tarification réussie pour ces sources. Les offres originales restent intégralement archivées. Les deux cohortes brutes NL Electra Direct / GB Eco-Movement restent hors calcul. Les autres parcours vérifient Bump, Electra eMSP, Electroverse composé, Atlante IT, Source EV UK et DOT-NL composé.

## Limites et prochaine décision indispensable

1. **Automatisation non validée globalement.** 119 handoffs et renouvellements par famille non démontrés. Actions Data Lab reste désactivé ; une nouvelle fenêtre administrative bornée exige une autorisation distincte, après recontrôle SHA/déclencheurs. La CI Production ci-dessus n’est pas un test de collecte ni un handoff. Aucun seuil de volumes n’est utilisé.
2. **Correspondances tarifaires incomplètes.** Le Chesnay : transformation Tesla restaurée et oracle source PASS, mais aucune identité EVSE nationale disponible dans l’archive Mac pour affecter son offre à IRVE. Fécamp reste sans offre exacte sur les trois canaux. Plusieurs zones n’ont aucun tarif calculable ; leur navigation réussie ne prouve pas une couverture commerciale complète. Aucune enquête fournisseur engagée.
3. **Performance dense ouverte.** Amsterdam 100 km : dernière mesure 48,1 s à froid. Pas de nouvelle mesure ni déclaration de performance acceptable ; rayon 100 km conservé.
4. **Couverture formelle CDC partielle.** Les mécanismes prouvés et exceptions sont tracés dans [la matrice](../FINALIZATION_CONFORMANCE_20261105.md). Les 721 résultats sans entrées complètes ne sont pas présentés comme reproduits. Aucun renouvellement Tesla/Mac exécuté, aucun dispositif historique remis en service.

## Parcours utilisateur G9

Ouvrir le guide « Recette » intégré. Rechercher Buc (une fiche IRVE, six EVSE), Fécamp (huit PDC, prix indisponibles), Milan Piazza Arduino (offre Tesla selon date/heure et véhicule), puis une zone courante. À Paris, vérifier 20 fiches puis 20 supplémentaires par action ; modifier les réseaux et le véhicule, afficher la carte. Les tarifs Electra prouvés se trouvent notamment à Jarville-la-Malgrange et Saint-Arnoult ; ils restent distincts du Direct et d’Electroverse. Utiliser le formulaire de signalement intégré en cas d’anomalie. Aucune publication sur le domaine public TCC n’est autorisée.

## Reprise technique exacte

Réutiliser le paquet `.tcc-v9-cache/finalization-20261105/site` et son URL ci-dessus ; ne pas redéployer ni rejouer les mêmes tests sans modification. Recueillir la recette utilisateur. Avant toute nouvelle exécution Data Lab : obtenir l’autorisation administrative bornée, reprendre le dossier pilote à partir des HEAD courants, vérifier les anciens déclencheurs neutralisés et tester les familles renouvelables/last-good. Ne pas fusionner main, modifier l’acquisition Mac ou publier le site public. Les corrections indépendantes restent autorisées sur les branches de reconstruction.
