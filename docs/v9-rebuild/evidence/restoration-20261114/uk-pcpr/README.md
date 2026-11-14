# PCPR : parité et exclusions techniques — 14 novembre

Allego UK run43591511750 réellement acquis et transféré, normalisation et import isolés SHA vérifiés.238offres conservées brutes, aucune calculable faute de puissance fournisseur (toutes238prises max_electric_power=0). Pas de puissance déduite tension×ampérage, aucun prix ajouté au classement. Ce renouvellement n’est pas encore servi dans le brouillon courant.

Correction du garde canonique : accepte un élément OCPI sans restriction/date, déjà calculé par le convertisseur historique ; conserve les gardes composants, taxes, identité, durée/puissance. Les restrictions inconnues sont refusées. Une calculationHold explicite garde toute offre Source EV non démontrée dans unparsedOffers, hors classement. Tests canonical-v9-uk-pcpr-pricing, v9-ocpi-component-coverage et uk-ocpi-first-match PASS. L’audit Source EV historique exigeant les montants corroborés reste intact ; aucune valeur nouvelle acceptée.

G2–G8 restent FAIL globalement. Brouillon6af8470ab1f6ac03083a27f4 intact et entièrement vérifié (preuves ../national-renewal). Le présent correctif runtime nécessite un nouveau candidat et ses tests ciblés avant déploiement.
