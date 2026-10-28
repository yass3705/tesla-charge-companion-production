# Hébergement isolé de TCC V9 — décision au 28 octobre 2026

**Cloudflare Pages est abandonné par décision utilisateur. Aucun autre hébergeur n'est choisi ni autorisé.** Les anciennes instructions Pages de ce dossier sont obsolètes ; ne pas les exécuter. Aucun projet distant, URL de préproduction ou déploiement public n'est revendiqué.

## Paquet de recette conservé

Le paquet autonome local est `.tcc-v9-cache/reproducible-31-bump-2026-10-28/site-rule-key-guard`, hors dépôt. Bundle immuable à 31 sources : `29e2a5e9331a9d2949e342d245128d45480647f4eed1fc37977f83bc67e059fb`. Les candidats `site-simple-guard` et `site` restent des retours arrière. Le contrôle local SHA/noindex, l'oracle Midhope 64/64, les oracles composés, dix parcours tarifaires Firefox et neuf pays/mobile sont consignés dans [la matrice G6](evidence/g6-mechanism-coverage-20261028.md). Le contrôle d'hébergement local porte sur 3 777 fichiers et 289 119 496 octets ; `deployed=false`.

Le site se construit hors dépôts avec `scripts/build_v9_rebuild_preview.py`. L'index et les fragments portent des empreintes SHA. `scripts/check_v9_preview_hosting.py --site <dossier>` vérifie les fichiers et l'isolation locale. Un serveur sur `127.0.0.1` permet les tests de ce Mac uniquement ; il ne donne pas d'URL accessible à l'utilisateur.

## Contrat de la future préproduction distante

Avant tout choix d'hébergement, conserver ces exigences vérifiables : origine HTTPS séparée du site public, transfert du **seul paquet autonome** sans source privée ni artefact de construction, absence de déclencheur de déploiement public, en-tête `X-Robots-Tag: noindex`, inventaire et SHA distants identiques au paquet, fragments signés, accès mobile/ordinateur et retour au paquet précédent. L'hébergeur retenu devra servir au moins 3 777 fichiers et environ 290 Mo sans altérer les octets ; ces chiffres sont des contraintes de transport, jamais des seuils de stations ou d'EVSE.

`scripts/check_v9_remote_preview.py` effectue les contrôles HTTP/SHA/noindex sur une URL isolée, quel que soit l'hébergeur compatible. Les recettes Firefox ciblées, neuf pays/mobile et le parcours de signalement doivent ensuite être rejoués sur **l'URL réellement publiée**. La validation locale ne remplace ni cette vérification distante ni les 120 handoffs GitHub Actions encore non vérifiés.

La prochaine décision externe est le choix et l'autorisation explicite d'un hébergement isolé, avec les accès limités nécessaires à ce seul espace. Aucun accès au site public n'est requis. Le pilote Actions Data Lab est une autorisation distincte, décrit dans le dossier Data Lab `docs/v9-rebuild/GITHUB_ACTIONS_PILOT_PLAN_20261026.md`. Ne pas activer Actions, modifier `main` ou publier le site public pour préparer l'URL.
