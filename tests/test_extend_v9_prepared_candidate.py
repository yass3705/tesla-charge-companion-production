import hashlib,json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from extend_v9_prepared_candidate import extend
from shard_v9_preproduction_data import build
from test_shard_v9_preproduction_data import fixture

class ExtendCandidateTest(unittest.TestCase):
    def test_reuse_only_identical_source_bytes_and_preserve_rollback(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);old=fixture(root);shards=root/'sharded';build(old,shards,max_bytes=3000)
            raw=(old/'sources/NL__dotnl_static.json').read_bytes();extra=json.loads(raw);extra['source']['id']='NL:proof_overlay'
            newraw=json.dumps(extra).encode();entries=[]
            files={'NL:dotnl_static':raw,'NL:proof_overlay':newraw}
            for source,body in sorted(files.items()):entries.append({'source':source,'path':source.replace(':','__')+'.json',
                'sha256':hashlib.sha256(body).hexdigest(),'sourceArtifactSha256':'a'*64,'canonicalSchemaVersion':1})
            manifest=json.dumps({'schemaVersion':1,'state':'prepared','sources':entries},sort_keys=True).encode()
            bundle=root/hashlib.sha256(manifest).hexdigest();bundle.mkdir();(bundle/'manifest.json').write_bytes(manifest)
            for entry in entries:(bundle/entry['path']).write_bytes(files[entry['source']])
            before={p.relative_to(shards):p.read_bytes() for p in shards.rglob('*') if p.is_file()}
            output=root/'extended';result=extend(shards,bundle,output)
            self.assertEqual(result['sources'],2);self.assertEqual(result['reusedSources'],1)
            self.assertEqual(before,{p.relative_to(shards):p.read_bytes() for p in shards.rglob('*') if p.is_file()})
            for p,body in before.items():
                if str(p).startswith('shards/'):self.assertEqual((output/p).read_bytes(),body)
            corrupt=next((shards/'shards').iterdir());corrupt.write_bytes(b'corrupted')
            with self.assertRaises(ValueError):extend(shards,bundle,root/'bad')
            self.assertFalse((root/'bad').exists())
