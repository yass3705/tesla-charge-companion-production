> Complément du 5 novembre 20:00 UTC : les preuves locales eMSP/Belib/Suisse/Allego ont progressé depuis le candidat distant décrit ci-dessous. Voir `evidence/emsp-restoration-20261105/README.md`. Le pilote Electra42093326295 a échoué, Actions redésactivé, 115 handoffs restent ouverts. Aucune promotion globale G2–G8, ni nouveau déploiement à ce point.

# Actualisation du 5 novembre : Tesla autonome et renouvellement borné

Le mandat actuel autorise les tests Actions contrôlés. Deux runs réels (push42076511189, manuel42076753318) ont renouvelé IONITY, FX et Kilowatt ; Actions est de nouveau désactivé. IONITY FR/DE/IT/GB et FX sont importés dans le nouveau candidat ; Kilowatt est validé au niveau transfert seulement. 117 autres handoffs restent non vérifiés ; aucun schedule quotidien ni déploiement public n’est activé.

Tesla/Mac est autonome dans les neuf pays, sans jointure nationale. Les entrées nationales explicitement Tesla sont retirées du catalogue affiché, conservées dans les archives. La règle nationale exclusive demeure pour les autres réseaux. Tests neuf pays Tesla, catalogue national intégral, Buc, classements et moteur sont consignés dans `evidence/renewal-20261105/`.

Amsterdam100 : 62 770 résultats, ordre/montants/canaux/page/carte identiques à l’oracle de référence ; 68 981 → 49 102 ms sur le même scénario. Réutilisation de la préparation immuable des offres ; aucun cache de total tarifaire. La mesure reste une limite de performance, pas un PASS G7. La recette distante du nouveau candidat https://6aecc65c572ac7778d850e91--tcc-v9-preproduction-20261028.netlify.app est exécutée : SHA/2526fragments, treize parcours ciblés, Tesla neuf pays, recherches ordinaires/mobile et rollback PASS. Mesure Amsterdam100 distante52,336s, mêmes empreintes exactes. G2–G8 restent FAIL au niveau global.

# Conformité du candidat de finalisation — 5 novembre 2026

Le mandat du 5 novembre autorise les quatre correctifs G9, les travaux réversibles de reconstruction et un nouveau brouillon Netlify. Le mandat élargi autorise les tests Actions bornés réalisés ci-dessus ; il n’autorise ni fusion main ni publication publique. Le candidat G9 précédent `6aec9f2fb223d58706efe5b5` et le bundle `29e2a5e9331a9d2949e342d245128d45480647f4eed1fc37977f83bc67e059fb` restent immuables.

Cette matrice relie les critères du CDC permanent à leur implémentation et à leurs preuves. **PASS local** ou **PASS historique** ne signifie jamais PASS distant ni promotion de porte. Les preuves distantes actuelles figurent dans `evidence/renewal-20261105/`. Les portes globales G2–G8 restent FAIL tant que les lignes bloquantes sont ouvertes ; G9 attend l’utilisateur.

