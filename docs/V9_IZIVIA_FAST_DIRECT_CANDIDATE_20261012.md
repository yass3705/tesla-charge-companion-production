# IZIVIA FAST — candidate V9 direct Type 2/CCS (12 octobre 2026)

## Preuve source et provenance

- [Data Lab run national #38299651696](https://github.com/yass3705/tesla-charge-companion-data-lab/actions/runs/38299651696) : 620 stations FAST tarifées, 616 stations avec au moins un connecteur reconnu, quatre sans connecteur supporté.
- [Data Lab merge #205](https://github.com/yass3705/tesla-charge-companion-data-lab/commit/bddc8f8cd9e092423e173cfa810744f2cdfa4a4a) : récupération fiable des fiches et prix, aucune baisse des seuils de contrôle.
- Candidat épinglé sur ce commit précis ; les artefacts de référence restent datés du 6 octobre et reproduisent les 616 sites, il ne faut pas les décrire comme une extraction nouvelle du 12 octobre.
- Les données directes ne doivent pas être assimilées à un tarif eMSP Electroverse/Electra.

## Stratégie

- Activation uniquement si le manifeste de snapshot contient `franceIziviaFastDirect: true`. Aucun snapshot historique ne change de comportement.
- `scripts/validate_izivia_fast_direct.py` valide l'identité station `FRIZFPFASTxxxx`, la relation station/prise/type/puissance et le texte tarifaire officialisé ; tout écart bloque le build.
- Écarter **12 affectations CHAdeMO** présentes dans les données source. Garder exactement les 616 stations avec Type 2 ou CCS. Les identifiants `izivia-map-...` ne sont pas des identifiants EVSE uniques et ne sont **jamais** inventés comme rapprochement IRVE.
- Tarifs directs : énergie facturée par kWh entamé (0,30 EUR de 09h à 11h et de 15h à 17h, sinon 0,35 EUR), frais de connexion 0,30 EUR/min par **minute entamée** après 60 minutes, horaire de branchement conservé pour toute la session. La première CI de scénarios a détecté que le moteur segmentait à tort les règles verrouillées au démarrage ; un correctif spécifique aux offres `session_start_local_time` a été ajouté avec un pas de facturation des minutes de 60 secondes. Vérifier la nouvelle CI avant validation.

## Critères avant promotion

1. CI de préparation Type2/CCS verte avec 616 sites, 12 affectations CHAdeMO supprimées et aucun tarif inventé.
2. Build global, validateur de snapshot, manifeste et tests de navigateur avec offre réellement attachée à des stations IRVE prouvées ; vérifier les 5 plages et durées de 60/61 minutes.
3. Confirmer que le moteur ne confond pas `connectedTimePerMinuteAfterFreeEur` avec des frais de congestion à 80 % de batterie.
4. Vérifier que les offres qui ne peuvent pas être calculées complètement ne sont pas classées ; ne pas contourner le fail-closed.
5. Fusion/PR puis promotion du pin et Pages distinctes, **aucun déploiement automatique**.

Statut : **intégration candidate en branche, non fusionnée, non déployée**.
