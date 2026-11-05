# Mise à jour : quatre correctifs testés sur le nouveau brouillon

https://6aecc65c572ac7778d850e91--tcc-v9-preproduction-20261028.netlify.app

Libellé EVSE, position du bouton d’adresse, Buc et Tesla/Mac autonome sont implémentés. Le Chesnay ne dépend plus de l’IRVE ; Milan et un Superchargeur par pays passent dans le navigateur distant. L’ancienne conclusion « Le Chesnay sans correspondance nationale » est invalidée par la règle Tesla prioritaire et ne constitue plus une exception. Preuves : `renewal-20261105/user-remote.json`, `tesla-remote.json`. Aucun collecteur Mac modifié, aucune attribution par proximité. Les paragraphes suivants sont l’historique daté de préparation.

# Lot G9 — état après mandat de finalisation du 5 novembre

Le mandat de finalisation autorise désormais l’implémentation. Les restrictions d’attente ci-dessous sont historiques et remplacées par ce mandat.

- **Libellé EVSE : corrigé et vérifié sur URL distante.** L’EVSE_ID officiel est affiché, le connecteur reste une identité distincte.
- **Tesla Milan : régression corrigée.** La garde du chargeur était limitée au Maroc. Configuration, devise EUR et plages source restaurées ; session navigateur vérifiée à 21,60 EUR pour ses entrées fixes.
- **Tesla Le Chesnay : transformation restaurée, attribution nationale non démontrée.** Le même oracle source donne 4,20 EUR pour 10 kWh au scénario archivé. L’absence d’identifiant EVSE national dans l’archive Mac interdit l’affectation à IRVE. Aucune fiche Tesla autonome ni prix transféré par adresse/GPS. Cette limite reste ouverte.
- **Adresse par défaut : corrigée.** Bouton placé près de Position actuelle, stockage conservé ; tests ordinateur et 390 px distants.
- **Buc / consolidation : corrigé transversalement.** FR/BE/CH/DE/ES/NL nationaux exclusivement ; CPO en enrichissement exact seulement. Buc conserve ses six EVSE IRVE et aucune station autonome DL002019. Les sept offres source restent archivées sans attribution fictive.

[Recette et limites du nouveau candidat](g9-finalization-preview-20261105.md). L’ancien brouillon reste inchangé.

---

# Préparation historique du lot G9

Ce lot commence uniquement après validation utilisateur du nouveau brouillon G9. Le candidat 31 sources, l'ancien brouillon et le site public restent inchangés pendant cette préparation.

1. **Libellé EVSE** — reproduire sur la fiche Carrefour Fécamp le cas où « identifiant individuel non fourni » précède un EVSE_ID officiel. Inspecter la construction des entrées PDC dans `v9-production-shell/bridge.js` (`entries`, `exactIds`) et distinguer identifiant individuel de connecteur et EVSE_ID officiel. Corriger le libellé commun sans inventer d'identifiant ; ajouter un test de fiche avec EVSE_ID fourni et connecteur sans identifiant individuel.
2. **Tesla Milan et Le Chesnay** — tracer les mêmes stations et EVSE depuis le flux Tesla/Mac existant, l'import Production, le bundle canonique, l'éligibilité de l'offre, le moteur et la fiche. Classer absence de données, portée, transformation, calcul ou affichage. Réutiliser les archives et oracles existants ; ne pas modifier l'acquisition Updater Test ni rechercher de nouveaux tarifs.
3. **Adresse de départ par défaut** — retrouver le contrôle de sauvegarde de l'adresse et la commande « Ma position » dans le shell V9. Déplacer le contrôle à côté du champ d'adresse de départ et de « Ma position », conserver stockage et accessibilité, vérifier ordinateur et mobile.
4. **Doublons base nationale/CPO** — établir la provenance exacte des deux fiches Intermarché Buc et identifier la création de ligne dans la normalisation ou la jointure. Règle obligatoire : si une base nationale existe dans le pays, seules ses stations et PDC peuvent être affichés ; le CPO enrichit ces identités nationales et ne crée aucune station ou ligne supplémentaire. Une source CPO autonome n'est permise que dans un pays sans base nationale. Tester les cas nationaux avec et sans correspondance exacte, les trois canaux, la déduplication et le pays sans base nationale. Ne faire aucune jointure approximative.

Après chaque correction, exécuter les tests ciblés, puis la recette intégrée pertinente sur un nouveau candidat isolé. Aucun de ces quatre changements n'est inclus dans le brouillon de la première recette G9.
