# Recette du 14 novembre — candidat Atlante renouvelé

URL isolée : https://6af8365acf7552d1d9e1768a--tcc-v9-preproduction-20261028.netlify.app . Déploiement ready/deploy-preview, aucune publication sur domaine TCC, aucun lien Git. Bundle `0bce189c967136aa3c0a46ad298e6b1be4304c80c8eb8c6ff4abb2d5e080ceb6` (33sources). Seules les sources Atlante FR/IT changent ; les31autres SHA canoniques et tout code runtime restent identiques. Acquisition réelle Atlante du5novembre, pas du14 ; référence DataLab run42122453243.

## Preuves déjà terminées

- Paquet autonome4505fichiers : manifeste des fichiers servis, SHA et scan différentiel sans secret PASS. Les fragments sont redistribués selon les données renouvelées ; aucun retrait de données pour contourner une limite de transfert.
- `browser-equivalence.json` :19parcours ciblés et11recherches ordinaires neuf pays exactement identiques entre local et URL réelle aux mêmes paramètres fixes. Troiscanaux, tarifs composés, offres brutes et exclusions de portée contrôlés séparément.
- `atlante-controls-remote.json` : Buc stationIRVE unique/sixEVSE, Tesla Milan/LeChesnay autonome, Fécamp sans prix inventé, adresse mémorisée,20/40/60fiches, carte/pagination, filtres multiples, véhicule, SOC/énergie absents non inventés et mobile390px PASS.
- Comparaison ancien/nouveau paquet dans Firefox160.0 :11recherches identiques. Quatre empreintes diffèrent des preuves du5novembre dans **les deux** paquets ; les anciennes lignes détaillées ne sont pas disponibles, donc aucune cause n’est attribuée sans preuve. L’équivalence attestée est celle des deux paquets au même navigateur/entrées.
- Ancien déploiement6aed03e7 :3245fragments et ressources critiques entièrement revérifiés ; reçuSHA gzip conservé. Son contrôle final était interrompu puis perdu dans /private/tmp : reprise justifiée, aucun ancien déploiement dupliqué.
- Sitepublic inchangé avant transfert, hashes index/manifest dans public-before.json. Netlify Free sans dépassement signalé ni recharge automatique.

## Recette distante terminée et limites

`atlante-remote-integrity.json` : HTTPS/noindex, toutes ressources critiques, manifeste servi et provenance, ledger16374817octets/crosswalk11669931octets et **3247fragments signés** PASS sur la nouvelle URL. Reçu intégral compressé, SHA lié à cette URL/bundle/index. `browserVerified=false` dans ce contrôle statique reste exact : les preuves Firefox sont séparées.

`atlante-dense-remote.json` :64019stations,160stations par page de données et20fiches initiales ; empreintes classement/montants/frais/carte/page/évaluations identiques aux mêmes entrées avecFirefox160. Mesure froide66.7s distante,66.8s locale précédente sous charge concurrente ; limite de performance, aucun PASS G7/G8 sur la latence. Aucun rayon réduit ni station retirée.

`public-after.json` : index et manifeste du sitepublic inchangés. `netlify-isolation-after.json` : aucun Git connecté, aucun published_deploy. Rollback6aed03e7 entièrement contrôlé ci-dessus, paquets antérieurs intacts.

Le pilote distinct43585513906 a prouvé trois transmissions d’archives supplémentaires,Actions refermé.13handoffs vérifiés,122ouverts. La sortieGB a ensuite été normalisée/importée dans un dossier Production isolé ; identités/puissances/offres identiques, dates archivées20octobre vs10octobre conservées. Aucun de ces trois replays ne constitue une acquisition fraîche ou ne modifie le paquet Netlify.

G2–G8 restent FAIL globalement :122handoffs encore non vérifiés après les trois replays, absence de cadence automatique démontrée et couverture formelle encore partielle. Le pilote d’archives groupé est indépendant de cette URL et n’a renouvelé aucune acquisition fournisseur. Electroverse utilise toujours les128shards historiques et un état national13/16incomplet ; REVE a repris cinq pages avec succèsHTTP mais reste checkpoint partiel, jamais promu. Ubitricity UK attend le fournisseur, NL reste legacy_method_unavailable. La latence dense reste une limite d’usage, aucun PASS de performance revendiqué.

Le bundle et les paquets antérieurs sont conservés. Aucun main, site public, UpdaterTesla/Mac ou Stable n’est modifié. Ce candidat est un environnement de test partiel, pas une clôture G2–G8.
