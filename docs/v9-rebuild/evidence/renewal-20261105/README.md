# Tesla autonome et renouvellement réel — 5 novembre 2026

La nouvelle règle Tesla prime la consolidation nationale générique. Le code retire les entrées explicitement Tesla des catalogues nationaux affichés sans modifier leurs archives. Il utilise directement les configurations Tesla/Mac épinglées, sans nouveau prix ni EVSE officiel inventé. Le collecteur Mac n’est pas modifié. Tests sur les neuf pays, Le Chesnay et Milan : `tesla-local.json`, `user-local.json`. Les six EVSE Buc et les offres Powerdot brutes sans attribution demeurent préservés.

Renouvellement réel : runs Data Lab 42076511189 et42076753318 au SHA fb2efece12321c7dcb347166f7a6b4f5eec1e4b5. Contrats complets et SHA vérifiés avant import. Bundle a81e1defb94b88629e06bc09880bb1623aaeeea7de930987fa439cc5a3575a5c : quatre sources IONITY renouvelées, 28 sources canoniques inchangées ; FX renouvelé et épinglé séparément. Tesla demeure l’archive Mac déjà prouvée. Kilowatt est uniquement validé au niveau transport, sans prétendre à une intégration canonique.

Treize parcours ciblés comprennent désormais IONITY IT et GB renouvelés, avec identités/offres exactes jusqu’au calcul et à la fiche. Les exclusions nationales et les offres incalculables sont testées séparément ; treize parcours ne signifient pas treize tarifs calculables. Tests sources, empaquetage, refus FX corrompu, reprise/last-good, oracles combinés et 64 Midhope restent distincts des collectes réelles.

Performance : `dense-equivalence-local.json` conserve les 62 770 résultats et toutes les empreintes d’ordre, prix, carte et page ; 49,102 s à froid contre68,981 s sur les mêmes entrées. L’instrumentation dedupeOffers n’intercepte pas le nouveau prepareOffers : son zéro ne signifie pas absence de coût de préparation. Aucun PASS de performance dense.

Préproduction globale partielle : G2/G4 exigent encore les117 handoffs non vérifiés et une cadence quotidienne autorisée ; les matrices de couverture G3/G5/G6 conservent leurs exceptions et preuves manquantes. Aucune activation permanente, aucun main ni site public modifié. URL et recette distante à ajouter après exécution effective. Paquets/bundles précédents conservés pour rollback.

## Recette distante exécutée

URL : https://6aecc65c572ac7778d850e91--tcc-v9-preproduction-20261028.netlify.app

Déploiement6aecc65c572ac7778d850e91 ready/deploy-preview, published_at=null. Code empaqueté Production cd0a5a4282f4299ea9b386e253fe3be92570ce7a ; Data Lab6900df609après preuves du pilotefb2efece1. Aucune modification produit après empaquetage. Le harnais de mesure accepte maintenant une URL distante, sans changement du paquet.

`integrity-remote.json` : HTTPS/200/noindex, ressources critiques y compris FX et moteurs, crosswalk11669931octets,2526/2526fragments PASS. Son `browserVerified:false` décrit seulement ce contrôleur statique ; les quatre recettes navigateur suivantes sont des preuves indépendantes réellement exécutées sur la même URL.

- `tesla-remote.json` : Tesla/Mac seul dans les neuf pays, Le Chesnay/Milan complets, aucune dépendance nationale.
- `targeted-remote.json` :13parcours, dont IT/GBIONITY renouvelés jusqu’au calcul/affichage ; exclusions/brut corrects, Electra et Electroverse distincts.
- `ordinary-remote.json` :11recherches/neuf pays, Fécamp huitPDC sans prix correctement conservés, aucun seuil de couverture.
- `user-remote.json` : Buc unique/sixEVSE, libellé,20/40/60fiches, pagination, filtres multiples, véhicule, rayon100, carte, mobile390px et signalement.
- `dense-equivalence-remote.json` :52,336s à froid,62770résultats, mêmes SHA des identifiants/ordres/montants/canaux/carte/pages ; limite G7non résolue.
- `rollback-remote.json` : ancien brouillon et public index/manifest inchangés, paquets précédents préservés.
- `github-verification.json` : CI Production42081476692success,lectureseule.

Parcours G9 : ouvrir l’URL, tester Le Chesnay/Milan puis Buc/Fécamp, ajuster véhicule et filtres, afficher20stations supplémentaires, comparer les trois canaux et utiliser le guide/signalement intégrés. Fécamp doit rester « Prix non disponible ». Le succès de ce parcours ne valide pas les117transferts encore ouverts ni une mise à jour quotidienne automatique.
