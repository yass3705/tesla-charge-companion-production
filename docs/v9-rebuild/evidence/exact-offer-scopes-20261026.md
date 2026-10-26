# Conservation des portées tarifaires — 26 octobre 2026

Deux offres de même prix portées par des EVSE/prises différents étaient fusionnées. La clé de déduplication conserve désormais station, EVSE, prise, réseau, puissance et devise, y compris pour les abonnements/équivalences. Les doublons de même portée restent regroupés ; les prix et le classement métier ne changent pas. Une offre calculée ne masque plus la présence d’une offre brute sur le même canal/PDC.

Paquet local : `site-exact-offer-scopes`, bundle 27 sources `06d149100ca675108910663b2fe81f71bd0747988fc1b932b417256357eeed93`. Le packager copie explicitement le moteur d’offres corrigé. Aucune donnée canonique modifiée.

Validation : test de portées exactes sur modules source et empaquetés, oracle complet de session empaqueté, classement global cinq modes et six tests Python d’empaquetage/manifeste PASS. Huit parcours tarifaires Firefox vérifient maintenant tous les IDs canoniques attendus, pas seulement la validité des offres survivantes : PASS. Neuf pays et mobile 390 px PASS fonctionnels. Rapports JSON adjacents conservés.

Paris 100 km : 8 623 stations, 9 536 ms, changement de page 496 ms. Amsterdam (52.3676, 4.9041), rayons 100/90/80/70/60/50/40/30/20 km : 82 066 / 55 857 / 52 115 / 44 515 / 35 681 / 26 876 / 22 760 / 12 351 / 9 114 ms. Premier résultat sous le budget de 10 s à 20 km, avec cache chaud après la première requête. Les neuf points conservent carte = classement global = correspondances, zoom et navigation sans doublons. Performance dense à 100 km encore insuffisante ; aucun rayon utilisateur changé. Les précédents temps du paquet qui perdait des portées ne valident pas cette version.

G2–G8 restent FAIL : couverture exhaustive, transferts GitHub et URL distante isolée non validés. Aucun déploiement, réactivation Actions ou changement de main.
