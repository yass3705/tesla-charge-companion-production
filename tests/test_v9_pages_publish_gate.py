"""Fail closed if a Production Pages workflow regains an automatic publish path."""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github/workflows"
PUBLISH_GUARD = "github.event_name == 'workflow_dispatch' && inputs.publish == true"


def block(source, header, indent=0):
    lines = source.splitlines()
    prefix = " " * indent + header
    start = next(i for i, line in enumerate(lines) if line == prefix)
    end = next((i for i in range(start + 1, len(lines))
                if lines[i].strip() and len(lines[i]) - len(lines[i].lstrip()) <= indent), len(lines))
    return "\n".join(lines[start + 1:end])


def events(source):
    return set(re.findall(r"^  ([a-z_]+):", block(source, "on:"), re.MULTILINE))


def publish_input(source):
    dispatch = block(block(source, "on:"), "workflow_dispatch:", 2)
    publish = block(dispatch, "publish:", 6)
    return "type: boolean" in publish and "default: false" in publish and "required: true" in publish


class PagesPublishGateTest(unittest.TestCase):
    def test_global_validation_events_and_manual_publish_gate(self):
        source = (WORKFLOWS / "deploy-v9-global-mac-preview.yml").read_text()
        self.assertEqual(events(source), {"pull_request", "push", "schedule", "workflow_dispatch"})
        self.assertTrue(publish_input(source))
        build = block(block(source, "jobs:"), "build-deploy:", 2)
        deploy = block(block(source, "jobs:"), "deploy:", 2)
        for name in ("Configure Pages", "Upload V9 global preview"):
            step = block(build, "- name: " + name, 6)
            self.assertIn("        if: " + PUBLISH_GUARD, step)
        self.assertIn("    if: " + PUBLISH_GUARD, deploy)
        for command in ("v9-shell-grouping.test.mjs", "v9-tariff-lanes.test.mjs",
                        "v9-ocpi-component-coverage.test.mjs", "v9-congestion-soc80.test.mjs",
                        "electroverse-rich-pricing.test.mjs", "runtime-browser-journey-global.mjs"):
            self.assertIn(command, build)
        if (ROOT / "tests/v9-pricing-time-zone.test.mjs").exists():
            self.assertIn("node production/tests/v9-pricing-time-zone.test.mjs", build)
        concurrency = block(source, "concurrency:")
        self.assertIn("v9-global-pages-publish", concurrency)
        self.assertIn("v9-global-validation-", concurrency)
        self.assertNotIn("group: v9-iphone-preview", concurrency)
        self.assertIn("cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' || inputs.publish != true }}", concurrency)

    def test_legacy_iphone_has_no_automatic_pages_event(self):
        source = (WORKFLOWS / "deploy-v9-iphone-preview.yml").read_text()
        self.assertEqual(events(source), {"workflow_dispatch"})
        self.assertTrue(publish_input(source))
        deploy = block(block(source, "jobs:"), "deploy:", 2)
        self.assertIn("    if: " + PUBLISH_GUARD, deploy)
        concurrency = block(source, "concurrency:")
        self.assertIn("group: v9-global-pages-publish", concurrency)
        self.assertIn("cancel-in-progress: false", concurrency)

    def test_exact_pinned_snapshot_requires_manual_publish(self):
        source = (WORKFLOWS / "publish-v9-pinned-pages.yml").read_text()
        self.assertEqual(events(source), {"workflow_dispatch", "pull_request"})
        self.assertTrue(publish_input(source))
        candidate = block(block(source, "jobs:"), "candidate:", 2)
        deploy = block(block(source, "jobs:"), "deploy:", 2)
        for name in ("Configure GitHub Pages", "Upload exact pinned snapshot"):
            step = block(candidate, "- name: " + name, 6)
            self.assertIn("        if: " + PUBLISH_GUARD, step)
        self.assertIn("    if: " + PUBLISH_GUARD, deploy)
        self.assertIn("python scripts/validate_built_snapshot.py", candidate)
        self.assertIn("python production/scripts/verify_candidate_manifest.py", candidate)
        self.assertIn("artifact_name: v9-pinned-pages-${{ github.run_attempt }}", deploy)

    def test_all_pages_actions_are_covered(self):
        pages = {path.name for path in WORKFLOWS.glob("*.yml")
                 if "actions/deploy-pages@" in path.read_text()}
        self.assertEqual(pages, {"deploy-v9-global-mac-preview.yml", "deploy-v9-iphone-preview.yml", "publish-v9-pinned-pages.yml"})


if __name__ == "__main__":
    unittest.main()