| Exigence CDC | Implémentation / preuve | Résultat applicable et limite |
|---|---|---|
| G0 branches, modifications préservées | HEAD départ Data Lab `0cb384e8d`, Production `3e68f6f`, fetch, arbres propres ; Stable et Updater consultés sans modification | PASS |
| G0 sauvegarde et retour arrière workflows | Data Lab `check_v9_neutralized_main.py` : 1 207 blobs restaurables, main `c7204b3ef`, zéro YAML actif ; Production archive 64 blobs à SHA et manifeste sur branche seulement | PASS local, main Production inchangé |
| G0 anciens déclencheurs Data Lab neutralisés | API `enabled=false`, main sans workflow ; pilote unique terminé | PASS, réactivation bornée autorisée puis désactivation vérifiée |
| G1 toutes méthodes/destinations, exceptions | registres `migration/v9`, validation G1 acquise ; G2 actuel : zéro méthode utile en attente | PASS historique, pas de réinventaire |
| G1 Ubitricity NL | `legacy_method_unavailable`, acquisition désactivée, last-good conservé | N/A renouvellement, exception nominative |
| G2 modules indépendants et workflows mutualisés | deux workflows Data Lab ; un workflow Production de vérification en lecture seule ; archives exactes des anciens YAML | PASS architecture branche, pas déployée sur main Production |
| G2 orchestration, erreurs, reprise, concurrence | `test_v9_orchestrator.py` 14 tests ; `test_v9_artifact_selection.py` 13 tests | PASS local rejoué |
| G2 pagination, secrets nommés, compatibilité méthodes | preuves fixtures par module dans registres et tests existants ; pagination/compteurs internes et SHA, aucun seuil historique accepté | PASS fixtures existantes, renouvellement réel global NOT TESTED |
| G2 handoffs GitHub réels | pilote IONITY `40753241945`, ZIP local conservé, import quatre pays ; nouveaux runs42076511189/42076753318 et artefacts téléchargés validés ;117autres handoffs non vérifiés | FAIL global ; archive locale ne prouve pas disponibilité actuelle GitHub |
| G2 absence de push main / secrets publication | workflows reconstruits contents:read, sans publication ni workflow_run ; API Data Lab désactivée | PASS local ; CI Production read-only42081476692 PASS ; acquisitions Data Lab documentées séparément |
| G3 schémas / IDs stables / champs source | normaliseurs canoniques, `snapshot.prepare`, import strict, sources brutes préservées | PASS sur sources du candidat ; familles hors candidat pas réputées intégrées |
| G3 collisions, relations, provenance | SHA de chaque source, connecteur→EVSE→station, test import 8 cas ; index national d’ambiguïté globale signé | PASS local ; aucune comparaison aux volumes historiques |
| G3 valeurs absentes / nouveaux ou anciens sites | tests schémas, monnaie/énergie absentes, pas de filtre par variation de quantité | PASS local |
| G3 neuf pays | FR/BE/CH/DE/ES/NL nationaux ; IT/GB/MA CPO qualifiés, aucune base nationale absente inventée | PASS navigation distante des neuf pays, rapport ordinary-remote.json |
| G3 archives non qualifiées | PUN IT non reconstructible au pin ; Repower/Neogy candidats non qualifiés ; UK Eco-Movement ne devient pas base nationale par défaut | Exceptions conservées, aucune nouvelle enquête |
| G4 manifestes / versions / SHA / immutabilité | `snapshot.prepare`, `import_v9_bundle.py`, extension vérifiée des fragments | PASS local et distant ;28sources canoniques inchangées,4IONITY renouvelées et FX épinglé séparément |
| G4 isolation source en échec / last-good / rollback | `test_import_v9_bundle.py`, `test_extend_v9_prepared_candidate.py`, candidats précédents conservés | PASS local, restauration logique vérifiée sans remplacer de déploiement sain |
| G4 acquisition séparée de publication | aucun collecteur ne modifie Production ; paquets isolés, Netlify manuel sans Git | PASS architecture de reconstruction |
| G4 Tesla Mac préservé | catalogue Tesla épinglé SHA `363af2e8…`, acquisition inchangée ; runner Mac hors ligne à l’audit | Import PASS historique ; acquisition nouvelle NOT TESTED |
| G4 renouvellement par famille + import réel | IONITY et FX renouvelés puis servis par le candidat ; Kilowatt transport prouvé, UI non raccordée ; autres familles non démontrées | FAIL global, Actions désactivé / dépendances externes |
| G5 catalogue national exclusif hors Tesla | `consolidateNational`, politique par pays et index global SHA ; aucun CPO non-Tesla ne crée de station/PDC national ; catalogue Tesla/Mac autonome | PASS fixtures et archives complètes du candidat renouvelé32, tests Tesla autonomes neuf pays |
| G5 Buc IRVE/Powerdot | station `FRPD1PITMBUC`, six EVSE officiels conservés ; `DL002019` non autonome ; sept offres Powerdot restent archivées sans attribution | PASS local archive + navigateur |
| G5 exact/absent/ambigu/multiple | tests `v9-national-catalogue-policy`, unicité mondiale avant découpage spatial, connecteur exact ou même identité canonique dérivée | PASS local, aucune jointure GPS/nom/puissance |
| G5 canaux et déduplication | offres remappées sur cibles exactes, source/proof conservés ; aucun remplacement de puissance nationale | PASS local |
| G5 Electroverse | Archive complète signée et normalisation historique exacte ; 31 270 offres attribuées, 31 155 acceptées par le moteur, autres conservées avec motif | PASS archives, oracles et navigateur ciblé ; 128 shards conservés, statuts nationaux incomplets donc renouvellement national non prouvé |
| G5 Electra eMSP | Archive signée : 95 417 offres attribuées, 86 338 raccordées ; restrictions perdues et conflits conservés hors calcul | PASS local archive + navigateur ; collecte Electra42101119558 en cours, ne pas la présenter comme renouvelée |
| G5 autres correspondances historiques | pas de migration automatique des rapprochements de proximité ; CPO sans contrat national reste archivé | Couverture globale FAIL ; limite visible, aucune fabrication |
| G6 énergie, minute, frais session | oracles OCPI et session combinée empaquetée | PASS mécanismes |
| G6 connexion / stationnement / après charge | gardes de durées distinctes, `v9-after-minutes-cap`, Bump, Belib Flex | PASS mécanismes, données manquantes incalculables |
| G6 congestion / SOC / conditions | `v9-congestion-soc80`, conditions non démontrées non facturées ; métadonnées Tesla congestion conservées | PASS scénarios couverts, pas de disponibilité live inventée |
| G6 seuils / paliers / plafonds / minima | oracles OCPI, après seuil, Midhope | PASS scénarios historiques et représentatifs |
| G6 pas de facturation / arrondis | oracles NL, OCPI step_size, Midhope 64 | PASS mécanismes |
| G6 heures / jours / DST / fuseaux | Belib Flex, timezone, Tesla MAD, Midhope | PASS mécanismes ; fuseaux Tesla par pays conservés |
| G6 TVA / devises / FX | natif et conversion explicite, tests devise inconnue et oracle combiné GBP | PASS mécanismes ; conversion manquante non inventée |
| G6 abonnements / éligibilité | offer-engine/session-engine, oracle Direct/Electra/Electroverse + sélection | PASS représentatif ; offre commerciale sans portée reste non classable |
| G6 préautorisation | Midhope 25 GBP exclu des frais ; 64/64 entrées identiques rejouées | PASS historique empaqueté |
| G6 composantes imbriquées / total partiel | gardes simple/rules/component_groups, mutation d’une composante ou restriction supplémentaire Electra → brut | PASS tests de refus |
| G6 absence énergie/durée/devise | tests `v9-missing-energy-session`, `v9-currency-guard`, planificateur | PASS |
| G6 Tesla Milan/Le Chesnay | exclusion Maroc-only du chargeur corrigée ; archives identiques : 10 kWh → 4,80 EUR Milan / 4,20 EUR Chesnay au scénario fixé | PASS moteur et navigateur local : Milan et Le Chesnay autonomes via Tesla/Mac, sans EVSE national requis |
| G6 721 lignes / couverture exhaustive | sorties historiques sans toutes entrées, non reproductibles comme parité exacte ; matrice `g6-mechanism-coverage-20261028.md` conservée | Exception replay 721 ; qualification de toutes cohortes reste partielle, pas de PASS global |
| G7 une fiche / puissances / PDC / prises | catalogue national + cartes regroupées ; ID officiel affiché au lieu du faux libellé manquant | PASS local, six PDC Buc et Fécamp conservés |
| G7 adresse de départ | bouton de sauvegarde déplacé avec Position actuelle, même handler/localStorage | PASS navigateur local |
| G7 20 initiales +20 / pagination / cinq classements | oracle complet cinq modes, test Paris 20/40/60, aller-retour dernière page | PASS local |
| G7 carte densité/zoom / rayon100 | inventaire carte = classement, zoom/pagination, rayon inchangé | PASS fonctionnel ; performance dense ouverte |
| G7 filtres multiples / véhicule / abonnements | preuves précédentes + recette pays et session sur code pertinent | PASS distante controls-remote.json ; catalogue abonnement non qualifié exclu, aucune promesse de couverture commerciale |
| G7 trois canaux / coûts / durée / coût-km / frais / provenance | gardes par offre exacte, oracle session, parcours tarifaires et source/date visibles | PASS local sur mécanismes prouvés, prix absents explicités |
| G7 mobile / accessibilité / aide / signalement | commandes natives, clavier, labels, iframe réel 390px, formulaire local | PASS distante controls-remote.json, 390 px sans débordement et signalement accessible |
| G7/G8 performance Amsterdam 100km | Profils CPU et réutilisation du classement entre cinq modes, pagination et invalidation session testées | Limite persistante ~49 s à froid ; mesure du correctif de tri en cours, aucun PASS performance |
| G8 intégration locale / import / SHA | nouveau bundle, fragments conservés et nouvel Electra, tests des échecs et reprise | PASS locale et distante sur le candidat 32 ; integrity-remote.json |
| G8 sécurité / site public intact | branches isolées, scan public, aucune fusion/activation Data Lab, Netlify sans prod | PASS scans publics et ressources publiques inchangées ; public-before.json / rollback-remote.json |
| G8 HTTPS/noindex/SHA/navigateur distant/rollback | nouveau brouillon autorisé ; tests stricts du paquet exact sur URL | PASS distante : 6aecc65c572ac7778d850e91, 2 526 fragments, recettes Firefox ; rollback antérieur accessible |
| G8 chaîne automatique complète | renouvellements contrôlés IONITY/FX/Kilowatt effectués,117handoffs ouverts, cadence absente ; main Production conserve architecture historique | FAIL, aucune assimilation aux tests G9 |
| G9 URL + parcours + anomalies | guide et formulaire intégrés ; brouillon immuable distinct attendu | PASS URL et guide accessibles ; validation utilisateur reste NOT TESTED |
| G9 validation utilisateur / promotion publique | accord visuel après nouveau candidat ; promotion exige accord séparé | NOT TESTED ; aucune promotion publique autorisée |

