# TCC V9.1 — Contrat de reconstruction du moteur tarifaire

Décision produit du 9 octobre 2026. Ce document s'applique à **toutes** les bases, sans relancer la collecte des données. **Il prime sur toute logique historique de filtrage heuristique des tarifs.**

## Invariant fondamental

La granularité de référence est `source/base × station canonique × EVSE (point de charge) × connecteur × puissance kW × canal tarifaire × conditions d'application`.

- Chaque EVSE et chacune de ses puissances doivent disposer d'une ligne dans le moteur, **y compris en absence de tarif**. Ne jamais choisir la puissance maximale d'une station comme proxy de l'ensemble.
- Une source doit conserver ses observations d'origine et leur provenance : identifiants EVSE/connecteur, puissance, CPO, URL ou méthode d'extraction, date, unité, devise, canal (direct/ad hoc, abonnement, autre), conditions, frais et données brutes ou empreinte de preuve.
- Plusieurs tarifs pour le **même EVSE et la même puissance** sont autorisés et conservés. Ils peuvent décrire des situations distinctes (horaire, profil utilisateur, abonnement, moyen de paiement, durée, SOC, puissance, date de validité), ou constituer une contradiction à auditer.
- Un tarif ne peut être attribué à un EVSE/puissance que sur une correspondance **démontrée**. L'identité alphanumérique sans séparateurs est un indice contrôlable, mais ne résout pas les collisions. Localisation + CPO fournissent des candidats à examiner, jamais un prétexte pour supprimer des entrées ni une preuve suffisante à eux seuls.
- Ne jamais convertir une tarification EVSE en tarif « station », ni agréger des EVSE hétérogènes. Regroupement d'affichage permis **uniquement après** démonstration que la tarification et ses conditions sont strictement équivalentes.

## Traitement de plusieurs tarifs sur une ligne EVSE/puissance

1. Conserver **tous** les enregistrements, même si montants et règles divergent.
2. Chercher si la coexistence s'explique par des paramètres vérifiables (canal, horaire, abonnement, condition, date, moyen de paiement, taxe, etc.). Les prix de plusieurs sources restent indépendants.
3. En l'absence d'explication, comparer la page officielle du CPO, son application, la page de paiement ad hoc ou l'API tarifaire documentée, à l'échelle de **ce point de charge**. Enregistrer URL/capture, date, constat et correspondance.
4. Si l'automatisation ne peut pas confirmer le cas, créer une tâche **verification_manuelle** avec pays, CPO, station, EVSE, puissance, sources, prix concurrents, différence et question précise ; **conserver** les tarifs concurrents.
5. Tant qu'un conflit empêche de sélectionner un tarif unique pour **le scénario demandé**, afficher « tarif à vérifier » / conflit, ne pas classer une valeur arbitraire comme moins chère. Les autres scénarios vérifiés restent calculables.

## Politique de non-exclusion

**Jamais d'exclusion par déduction ou raccourci :**
- pas de suppression de tarif pour cause de doublon supposé, montant inhabituel, puissance différente, absence IRVE, échec de correspondance, composant complexe, source moins récente, tarif plus élevé ou autre tarif déjà présent ;
- pas de conversion implicite d'un tarif eMSP en tarif direct CPO ; canaux séparés et filtrage de l'interface distinct de la conservation en base ;
- pas de rejet silencieux d'une station sans tarif : afficher la borne et « tarif indisponible » ;
- pas de fusion par prix identique ou opérateur présumé identique, sans démontrer la même identité et les mêmes conditions ;
- une information incomplète, incompatible ou non calculable doit rester dans un **registre de résolution** avec raison et preuve disponible.

Seules les **exclusions explicitement documentées** par une preuve positive (par ex. accès confirmé non public) peuvent modifier le périmètre d'affichage, sans effacer la donnée du registre ni son historique. Aucun tarif inventé ou extrapolé n'est calculable.

## Calcul exhaustif et explicable

Pour chaque offre éligible au scénario : énergie en kWh, durée de charge et de connexion, tranches, frais fixes/session, frais de stationnement et post-charge, congestion, plages horaires, jours, fiscalité connue, devise, abonnements sélectionnés et validité. Appliquer le SOC 80 % par défaut pour la congestion **si le contrat source ne définit pas d'autre seuil** ; bouton incluant/excluant ces frais par EVSE/offre. Conserver les composantes et la formule du total, ne jamais convertir « non calculable » en 0.

Les éléments « hors périmètre d'affichage », « identité non résolue », « tarif non calculable » et « source effectivement absente » sont quatre états distincts.

## Contrôles obligatoires avant publication

- **Exhaustivité comptable :** nombre d'offres brutes = offres attachées et préservées (en comptant une observation une fois) + offres en attente d'identité + offres explicitement hors périmètre avec preuve. **Zéro perte silencieuse**.
- **Couverture physique :** toutes les lignes EVSE/connecteur/puissance de la base physique sont émises, tarifées ou non.
- **Conflits :** chaque paire de tarifs au même EVSE, puissance, canal et scénario portant un prix incompatible possède un audit source ou une tâche manuelle ; jamais une sélection automatique par priorité, prix minimum, moyenne, dernier import ou premier élément.
- **Régression :** fixtures multi-puissances, deux EVSE de même puissance et prix distincts, deux montants au même EVSE, conditions horaires et abonnements, frais SOC80, identité ambiguë, source inconnue, absence de prix, devise et accès attesté non public.
- **Snapshot :** conservation du Data Lab en lecture ; développement sur branche dédiée. Aucun déploiement de V9.1 sans tests exhaustifs et contrôle des nombres par source/pays.

## Contrat attendu de sortie

Pour chaque ligne : `country, source_id, physical_operator_id, station_id, evse_id, connector_id, power_kw, offers[], matching_evidence[], resolution_status, unresolved_reasons[]`.

Chaque offre conserve `source_offer_id, channel, applicability, components, currency, validity, evidence_url, captured_at, raw_reference, calculation_status, calculated_breakdown`.

Un second registre `unresolved_tariff_observations[]` contient toute observation que le moteur ne peut pas rattacher **sans supposition**. Une donnée en attente de rattachement n'est pas une donnée exclue.

**Statut de ce document : spécification contractuelle de refonte V9.1, pas validation du moteur en production.**
