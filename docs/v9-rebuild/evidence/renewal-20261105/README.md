# Tesla autonome et renouvellement réel — 5 novembre 2026

La nouvelle règle Tesla prime la consolidation nationale générique. Le code retire les entrées explicitement Tesla des catalogues nationaux affichés sans modifier leurs archives. Il utilise directement les configurations Tesla/Mac épinglées, sans nouveau prix ni EVSE officiel inventé. Le collecteur Mac n’est pas modifié. Tests sur les neuf pays, Le Chesnay et Milan : `tesla-local.json`, `user-local.json`. Les six EVSE Buc et les offres Powerdot brutes sans attribution demeurent préservés.

Renouvellement réel : runs Data Lab 42076511189 et42076753318 au SHA fb2efece12321c7dcb347166f7a6b4f5eec1e4b5. Contrats complets et SHA vérifiés avant import. Bundle a81e1defb94b88629e06bc09880bb1623aaeeea7de930987fa439cc5a3575a5c : quatre sources IONITY renouvelées, 28 sources canoniques inchangées ; FX renouvelé et épinglé séparément. Tesla demeure l’archive Mac déjà prouvée. Kilowatt est uniquement validé au niveau transport, sans prétendre à une intégration canonique.

Treize parcours ciblés comprennent désormais IONITY IT et GB renouvelés, avec identités/offres exactes jusqu’au calcul et à la fiche. Les exclusions nationales et les offres incalculables sont testées séparément ; treize parcours ne signifient pas treize tarifs calculables. Tests sources, empaquetage, refus FX corrompu, reprise/last-good, oracles combinés et 64 Midhope restent distincts des collectes réelles.

Performance : `dense-equivalence-local.json` conserve les 62 770 résultats et toutes les empreintes d’ordre, prix, carte et page ; 49,102 s à froid contre68,981 s sur les mêmes entrées. L’instrumentation dedupeOffers n’intercepte pas le nouveau prepareOffers : son zéro ne signifie pas absence de coût de préparation. Aucun PASS de performance dense.

Préproduction globale partielle : G2/G4 exigent encore les117 handoffs non vérifiés et une cadence quotidienne autorisée ; les matrices de couverture G3/G5/G6 conservent leurs exceptions et preuves manquantes. Aucune activation permanente, aucun main ni site public modifié. URL et recette distante à ajouter après exécution effective. Paquets/bundles précédents conservés pour rollback.