## Choix et diagnostics fermés

La consolidation applique la règle nationale même lorsqu’elle retire une fiche CPO auparavant visible. Les données sources et offres non attribuables restent intégralement dans le bundle ; elles ne donnent pas un prix à une autre prise. À Milan, sans base nationale IT qualifiée dans le paquet, la configuration Tesla retrouve son tarif. Au Chesnay, l’exigence d’identité EVSE nationale était une régression de consolidation : elle est supprimée. La configuration source Tesla/Mac s’applique uniquement à son catalogue autonome. Le scénario historique fixé donne 4,20 EUR pour 10 kWh ; la recette navigateur à 45 kWh donne 18,90 EUR. Cela ne généralise pas le tarif à d’autres horaires/configurations.

Le canal Electra manquait pour une raison technique démontrée : le collecteur historique `electra_france_platform_snapshot.mjs` utilisait déjà `norm()` sur les EVSE tandis que le dérivé V9 comparait les chaînes littéralement. Le nouveau dérivé conserve l’identifiant fournisseur étoilé et l’identifiant national sans étoiles, exige unicité globale et présence dans la même localisation source. Le garde moteur exige le tarif ENERGY complet identique à la preuve capture ; toute composante, restriction, devise ou montant différent reste brut. Aucune collecte fournisseur ni recherche de prix effectuée.

