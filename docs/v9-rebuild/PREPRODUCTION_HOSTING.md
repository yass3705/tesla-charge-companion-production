# Hébergement isolé de TCC V9

## Candidat local le plus récent — 28 octobre

Le paquet autonome `.tcc-v9-cache/reproducible-30-atlante-fr-2026-10-28/site-currency-guard-complete` contient 30 sources sur neuf pays, bundle immuable `dfc5952b5d340131cb0b10c75c81147ca290a0befbf11a930d794ae78cb82d96`. Vérification SHA/hébergement **PASS** : 3 695 fichiers, 287 821 513 octets, `deployed=false`. Les parcours Firefox de neuf familles tarifaires, neuf pays et mobile 390 px passent, dont la nouvelle source Atlante France sur ses identifiants EVSE/prise propres. Le garde commun de devise empêche qu'une offre sans devise reçoive un prix EUR fictif. Les candidats précédents restent disponibles pour retour arrière.

Préflight distant restant : aucun exécutable Wrangler, identifiant de compte Cloudflare ni nom de variable de jeton Pages n'est présent localement au dernier contrôle en lecture seule. Aucun projet Pages distinct ni URL n'est créé. Le transfert exigera une autorisation explicite et des identifiants Pages Edit pour un projet isolé ; ne jamais utiliser le workflow du site public. La recette locale et les portes G2–G8 restent incomplètes malgré ce paquet fonctionnel.

Statut : préparation technique seulement. Aucun projet Cloudflare Pages n'a été créé et aucune URL distante n'a été validée.

Le site V9 est produit hors des dépôts par `scripts/build_v9_rebuild_preview.py`. Son index et chaque fragment sont vérifiés par SHA. `scripts/check_v9_preview_hosting.py --site <sortie>/site` contrôle la racine V9, la configuration épinglée, l'inventaire Tesla par SHA, l'absence des entrées de construction et des anciens catalogues d'offres runtime, ainsi que les limites de fichiers avant tout transfert. Dans cet aperçu, le sélecteur d'abonnements n'importe que les offres prouvées du candidat.

Une configuration absente ou invalide affiche « Préproduction indisponible » dans le shell isolé ; elle ne redirige pas en boucle vers la racine et ne déclenche pas de repli sur les prix historiques.

Hébergement proposé : **un projet Cloudflare Pages Direct Upload distinct du Worker/site public TCC**. La [documentation Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/) fixe pour le forfait gratuit 20 000 fichiers et 25 MiB par fichier ; le [transfert direct](https://developers.cloudflare.com/pages/get-started/direct-upload/) accepte un dossier de fichiers construits. `_headers` applique `X-Robots-Tag: noindex` à l'aperçu, selon la [syntaxe Pages officielle](https://developers.cloudflare.com/pages/configuration/headers/). Ces limites sont des contraintes de transport, sans rapport avec les volumes de stations ou d'EVSE.

Avant déploiement, il faut disposer d'un identifiant de compte Cloudflare et d'un jeton avec permission **Cloudflare Pages Edit** pour un projet distinct. Aucun secret ne doit être ajouté au dépôt public. L'opération administrative doit être autorisée par l'utilisateur au moment où la recette locale sera complète. Le projet, le transfert et l'URL seront alors vérifiés sans modifier la configuration du site public.

Après autorisation et configuration locale des identifiants : créer le projet Pages isolé avec Wrangler, transférer uniquement `<sortie>/site` sur une branche de préproduction, relever son URL, vérifier le `noindex`, les SHA distants, le parcours ordinateur/mobile et le formulaire de signalement. Ne pas invoquer le workflow `cloudflare-deploy.yml` existant : il cible le site public.

Le transfert GitHub Actions Data Lab est un contrôle distinct : il reste non vérifié tant qu'Actions est désactivé, et sa réactivation requiert neutralisation des YAML historiques sur la branche active puis accord explicite.


## Aperçu local contrôlé du 26 octobre

Le paquet actuel est `.tcc-v9-cache/reproducible-28-germany-2026-10-26/site`, hors checkout : 28 sources, bundle `1d22bb3d91455b6c1cd7484345325b0908f82c447c56f0a41f33cc970ff8d1c1`. Vérification SHA/hébergement PASS, 3 499 fichiers, 286 262 718 octets, `deployed=false`. Recettes tarifaires ciblées et neuf pays/mobile rejouées sur ce paquet : PASS fonctionnels. Limite de performance ouverte : Amsterdam 100 km : 72 301 ms au premier chargement sur le paquet d’éligibilité antérieur au complément G6 après seuil ; le budget local de 10 s est atteint à 20 km après réduction par paliers, cache chaud ; ne pas déclarer la préproduction complète/prête sur cette preuve.

Un serveur lié uniquement à `127.0.0.1:8769` a été démarré et son HTTP 200/noindex vérifié pour l'inspection sur ce Mac : `http://127.0.0.1:8769/`. Il ne constitue ni une URL distante, ni une publication du site public. Commande de reprise après arrêt du serveur :

```sh
python3 -m http.server 8769 --bind 127.0.0.1 --directory /Users/yassine/Projects/TCC/.tcc-v9-cache/reproducible-28-germany-2026-10-26/site
```

La voie Sites a été examinée uniquement par lecture de sa compétence : son parcours prévoit un dépôt source propre au nouveau Site et une synchronisation Git. Aucun Site ni dépôt supplémentaire n'a été créé, conformément au cahier des charges conservant les dépôts TCC existants et interdisant un nouveau dépôt privé. La préparation Cloudflare Pages distincte reste l'option décrite ci-dessus ; aucun accès administratif adapté n'est configuré dans cette session.

Le candidat 28 sources ajoute le parcours dans une même session FR→DE→NL→FR, PASS sans mélange de pays. Berlin 100 km : 7 988 ms. NL 20 km à froid : 13 030 ms ; la limite de performance reste ouverte. Captures et preuves : [recette 28 sources](evidence/germany-national-28source-20261026.md).
