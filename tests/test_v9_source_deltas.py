import importlib.util
import pathlib
import unittest

path=pathlib.Path(__file__).resolve().parents[1]/"scripts/inspect_v9_source_deltas.py"
spec=importlib.util.spec_from_file_location("v9_delta",path)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class TestDeltaGate(unittest.TestCase):
    def test_fail_closed_categories(self):
        paths=[p for group in mod.MONITORED.values() for p in group]
        self.assertEqual(len(paths),len(set(paths)))
        a,b,c,d,e=paths[:5]
        rows=mod.classify({a:"x",b:"y",c:"z",e:"keep"},
                          {a:"x",b:"new",d:"new",e:"keep"})
        mapping={r["path"]:r["state"] for r in rows}
        self.assertEqual(mapping[a],"unchanged")
        self.assertEqual(mapping[b],"changed_candidate")
        self.assertEqual(mapping[c],"missing_current")
        self.assertEqual(mapping[d],"new_candidate")
        self.assertEqual(mapping[e],"unchanged")
    def test_both_missing_is_explicit(self):
        path=mod.MONITORED["national"][0]
        rows=mod.classify({}, {})
        self.assertEqual(next(x["state"] for x in rows if x["path"]==path),"missing_both")
if __name__=="__main__":
    unittest.main()
