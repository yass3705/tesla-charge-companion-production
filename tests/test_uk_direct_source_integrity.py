import copy
import unittest

from scripts.compile_uk_direct_batch import ionity


class IonityIntegrity(unittest.TestCase):
    def setUp(self):
        self.station = dict(uuid="site", name="station", country="GB", cpoIdentifier="IONITY_CPO",
                            latitude=52, longitude=-1, connectorCount=1,
                            connectors=[dict(uuid="source-id", pricePerKwhGbp=0, powerKw=50)])
        self.payload = dict(country="GB", scope=dict(currency="GBP", priceGranularity="connector",
            tariffFamily="IONITY DIRECT", subscriberTariffsIncluded=False, roamingTariffsIncluded=False),
            counts=dict(ukLocationCount=1, ukConnectorCount=1, ukUnpricedConnectorCount=0),
            locations=[self.station])

    def test_changed_volume_keeps_exact_source_identity(self):
        output = ionity(self.payload, "fixture", b"fixture")
        evse = output["locations"][0]["evses"][0]
        self.assertNotIn("evse_id", evse)
        self.assertEqual(evse["uid"], "source-id")
        self.assertEqual(evse["connectors"][0]["tariff_ids"], [output["tariffs"][0]["id"]])
        self.assertEqual(output["tariffs"][0]["elements"][0]["price_components"][0]["price"], 0)

    def test_incomplete_or_wrong_scope_rejected(self):
        for key, value in (("ukConnectorCount", 2), ("ukUnpricedConnectorCount", 1)):
            broken = copy.deepcopy(self.payload)
            broken["counts"][key] = value
            with self.assertRaisesRegex(ValueError, "input counts"):
                ionity(broken, "fixture", b"fixture")
        self.payload["scope"]["roamingTariffsIncluded"] = True
        with self.assertRaisesRegex(ValueError, "scope"):
            ionity(self.payload, "fixture", b"fixture")
