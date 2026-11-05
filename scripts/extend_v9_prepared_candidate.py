#!/usr/bin/env python3
"""Reuse immutable spatial fragments only when their canonical SHA is unchanged.

New/changed sources are repartitioned; exact national reports are recomputed.
Never changes the previous candidate, bundle or site.
"""
from __future__ import annotations
import argparse,gzip,json,shutil,tempfile
from collections import defaultdict,Counter
from pathlib import Path
from package_v9_preproduction_map import ROOT,check_candidate,copy_preview_file,digest
from shard_v9_preproduction_data import spatial_key,pieces,box,encoded,MAX_BYTES
from import_v9_bundle import verify
from join_v9_exact import match_offers

def extend(previous,bundle,destination):
    previous,bundle,destination=previous.resolve(),bundle.resolve(),destination.resolve()
    if destination.exists() or ROOT in destination.parents or destination==ROOT:raise ValueError('New isolated destination required')
    old=check_candidate(previous);manifest=verify(bundle)
    if old['schemaVersion']!=2:raise ValueError('Spatial candidate required')
    old_sources={r['source']:r for r in old['sources']};new_sources={r['source']:r for r in manifest['sources']}
    if not set(old_sources)<=set(new_sources):raise ValueError('Silent source removal forbidden')
    destination.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='v9-extend-',dir=destination.parent) as temporary:
        stage=Path(temporary)/'prepared';stage.mkdir();(stage/'shards').mkdir();entries=[]
        for source,entry in sorted(new_sources.items()):
            prior=old_sources.get(source)
            if prior and prior['sourceSha256']==entry['sha256'] and prior['sourceArtifactSha256']==entry['sourceArtifactSha256']:
                for shard in prior['shards']:copy_preview_file(str(previous/shard['path']),str(stage/shard['path']))
                entries.append(prior);continue
            data=json.loads((bundle/entry['path']).read_bytes());buckets=defaultdict(list);descriptors=[]
            for station in data['stations']:buckets[spatial_key(station)].append(station)
            for tile in sorted(buckets,key=lambda x:(x is None,x or (0,0))):
                for payload,raw in pieces(data,sorted(buckets[tile],key=lambda x:x['id']),MAX_BYTES):
                    name=f"shards/{source.replace(':','__')}__{len(descriptors):04d}.json.bin";compressed=gzip.compress(raw,compresslevel=6,mtime=0)
                    (stage/name).write_bytes(compressed);descriptors.append({'path':name,'sha256':digest(compressed),'encoding':'gzip',
                        'bytes':len(compressed),'uncompressedBytes':len(raw),'stationCount':len(payload['stations']),'bbox':box(payload['stations'])})
            entries.append({'source':source,'sourceSha256':entry['sha256'],'sourceArtifactSha256':entry['sourceArtifactSha256'],'shards':descriptors})
        index={'schemaVersion':2,'status':'prepared','bundleId':bundle.name,'sources':entries,'rejected':[],'joins':[]}
        for prior in old.get('joins',[]):
            national=prior['nationalSource'];related=[s for s in sorted(new_sources) if s.startswith(national[:2]+':') and s!=national]
            unchanged=set(s for s in old_sources if s.startswith(national[:2]+':'))==set([national,*related]) and all(
                old_sources[s]['sourceSha256']==new_sources[s]['sha256'] for s in [national,*related])
            if unchanged:
                previous_raw=(previous/prior['path']).read_bytes()
                report=json.loads(gzip.decompress(previous_raw) if prior.get('encoding')=='gzip' else previous_raw)
                report['candidateBundleId']=bundle.name
            else:
                read=lambda s:json.loads((bundle/new_sources[s]['path']).read_bytes())
                matched=match_offers(read(national),[read(s) for s in related])
                report={'schemaVersion':1,'candidateBundleId':bundle.name,'nationalSource':national,
                    'sourceInputs':[{'source':s,'sha256':new_sources[s]['sha256']} for s in [national,*related]],
                    'policy':'exact_official_evse_and_exact_official_connector_when_scoped;no_site_or_geo_price_propagation',**matched}
            name=prior['path'];(stage/name).parent.mkdir(parents=True,exist_ok=True);raw=encoded(report)
            if prior.get('encoding')=='gzip':
                transport=gzip.compress(raw,mtime=0);(stage/name).write_bytes(transport)
                index['joins'].append({**prior,'sha256':digest(transport),'bytes':len(transport),
                    'uncompressedSha256':digest(raw),'uncompressedBytes':len(raw)})
            else:
                (stage/name).write_bytes(raw);index['joins'].append({**prior,'sha256':digest(raw)})
        (stage/'index.json').write_bytes(encoded(index));check_candidate(stage);stage.rename(destination)
    return {'status':'prepared','bundleId':bundle.name,'sources':len(entries),'reusedSources':sum(1 for e in entries if e is old_sources.get(e['source']))}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--previous',type=Path,required=True);p.add_argument('--bundle',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    print(json.dumps(extend(a.previous,a.bundle,a.out)))
