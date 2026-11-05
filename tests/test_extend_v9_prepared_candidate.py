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
    def test_compressed_join_reused_only_for_identical_country_inputs(self):
        import gzip
        from unittest.mock import patch
        from join_v9_exact import match_offers
        from package_v9_preproduction_map import check_candidate
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);old=fixture(root);idx=json.loads((old/'index.json').read_bytes());row=idx['sources'][0]
            data=json.loads((old/row['path']).read_bytes());report={'schemaVersion':1,'candidateBundleId':idx['bundleId'],'nationalSource':row['source'],'sourceInputs':[{'source':row['source'],'sha256':row['sha256']}],**match_offers(data,[])}
            (old/'joins').mkdir();raw=json.dumps(report).encode();(old/'joins/NL__dotnl_static.json').write_bytes(raw)
            idx['joins']=[{'nationalSource':row['source'],'path':'joins/NL__dotnl_static.json','sha256':hashlib.sha256(raw).hexdigest(),'status':'exact_identity_only'}];(old/'index.json').write_text(json.dumps(idx))
            shards=root/'shards';build(old,shards,max_bytes=3000)
            def bundle(payload):
                body=json.dumps(payload).encode();entry={'source':row['source'],'path':'NL__dotnl_static.json','sha256':hashlib.sha256(body).hexdigest(),'sourceArtifactSha256':'a'*64,'canonicalSchemaVersion':1}
                manifest=json.dumps({'schemaVersion':1,'state':'prepared','sources':[entry]}).encode();b=root/hashlib.sha256(manifest).hexdigest();b.mkdir();(b/'manifest.json').write_bytes(manifest);(b/entry['path']).write_bytes(body);return b
            b=bundle(data)
            with patch('extend_v9_prepared_candidate.match_offers',side_effect=AssertionError('unchanged inputs must reuse verified joins')):
                extend(shards,b,root/'same')
            same=check_candidate(root/'same');j=same['joins'][0];decoded=json.loads(gzip.decompress((root/'same'/j['path']).read_bytes()));self.assertEqual(j['encoding'],'gzip');self.assertEqual(decoded,{**report,'candidateBundleId':b.name})
            data['stations'][0]['name']='changed source';b2=bundle(data)
            with patch('extend_v9_prepared_candidate.match_offers',wraps=match_offers) as calls:
                extend(root/'same',b2,root/'changed');self.assertEqual(calls.call_count,1)
            self.assertEqual(check_candidate(root/'changed')['joins'][0]['encoding'],'gzip')
