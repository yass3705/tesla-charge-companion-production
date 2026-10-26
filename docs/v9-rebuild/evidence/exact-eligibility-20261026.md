# Éligibilité et regroupement des prises — 26 octobre 2026

Le moteur de session empaqueté vérifiait déjà l’identité EVSE, mais l’appel de la liste lors de la formation des groupes ne transmettait pas ces identifiants. Deux prises de même puissance mais portant des offres distinctes pouvaient donc partager un groupe de calcul. Le shell transmet maintenant les identifiants exacts ; une station peut toujours regrouper visuellement ses puissances, en gardant les calculs et offres associés aux bonnes prises.

La déduplication conserve aussi les périodes de validité, leur base temporelle, le fuseau et les restrictions opérateur/type pour les abonnements et équivalences. Les clés déjà calculées sont réutilisées lors du tri des offres, sans recalculer leurs sérialisations. Ni prix source, ni formule tarifaire ou règle de classement modifiés.

La première vérification avait utilisé le module de session historique dans `runtime-owned`; le test utilise désormais le module actif `runtime-overrides` ou celui du paquet. Aucune modification du module historique n’est conservée. Les gardes EVSE seules existaient déjà dans le moteur actif ; le défaut corrigé concerne son appel depuis le shell.

Paquet `site-exact-eligibility`, même bundle immuable 27 sources. Les modules `offer-engine.js` et `bridge.js` sont copiés depuis les sources dans une copie isolée du paquet précédent. Contrôle SHA/hébergement PASS (3 267 fichiers, 263 832 512 octets), sans déploiement. Tests exacts empaquetés, oracle complet de session, classement global cinq modes, neuf tests ciblés et huit parcours tarifaires Firefox PASS. Recette neuf pays/mobile PASS fonctionnels ; performance Amsterdam enregistrée : 100 km = 72301 ms, 90 km = 53419 ms, 80 km = 46305 ms, 70 km = 42309 ms, 60 km = 34217 ms, 50 km = 21732 ms, 40 km = 14961 ms, 30 km = 11945 ms, 20 km = 7177 ms. Le cache est chaud après la première requête ; premier rayon sous 10 s : 20 km. Pas de réduction automatique du rayon utilisateur ; les temps du paquet antérieur ne valent pas validation de celui-ci.

G2–G8 restent non promus. Actions désactivé, main et site public inchangés.
