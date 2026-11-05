# Restauration tarifaire et renouvellement — candidat 33 sources

Bundle immuable : `8ad8e0811e8ae0ecdb879affc1a38e0fa299f1b4d93c33c2ae920fa745941fc2`.
Paquet hors checkout : `.tcc-v9-cache/emsp-restoration-20261105/site-renewal-complete`.
Code Production : `6862de2c92dfda1955ae01d986d3bba427bf4f78`, CI lecture seule42114686946 success. DataLab : `d5773a06564fbe261d208fdb9ead8009612467e6`.

## Preuves locales

- `hosting-final-local.json` : 4502fichiers,356859574octets ; ledger signé compressé16371519octets, décodage et SHA brut contrôlés. Aucun fichier supprimé pour le transfert.
- `targeted-nl-final-local.json` : artefact national renouvelé réellement collecté sur GitHub puis importé ; frais composés, identité exacte et affichage vérifiés.
- `ordinary-final-local.json` : onze recherches sur neuf pays ; tarifs calculables présents sur les recherches ordinaires, tri avant les inconnus, Fécamp indisponible conservé. Chiffres purement diagnostiques, aucun seuil historique.
- `controls-final-local.json` : Buc référence nationale unique/sixEVSE, Tesla autonome Milan/Chesnay, 20/40/60fiches, carte/pagination, filtres, batterie, abonnements, adresse mémorisée et mobile390px PASS.
- Les parcours UK/Direct/eMSP identiques aux précédents paquets gardent leurs oracles complets ; la recette distante rejouera les19parcours sur ce paquet précis.

## Dates et limites

Electra plateforme, DOT-NL, Belib et Driveco proviennent d'acquisitions réelles du5novembre. La reconstruction suisse sur GitHub conserve la date des archives ; ce n'est pas une collecte fournisseur renouvelée. Electroverse reste une archive tarifaire de128shards et des états partiels13/16, jamais présentée comme un statut national frais. Ubitricity UK, Ze-Watt/Zephyre et autres restaurations historiques conservent leurs dates et SHA d'origine. Ubitricity NL reste indisponible à l'acquisition et last-good archivé.

La restauration des offres n'autorise aucune attribution approximative : identités officielles nationales exactes pour les réseaux nonTesla, Tesla entièrement autonome. Les offres inconnues/ambiguës restent brutes hors classement. Les dates de génération de paquets ne remplacent pas les dates de collecte.

G2–G8 restent FAIL globalement :126handoffs non vérifiés après correction d'un compteur qui omettait15sources, cadence automatique non démontrée, mécanismes/archives incomplets conservés dans les matrices, latence dense non résolue. Actions DataLab est désactivé. Aucun main, sitepublic, Updater ou Stable modifié. Ce candidat ne constitue pas une clôture globale.

## Recette distante

Transfert manuel sans --prod lancé après tous les contrôles locaux et scan public PASS. Processus15257 ; sorties `/private/tmp/tcc-emsp-netlify-deploy.{json,log}`. Ne pas relancer sans vérifier son état. Recette distante encore NON EXÉCUTÉE à cet instant ; aucune conformité distante déduite des contrôles locaux.

Déploiement `6aecf99e6ec824559152b1aa` **ready**, contexte deploy-preview, published_at=null : https://6aecf99e6ec824559152b1aa--tcc-v9-preproduction-20261028.netlify.app . Transfert terminé, aucune duplication. Recettes distantes en cours : intégrité session59479 ;19parcours puis11recherches et G9mobile session49818. Le succès d'hébergement seul ne vaut pas PASS G8.

### Recette distante partielle exécutée

19parcours PASS (14calculables,2bruts correctement incalculables,3exclusions de portée justifiées),11recherches/neufpays PASS, contrôles utilisateur Buc/Milan/Chesnay/pagination/carte/mobile PASS. Rollback immuable précédent et SHA du sitepublic inchangés. Netlify repo=null/published_deploy=null. Preuves `targeted-remote.json`, `ordinary-remote.json`, `controls-remote.json`, `rollback-public-remote.json`, `netlify-isolation-after.json`.

Le premier test de recherches ordinaires utilisait l'heure courante : Madrid changeait de meilleure offre entre local et distant, donc aucune égalité de montants ne pouvait être revendiquée avec ces entrées différentes. Test corrigé à date/heure explicites et empreinte du classement global ; recette de parité à mêmes entrées en cours, aucune modification de tarif.

Contrôle exhaustif SHA interrompu par timeout de lecture, puis connexions TCP indisponibles sur les deux adresses DNS Netlify, nouveau et ancien brouillon, alors que GitHub/API Netlify répondaient. Aucun écart SHA constaté avant l'interruption, mais aucun PASS exhaustif. Accès rétabli ensuite HTTP200 ; relance à2lectures concurrentes avec reçu par fragment, lié exclusivement à URL immutable+bundle+SHAindex.3tests du vérificateur PASS : reprise conservant les réussites, refus de mauvaise origine/index/noindex/corruption, retries de transport bornés sans ignorer les erreurs d'intégrité. Ne pas attribuer sans preuve cette interruption à un dépassement de forfait : usages_exceeded=[] et aucune recharge automatique.