L’indice d’ambiguïté national est construit sur toutes les partitions avant sélection spatiale et épinglé par SHA dans le shell. Un EVSE répété ailleurs ne devient donc pas artificiellement unique dans une petite recherche.

## État antérieur des opérations distantes (supplanté par la reprise autorisée ci-dessus)

Actions Data Lab reste désactivé. L’autorisation historique portait sur un seul pilote déjà achevé ; elle ne vaut pas activation permanente. Le nouveau mandat n’autorise pas explicitement cette activation administrative. Les 119 handoffs ne sont ni supprimés artificiellement ni déclarés testés. Production peut vérifier la branche en lecture seule avec son workflow commun ; ce run ne prouve pas une collecte Data Lab.

Avant une reprise quotidienne : autoriser une fenêtre bornée Data Lab après préflight des SHA/déclencheurs, exercer les familles réellement renouvelables et leur last-good, puis importer un candidat explicitement épinglé. La bascule des workflows main et la publication du site public sont deux décisions distinctes. Aucun succès Netlify ne clôture ces points.

Preuves finales de ce lot : [recette distante](evidence/g9-finalization-preview-20261105.md). Les onze parcours ciblés ne signifient pas onze tarifs calculables : trois anciennes fiches CPO autonomes sont volontairement exclues faute de portée nationale démontrée ; deux cohortes restent brutes. Les offres exactes restantes sont évaluées, dont Electra et Electroverse.
