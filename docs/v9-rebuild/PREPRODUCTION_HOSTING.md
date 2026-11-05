# Hébergement isolé de TCC V9 — décision au 28 octobre 2026

**Cloudflare Pages est abandonné. Netlify est autorisé par l'utilisateur le 28 octobre pour un projet de préproduction indépendant, en transfert manuel uniquement.** Le brouillon `6ae257f7d0d52c2b2ba9636b` est accessible et sa recette distante du 5 novembre passe sur l'URL immuable ; [preuves et limites formelles](evidence/netlify-draft-20261105.md). Il ne s'agit pas d'une publication du site public TCC.

## Paquet de recette conservé

Le paquet autonome local est `.tcc-v9-cache/reproducible-31-bump-2026-10-28/site-rule-key-guard`, hors dépôt. Bundle immuable à 31 sources : `29e2a5e9331a9d2949e342d245128d45480647f4eed1fc37977f83bc67e059fb`. Les candidats `site-simple-guard` et `site` restent des retours arrière. Le contrôle local SHA/noindex, l'oracle Midhope 64/64, les oracles composés, dix parcours tarifaires Firefox et neuf pays/mobile sont consignés dans [la matrice G6](evidence/g6-mechanism-coverage-20261028.md). Le contrôle d'hébergement local porte sur 3 777 fichiers et 289 119 496 octets ; `deployed=false`.

Le site se construit hors dépôts avec `scripts/build_v9_rebuild_preview.py`. L'index et les fragments portent des empreintes SHA. `scripts/check_v9_preview_hosting.py --site <dossier>` vérifie les fichiers et l'isolation locale. Un serveur sur `127.0.0.1` permet les tests de ce Mac uniquement ; il ne donne pas d'URL accessible à l'utilisateur.

## Contrat de la future préproduction distante

Avant tout choix d'hébergement, conserver ces exigences vérifiables : origine HTTPS séparée du site public, transfert du **seul paquet autonome** sans source privée ni artefact de construction, absence de déclencheur de déploiement public, en-tête `X-Robots-Tag: noindex`, inventaire et SHA distants identiques au paquet, fragments signés, accès mobile/ordinateur et retour au paquet précédent. L'hébergeur retenu devra servir au moins 3 777 fichiers et environ 290 Mo sans altérer les octets ; ces chiffres sont des contraintes de transport, jamais des seuils de stations ou d'EVSE.

`scripts/check_v9_remote_preview.py` effectue les contrôles HTTP/SHA/noindex sur une URL isolée, quel que soit l'hébergeur compatible. Les recettes Firefox ciblées, neuf pays/mobile et le parcours de signalement doivent ensuite être rejoués sur **l'URL réellement publiée**. La validation locale ne remplace ni cette vérification distante ni les 120 handoffs GitHub Actions encore non vérifiés.

## Préflight Netlify, sans transfert

Le paquet passe `check_v9_preview_hosting.py` : 3 777 fichiers, 289 119 496 octets, plus grand fichier `runtime/data/v9/france-crosswalk.json` à 11 669 931 octets. Scan public du dossier autonome : **PASS**. Son fichier `_headers` demande `X-Robots-Tag: noindex, nofollow`, que Netlify sait interpréter pour les fichiers statiques. Selon la [documentation Netlify sur les tarifs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), le forfait Free est à 0 $/mois avec 300 crédits et un plafond strict sans recharge automatique. La [documentation de déploiement manuel](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/) prévoit un brouillon à URL unique sans connexion Git et sans `--prod`. Netlify [signale toutefois](https://docs.netlify.com/build/configure-builds/troubleshooting-tips/) que les fichiers de plus de 10 Mo peuvent échouer à l'envoi : le fichier de 11,7 Mo du paquet rend la compatibilité **non vérifiée** tant qu'un transfert réel n'a pas réussi. Aucun montant payant ni réduction silencieuse du paquet n'est autorisé.

Le CLI a ensuite été authentifié sur l'équipe Free `TCC`, dédiée à cette préproduction. Le projet `tcc-v9-preproduction-20261028` a été créé sans connexion Git ; le déploiement brouillon `6ae257f7d0d52c2b2ba9636b` est `ready`. L'utilisateur a ouvert la visibilité **des préversions de ce seul projet** le 5 novembre. Son URL HTTPS répond `200` ; SHA des ressources, gros fichier et 2 521 fragments signés, puis dix parcours tarifaires et neuf pays/mobile Firefox sont **PASS**. La procédure de restauration reste un transfert manuel du paquet précédent conservé. La recette globale G8 conserve ses blocages de chaîne GitHub et de couverture formelle documentés séparément.

Le pilote Actions Data Lab a été exécuté puis arrêté séparément. Son résultat ne vaut pas déploiement Netlify et les 119 autres handoffs restent non vérifiés.
