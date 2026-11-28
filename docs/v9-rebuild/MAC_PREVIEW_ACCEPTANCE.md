# Recette locale et préparation d’une préproduction V9

Le Mac utilise les artefacts dont ChatGPT a établi la provenance dans GitHub. Relever le run, le job, le SHA du code, l’identifiant et le SHA du ZIP, le manifeste d’entrée et la décision de validation. Une collecte partielle reste un checkpoint. L’artefact complet précédent reste disponible pour le rollback.

## Incorporer les nouvelles entrées

- Vérifier l’identité, le SHA et le rôle de chaque entrée sur le Mac. Vérifier les répertoires hors Git et ne versionner que les reçus et preuves publiables.
- Importer le canonique dans un nouveau bundle dont le nom est le SHA du manifeste. Pour chaque entrée remplacée, enregistrer son prédécesseur. Garder les autres identifiants et empreintes. Un inventaire fournisseur ne constitue ni un catalogue national ni une preuve tarifaire.
- Exécuter `scripts/extend_v9_prepared_candidate.py` sur l’index spatial précédent et le bundle suivant. Les fragments sont réutilisés lorsqu’ils portent la même empreinte. Examiner les rapports exacts de consolidation et les entrées rejetées. Tesla reste autonome.
- Pour FX, `scripts/import_v9_scheduled_fx.py` fournit la table, son SHA et sa date à utiliser dans `scripts/package_v9_preproduction_map.py`. Pour Tesla, fournir le paquet Mac et le SHA de catalogue déjà vérifiés.
- Fournir au paquet le moteur de projection Electroverse lié au bundle et à son IRVE. Un changement de la référence nationale ou de génération exige des preuves de compatibilité avant empaquetage. Le paquet refuse une projection dont les empreintes diffèrent.
- Vérifier le nouveau paquet et son manifeste de fichiers avec `scripts/check_v9_preview_hosting.py`. Les anciens paquets et le brouillon Netlify `6b0ad1b2d87666f9aec31b2a` servent au rollback.

## Parcours de recette technique

1. Exécuter l’oracle de calcul du paquet et les cas de portée exacte sur les assets réellement empaquetés. Contrôler les frais, conversions, offres incomplètes et priorités des trois canaux.
2. Firefox ordinateur et mobile. Vérifier neuf pays, Tesla Milan et Le Chesnay, Buc sans doublon, Carrefour Fécamp sans tarif assigné, filtres, navigation carte et pagination. Tester Ajaccio et Béthune avec le moteur signé.
3. Mesurer les performances des recherches courantes sur ordinateur et mobile, en distinguant les mesures locales des mesures réseau. Contrôler les cinq classements avec l’oracle de recherche. Réutiliser les preuves de couverture et de non-régression à 100 km tant que les entrées concernées sont identiques. L’optimisation résiduelle de la latence à 100 km en zone très dense est reportée au [backlog post-finalisation](POST_FINALIZATION_BACKLOG.md).
4. Avant un déploiement de test, contrôler le dossier servi, les protections noindex, les SHA, la portée du site Netlify et le paquet de rollback. Déployer uniquement un brouillon isolé, puis vérifier l’URL réelle et rejouer la recette. La décision utilisateur G9 intervient après cette recette et reste distincte de la publication publique.

Pour les prochains paquets, exécuter `v9_g9_ordinary_search_browser.py` sur ordinateur puis avec `--mobile` à 390 px. Comparer les signatures du classement. Exécuter `v9_g9_final_user_browser.py --require-form-labels` pour vérifier les libellés des champs de recherche sur les deux largeurs. Les mesures de la première recherche distante s’effectuent sur l’URL immuable avec `v9_radius_performance_browser.py --url <URL> --radii 20 --viewport-width 1280`, puis avec `--viewport-width 390`.

## Critères Mac ouverts avant la prochaine recette

| Porte | Preuves disponibles | Contrôle restant pour le prochain candidat |
|---|---|---|
| G3 | Catalogue canonique, identité nationale et Tesla autonome éprouvés sur le bundle courant | Valider le rôle, la provenance, les identifiants et les unités de chaque nouvel apport destiné au catalogue |
| G4 | Deltas de fichiers, SHA et restauration locaux éprouvés. Qwello et TotalEnergies reçus et contrôlés sur le Mac | Constituer un nouveau snapshot à partir des seules entrées admissibles, contrôler les remplacements et conserver leur prédécesseur |
| G5 | Le journal France Electroverse et sa projection correspondent au catalogue épinglé | Vérifier la portée EVSE et prise de toute nouvelle offre et la compatibilité du journal si l’IRVE change |
| G6 | Oracles locaux et moteur signé éprouvés pour les entrées courantes | Rejouer les scénarios tarifaires touchés par toute règle ou source modifiée et vérifier l’absence de prix inventés |
| G7 | Recherche, couverture, tri, carte, pagination, filtres et scénarios Firefox démontrés localement | Rejouer les parcours affectés et mesurer les recherches courantes sur la composition retenue |
| G8 | Contrôles de paquet et retour arrière local démontrés | Recette HTTPS sur le prochain brouillon, SHA distants, noindex, Firefox, provenance, performances courantes et restauration |

Une preuve officielle dont la portée est historique ou documentaire reste dans les preuves d’intégration. Qwello Saône-et-Loire valide le tarif initial publié à 22 kW. TotalEnergies documente les familles station-service, concessions et Charge+. Ces éléments exigent une attribution tarifaire actuelle à la station ou à la prise avant d’alimenter le calcul. Les cas de station et de puissance servant à qualifier les sources sont conservés avec leur provenance.
