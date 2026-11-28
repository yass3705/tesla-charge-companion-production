# Backlog post-finalisation TCC V9

## Amsterdam à 100 km en zone très dense

**État**. Travaux suspendus jusqu’à la finalisation de V9, selon la décision utilisateur du 28 novembre 2026.

**Référence mesurée**. Sur Firefox en local, le test de charge couvre 64 019 stations et les cinq modes de tri. La comparaison appariée donne 55,585 s avant optimisation et 48,202 s après. Le premier rendu avec carte prend 42,248 s dans une mesure sans instrumentation par appel. Les signatures des stations, des montants, du classement et des pages de carte sont identiques. [Preuves conservées](evidence/mac-prepreview-20261128.json)

**Périmètre de reprise**. Examiner le chargement et le coût du classement à froid après la finalisation. Conserver le rayon de 100 km, l’accès à toutes les stations correspondantes, les montants exacts et les cinq classements. La latence de ce test de charge est hors critères bloquants G7/G8. Les exigences de performance des recherches courantes restent dans la recette V9.
