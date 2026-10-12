# Belib exact EVSE development candidate (13 October 2026)

The new immutable config `2026-10-13-nine-country-be-belib-exact-candidate` copies the validated nine-country Belgium candidate's exact Stable and Data Lab source SHAs. It selects Production builder correction #59, which scopes the existing Belib visitor and subscription tariff records to official EVSE IDs and restores the session engine's exact connector check. No source tariff amount, national dataset or previous snapshot config changes.

The old `2026-10-13-nine-country-be-candidate` remains available for rollback. Promotion affects only the development candidate; Pages and Cloudflare remain unpublished. Full pinned and global CI, browser journey, manifest hashes and post-merge checks must pass before treating this candidate as validated.
