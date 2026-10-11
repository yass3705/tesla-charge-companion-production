# Historical r8 candidate workflow

The `2026-09-30-r8` snapshot is a frozen baseline. Its config pins Data Lab to `d0996b493bcfee5312b5ca1e38070df87b0d9642` and Stable to `0a6d2c3415504397310d3dc92fae40be843b2435`. The immutable `v9-snapshot-2026-09-30-r8` release was published on 30 September 2026. Later RC1 workflows refer to a specific successful r8 run (`36736001077`) and artifact; they do not consume the latest run of `build-2026-09-30-r8.yml`.

On 11 October, a push for Production PR #36 started the r8 workflow because `runtime-overrides/**` was in its push paths. The build failed at the existing Electroverse protection in `scripts/build_snapshot.py`: the pinned Data Lab commit has no `data/platforms/electroverse/france-evse/manifest.json`. The builder correctly refuses to replace EVSE-level tariffs with the legacy complex-tariff exclusions. This failure does not establish a regression in the current V9 tariff changes.

The r8 workflow is reserved for `workflow_dispatch` so unrelated runtime changes no longer request a rebuild of the frozen snapshot. This changes only its trigger. Its pinned inputs, source checks, adapter tests, build, snapshot validation, stable parity, browser graph check, runtime smoke test and artifact upload remain in the workflow. **Manual r8 execution still requires a separate compatibility repair** between the historical Data Lab pin and the current builder; changing the trigger does not repair the build. Do not change the historical pins or weaken the Electroverse protection to make that run green.

Current V9 PR validation remains in `deploy-v9-global-mac-preview.yml`. It builds the current preview and runs the targeted tariff, time-zone, OCPI, congestion, runtime and browser journey tests. Its Pages configuration, upload and deployment steps are skipped for `pull_request`. This change does not edit that workflow.

Related workflow triggers and dependencies checked on 11 October:

| Workflow | Relevant trigger and dependency | Effect of this branch |
| --- | --- | --- |
| `deploy-v9-global-mac-preview.yml` | PRs changing current runtime/bridge/tests; push to `main`, schedule or manual for publication. The PR path on Production #36 includes the time-zone, label and browser tests. | No changed path in its PR or push filters; its file and tests are untouched. |
| `validate-browser-asset-graph.yml` | Push of its validator script or workflow, or manual run; it independently rebuilds the pinned r8 snapshot. | Unchanged. Its old-pin compatibility risk remains if separately triggered. |
| `publish-2026-09-30-r8.yml` | Push of its own workflow file or manual run; it independently rebuilds r8 and creates a release. | Unchanged and not triggered by the proposed files. |
| RC1 smoke and release workflows | Download or verify the fixed successful r8 run `36736001077` and its artifact by ID/digest. | No dependency on a new r8 workflow run. |
| `cloudflare-deploy.yml` and `deploy-v9-iphone-preview.yml` | Manual Cloudflare deployment; iPhone Pages deployment on its distinct branch or manual run. | Neither trigger matches this branch or these files. |

No `workflow_run` or `workflow_call` consumer of the r8 builder was found in Production workflows. GitHub reported no branch protection or repository ruleset requiring its `build` check at the time of this review. This is a trigger change for historical CI, not a change to the immutable r8 release or to the current V9 validation gate.

Validation before any publication of this CI change: inspect the workflow diff to confirm only the `push` event was removed; run `git diff --check`; confirm the r8 job body is identical to `main`; confirm the current V9 PR workflow still has its PR trigger and test steps; review all workflow path triggers for the proposed files. Do not run r8 manually as a validation of this trigger change. A later manual r8 run needs its own compatibility fix and approval.
