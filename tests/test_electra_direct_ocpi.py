import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from build_electra_direct_offers import rule_from_element

class ElectraOCPI(unittest.TestCase):
    def test_all_components_and_rounding(self):
        rule, errors=rule_from_element({
            "restrictions":{"dayOfWeek":["MONDAY"],"minPower":60,"maxDuration":3600},
            "priceComponents":[
                {"type":"ENERGY","price":.49,"stepSize":250},
                {"type":"TIME","price":3.60,"stepSize":60},
                {"type":"FLAT","price":.99},
                {"type":"PARKING_TIME","price":1.20,"stepSize":300}
            ]})
        self.assertEqual(errors,[])
        self.assertEqual(rule["pricePerKwh"],.49)
        self.assertAlmostEqual(rule["chargePerMinute"],.06)
        self.assertAlmostEqual(rule["idlePerMinute"],.02)
        self.assertEqual(rule["connectionFee"],.99)
        self.assertEqual(rule["days"],[1])
        self.assertEqual(rule["minPowerKw"],60)
        self.assertEqual(rule["maxDurationMinutes"],60)
        self.assertEqual(rule["energyStepWh"],250)
        self.assertEqual(rule["parkingTimeStepSeconds"],300)

    def test_congestion_default_and_source_precedence(self):
        rule, errors=rule_from_element({
            "priceComponents":[{"type":"ENERGY","price":.49},{"type":"CONGESTION_TIME","price":9,"stepSize":300}]
        })
        self.assertEqual(errors,[])
        self.assertEqual(rule["congestionStartSoc"],80)
        self.assertEqual(rule["congestionThresholdSource"],"default_soc80")
        self.assertAlmostEqual(rule["congestionTimePerMinute"],.15)
        self.assertEqual(rule["congestionTimeStepSeconds"],300)
        override, errors=rule_from_element({
            "priceComponents":[{"type":"CONGESTION_TIME","price":6,"description":"After 90% battery"}]
        })
        self.assertEqual(errors,[])
        self.assertEqual(override["congestionStartSoc"],90)
        self.assertEqual(override["congestionThresholdSource"],"official")
        unknown, errors=rule_from_element({
            "priceComponents":[{"type":"CONGESTION_TIME","price":9,"description":"After some grace time"}]
        })
        self.assertIn("congestion_policy_source_explanation_requires_review",errors)
        self.assertEqual(unknown["congestionStartSoc"],80)

    def test_no_tariff_exclusion_and_audit(self):
        payload={
          "generatedAt":"2026-10-08T00:00:00Z",
          "panMatches":[{"publicId":"site1","panStationId":"FR*ELE*P100"}],
          "stations":[{"station":{"id":"site1","name":"Electra test"},"status":200,
            "location":{"chargeTariffs":[
              {"chargeTariffId":"mixed","currency":"EUR","elements":[
                {"priceComponents":[{"type":"ENERGY","price":.52},{"type":"TIME","price":2.4}]},
                {"priceComponents":[{"type":"PARKING_TIME","price":1.2}]}
              ]},
              {"chargeTariffId":"conditioned","elements":[
                {"priceComponents":[{"type":"ENERGY","price":.45}],"restrictions":{"futureFeature":"unknown"}}
              ]},
              {"chargeTariffId":"unsupported-only","elements":[
                {"priceComponents":[{"type":"CUSTOM","price":.5}]}
              ]}
            ]}}
          ]}
        with tempfile.TemporaryDirectory() as d:
            base=pathlib.Path(d);inp=base/"in.json";out=base/"out.json"
            inp.write_text(json.dumps(payload))
            subprocess.run([sys.executable,str(ROOT/"scripts/build_electra_direct_offers.py"),str(inp),str(out)],check=True,capture_output=True,text=True)
            compiled=json.loads(out.read_text())
            self.assertEqual(compiled["stats"]["offers"],3)
            self.assertEqual(compiled["stats"]["skippedUnsupportedTariffs"],0)
            self.assertEqual(len(compiled["unresolvedCases"]),2)
            mixed=next(x for x in compiled["offers"] if x["metadata"]["tariffId"]=="mixed")
            self.assertEqual(mixed["pricing"]["type"],"component_groups")
            self.assertEqual(len(mixed["pricing"]["componentGroups"]),2)
            self.assertIsNone(mixed["metadata"]["incompletePricingReason"])
            unknown=next(x for x in compiled["offers"] if x["metadata"]["tariffId"]=="unsupported-only")
            self.assertIn("unsupported_component:CUSTOM",unknown["metadata"]["incompletePricingReason"])

if __name__=="__main__":
    unittest.main()
