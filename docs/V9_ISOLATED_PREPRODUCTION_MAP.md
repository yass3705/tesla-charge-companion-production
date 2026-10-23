# Reconstruction V9 — raccordement de la carte au candidat de données isolé

**Statut : préparation G7, non publiée, pas de porte PASS.** Branche `rebuild/v9-20261020` seulement. Le site public n'est pas modifié ; GitHub Actions Data Lab reste désactivé.

## Intégration

- `scripts/build_v9_preproduction_data.py` fabrique un candidat `index.json` + `sources/*.json`, vérifié par `scripts/import_v9_bundle.py`, **hors du dépôt**.
- `scripts/package_v9_preproduction_map.py` reçoit un site TCC déjà construit (`--site`), le candidat préparé (`--prepared`) et un **nouveau dossier extérieur au dépôt** (`--out`). Il vérifie de nouveau les SHA, copie le site dans cet espace et ajoute uniquement à sa configuration locale `preproductionCandidateBase=../prepared-v9`, `preproductionIsolated=true` et `fallback=fail-closed`.
- L'interface `v9-production-shell` charge alors les deux modules supplémentaires `canonical-v9.js` et `preproduction-candidate-loader.js`, ainsi que la carte OpenStreetMap. Le chargeur **remplace entièrement le registre historique** par les seules sources du candidat ; il ne joint pas ses offres aux tarifs historiquement publiés.
- Le chargeur vérifie chaque SHA au navigateur, la provenance et les IDs, puis envoie les fragments au moteur de stations TCC. `unparsedOffers` est conservé séparément ; la liste `offers` utilisée par les moteurs tarifaires demeure vide.
- La fiche TCC conserve les EVSE, prises, puissances et leur provenance. Une offre brute identifiée affiche « Tarif incalculable » au PDC concerné ; si aucune offre n'existe, « Prix non disponible ». Aucun montant brut non évalué ne sert au tri par coût, au prix/km ou aux marqueurs tarifés de la carte.

## Tests à lancer par Codex dans son environnement local

```bash
node tests/canonical-v9-adapter.test.mjs
node tests/preproduction-candidate-map.test.mjs
node tests/preproduction-candidate-map-pricing.test.mjs
node tests/v9-shell-grouping.test.mjs
python3 -m unittest tests.test_package_v9_preproduction_map tests.test_build_v9_preproduction_data tests.test_import_v9_bundle -q
```

Les essais de compilation/données exécutés depuis ChatGPT sont limités à des tests JS en mémoire. **Les tests ci-dessus, l'assemblage d'un site complet et les essais navigateur réels restent à exécuter par Codex.**

## Essai local, sans publication

À partir d'un site TCC candidat **déjà construit et vérifié** et de l'index préparé **hors dépôt** :

```bash
python3 scripts/package_v9_preproduction_map.py \
  --site /chemin/absolu/vers/site-tcc-construit \
  --prepared /chemin/absolu/vers/candidat-prepared \
  --out /chemin/absolu/vers/preview-tcc-neuf

python3 -m http.server 8765 --directory /chemin/absolu/vers/preview-tcc-neuf
```

Ouvrir alors `http://localhost:8765/v9-production-shell/` et exécuter la simulation sur une station archivée FR/GB. Le serveur n'est accessible que tant qu'il tourne localement. **Ne pas considérer cela comme une URL de préproduction distante validée ni comme un feu vert pour publication.**

## À valider avant G7/G8

- Replay sur un véritable snapshot TCC complet avec candidat préparé signé, y compris multi-source et `partial_failure`.
- Tests en navigateur : carte + liste, provenance, station regroupée, prises, AC/DC, filtres, rendu mobile, aucun tarif brut numérique dans le classement.
- Couverture des normaliseurs G3 et des mécanismes tarifaires G6 quand leurs entrées seront réellement évaluées ; les offres brutes ne deviennent calculables qu'après preuve explicite.
- Tests de GitHub Actions G2/G4 dans un contexte sécurisé et autorisé ; G2–G9 restent FAIL en attendant les preuves nécessaires.
