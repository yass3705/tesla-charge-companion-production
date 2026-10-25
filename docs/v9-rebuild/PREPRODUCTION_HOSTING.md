# Hébergement isolé de TCC V9

Statut : préparation technique seulement. Aucun projet Cloudflare Pages n'a été créé et aucune URL distante n'a été validée.

Le site V9 est produit hors des dépôts par `scripts/build_v9_rebuild_preview.py`. Son index et chaque fragment sont vérifiés par SHA. `scripts/check_v9_preview_hosting.py --site <sortie>/site` contrôle la racine V9, la configuration épinglée, l'inventaire Tesla par SHA, l'absence des entrées de construction et des anciens catalogues d'offres runtime, ainsi que les limites de fichiers avant tout transfert. Dans cet aperçu, le sélecteur d'abonnements n'importe que les offres prouvées du candidat.

Hébergement proposé : **un projet Cloudflare Pages Direct Upload distinct du Worker/site public TCC**. La [documentation Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/) fixe pour le forfait gratuit 20 000 fichiers et 25 MiB par fichier ; le [transfert direct](https://developers.cloudflare.com/pages/get-started/direct-upload/) accepte un dossier de fichiers construits. `_headers` applique `X-Robots-Tag: noindex` à l'aperçu, selon la [syntaxe Pages officielle](https://developers.cloudflare.com/pages/configuration/headers/). Ces limites sont des contraintes de transport, sans rapport avec les volumes de stations ou d'EVSE.

Avant déploiement, il faut disposer d'un identifiant de compte Cloudflare et d'un jeton avec permission **Cloudflare Pages Edit** pour un projet distinct. Aucun secret ne doit être ajouté au dépôt public. L'opération administrative doit être autorisée par l'utilisateur au moment où la recette locale sera complète. Le projet, le transfert et l'URL seront alors vérifiés sans modifier la configuration du site public.

Après autorisation et configuration locale des identifiants : créer le projet Pages isolé avec Wrangler, transférer uniquement `<sortie>/site` sur une branche de préproduction, relever son URL, vérifier le `noindex`, les SHA distants, le parcours ordinateur/mobile et le formulaire de signalement. Ne pas invoquer le workflow `cloudflare-deploy.yml` existant : il cible le site public.

Le transfert GitHub Actions Data Lab est un contrôle distinct : il reste non vérifié tant qu'Actions est désactivé, et sa réactivation requiert neutralisation des YAML historiques sur la branche active puis accord explicite.
