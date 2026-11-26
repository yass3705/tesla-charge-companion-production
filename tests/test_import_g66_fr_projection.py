import copy, pathlib, sys, unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from import_g66_fr_projection import crosswalk
class CrosswalkTest(unittest.TestCase):
    def setUp(self):
        self.n={"source":{"id":"FR:irve_static"},"stations":[{"id":"s","sourceStationId":"FRS"}],
        "evses":[{"id":"e","stationId":"s","officialEvseId":"FRE"}],
        "connectors":[{"id":"c","evseId":"e","plugType":"Type 2","kind":"AC","powerKw":22}]}
        self.r={"station_id":"FRS","evse_id":"FRE","national_plug":"TYPE2","national_mode":"AC","national_kw":"22"}
    def reason(self): return crosswalk(self.n,[self.r])[0]["reason"]
    def test_exact(self):
        x=crosswalk(self.n,[self.r])[0];self.assertEqual(x["nationalConnectorKey"],"c");self.assertFalse(x["publicationEligible"])
    def test_station(self):
        self.r["station_id"]="other";self.assertEqual(self.reason(),"STATION_ID_CHANGED")
    def test_no_power(self):
        self.r["national_kw"]="0";self.assertEqual(self.reason(),"NATIONAL_POWER_MISSING")
    def test_power_changed(self):
        self.n["connectors"][0]["powerKw"]=11;self.assertEqual(self.reason(),"POWER_MISMATCH")
    def test_duplicate_connector(self):
        self.n["connectors"].append(dict(self.n["connectors"][0],id="c2"));self.assertEqual(self.reason(),"CONNECTOR_AMBIGUOUS")
    def test_non_public(self):
        self.n["stations"][0]["publicAccessDecision"]="exclude_non_public";self.assertEqual(self.reason(),"NON_PUBLIC")
    def test_collision(self):
        self.assertEqual({x["reason"] for x in crosswalk(self.n,[self.r,self.r])},{"CROSSWALK_COLLISION"})
    def test_missing(self):
        self.r["evse_id"]="missing";self.assertEqual(self.reason(),"EVSE_ABSENT")
    def test_other_plug(self):
        self.r["national_plug"]="EF";self.assertEqual(self.reason(),"PLUG_OR_CURRENT_MISMATCH")
if __name__=="__main__": unittest.main()
