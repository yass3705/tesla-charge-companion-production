# Station source and navigation in the common card

The pinned Tesla source supplies Matosinhos with a Google Maps destination, an official Tesla station page and a 2026-07-22 update date. The V9 Tesla adapter kept the date but discarded both URLs, and the common card did not render a navigation or station link.

The candidate carries source URLs through Tesla normalization and identity merge. The shared card displays the source update date and a coordinates-based Google Maps destination for every station with valid coordinates. It displays the official Tesla page only when its HTTPS host is `tesla.com`. The regression follows Matosinhos from adapter through entity merge into the shared HTML and rejects unsafe/non-Tesla URL hosts. Tariffs and the published snapshot are unchanged.
