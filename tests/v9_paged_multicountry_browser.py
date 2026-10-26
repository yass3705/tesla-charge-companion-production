#!/usr/bin/env python3
"""Nine-country Firefox smoke for the bounded, page-independent V9 map."""
import argparse
import json
from pathlib import Path
from v9_radius_performance_browser import measure

CITIES=[('FR','Paris',48.856,2.352,20),('GB','London',51.507,-0.128,20),
        ('IT','Milan',45.464,9.190,20),('DE','Berlin',52.520,13.405,20),
        ('ES','Madrid',40.416,-3.703,20),('MA','Casablanca',33.573,-7.590,20),
        ('CH','Zurich',47.376,8.541,20),('BE','Brussels',50.850,4.352,20),
        ('NL','Amsterdam',52.367,4.904,20)]
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--site',type=Path,required=True);args=parser.parse_args()
    result={}
    for country,label,lat,lon,radius in CITIES:
        row=measure(args.site,lat,lon,country,label,120000,[radius])[0]
        if row.get('error') or row['matchingStations']!=row['mapStations'] or row['globallyRankedStations']!=row['matchingStations'] or row['pageStations']>160 or row['visibleMarkers']<=0:
            raise AssertionError(f'{country}: {row}')
        result[country]=row
    mobile=measure(args.site,48.856,2.352,'FR','Paris mobile',120000,[20],390)[0]
    if mobile.get('error') or mobile['scrollWidth']>390 or mobile['visibleMarkers']<=0:
        raise AssertionError(f'mobile: {mobile}')
    result['FR-mobile']=mobile
    print(json.dumps(result,ensure_ascii=False))
