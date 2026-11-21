import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_snapshot import validate_gridserve_snapshot


class GridserveScopeTest(unittest.TestCase):
    def test_one_station_requires_the_same_tariff_on_the_same_connector(self):
        connector = {"id": "1", "tariff_ids": ["T"]}
        location = {"id": "L", "publish": True, "country_code": "GB", "party_id": "GRD",
                    "evses": [{"uid": "E", "connectors": [connector]}]}
        source = {"id": "gridserve-pcpr-direct", "locations": [location], "tariffs": [{"id": "T", "party_id": "GRD"}]}
        payload = {"sources": [source], "collectedAt": "2026-11-21"}
        audit = {"validatedForV9": True, "status": "validated_public_connector_exact", "publicLocations": 1,
                 "distinctExactTariffIds": 1, "exactPricedConnectors": 1, "publicConnectors": 1,
                 "unpricedPublicConnectors": 0, "collectedAt": payload["collectedAt"]}
        link = {"locationId": "L", "evseUid": "E", "connectorId": "1", "tariffIds": ["T"], "priceVerified": True}
        evidence = {"provider": "GRIDSERVE", "collectedAt": payload["collectedAt"], "links": [link]}
        validate_gridserve_snapshot(payload, audit, evidence)
        link["connectorId"] = "2"
        with self.assertRaisesRegex(AssertionError, "exact connector evidence"):
            validate_gridserve_snapshot(payload, audit, evidence)
