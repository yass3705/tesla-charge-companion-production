"""Verify the reviewed Direct and raw reviewed offers in Firefox."""
from __future__ import annotations

import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import urljoin

from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def verify(site, url, cases, mobile):
    server = None
    if not url:
        class Quiet(SimpleHTTPRequestHandler):
            def log_message(self, *_args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        url = f'http://127.0.0.1:{server.server_port}/'
    url = url.rstrip('/') + '/'
    options = Options()
    options.add_argument('-headless')
    options.binary_location = '/Applications/Firefox.app/Contents/MacOS/firefox'
    results = []
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.set_window_size(1280, 900)
            browser.set_script_timeout(120)
            if mobile:
                browser.get(urljoin(url, 'control/index.html'))
                frame = browser.execute_script("""
                    const frame=document.createElement('iframe');
                    frame.style.cssText='width:390px;height:844px;border:0';
                    frame.src=arguments[0];document.body.append(frame);return frame;
                """, urljoin(url, 'v9-production-shell/'))
                browser.switch_to.frame(frame)
            else:
                browser.get(url)
            WebDriverWait(browser, 35).until(lambda b: b.execute_script('return window.__TCC_V9_SHELL__?.ready'))
            for case in cases:
                result = browser.execute_async_script("""
                  const [test,done]=arguments;
                  (async()=>{
                    const {latitude:lat,longitude:lon,name,stationId,evseId,source}=test;
                    const get=id=>document.getElementById(id);
                    window.resolveOrigin=async()=>({lat,lon,label:name});
                    sessionStorage.setItem('tcc-v9-country:'+lat.toFixed(3)+','+lon.toFixed(3),test.country||'FR');
                    get('simOrigin').value=name;get('simMaxDistance').value='1';
                    get('simDate').value='2026-11-28';get('simTime').value='19:45';get('simUnplugTime').value='20:45';
                    get('simNow').value='45';get('simTarget').value='50';
                    get('simOperatorFilter').dataset.v9Mode='all';
                    get('simRanking').value='price';
                    let area=await window.compare();
                    if(!area||area.diagnostics?.errors?.length)throw Error('source errors: '+JSON.stringify(area?.diagnostics?.errors));
                    const mapped=area.mapStations.filter(st=>st.id===stationId);
                    if(mapped.length!==1)throw Error('expected one national station in the map');
                    if(mapped[0].page)area=await area.navigateToPage(mapped[0].page);
                    const station=area.stations.find(st=>st.id===stationId),evse=station?.evses.find(e=>e.officialEvseId===evseId);
                    if(!evse)throw Error('national EVSE missing');
                    const findCard=()=>[...document.querySelectorAll('.v9-result-card')].find(e=>e.dataset.v9StationId===stationId);
                    while(!findCard()&&document.querySelector('.v9-more-stations'))document.querySelector('.v9-more-stations').click();
                    const points=[...(findCard()?.querySelectorAll('.v9-pdc-detail')||[])];
                    const detail=points.find(point=>point.querySelector('summary')?.textContent.includes(evseId));
                    if(!detail)throw Error('EVSE missing from the station card');
                    const offered=station.offers.filter(o=>o.metadata?.sourceId===source&&o.evseIds.includes(evse.id));
                    if(test.unassignedReason){
                      const direct=[...detail.querySelectorAll('[data-v9-lane-label="Direct"]')];
                      if(offered.length||!direct.some(row=>row.dataset.v9TariffState==='missing'&&row.textContent.includes('Prix non disponible')))
                        throw Error('unproved WAAT group promoted to an actual quote');
                    }else if(test.rawOfferId){
                      if(offered.length||!station.unparsedOffers.some(o=>o.id===test.rawOfferId&&o.scope.evseId===evse.id&&
                         o.rawOffer?.feeSemantics?.safeForFullSessionCost===false))throw Error('DRIVECO fee lost or priced');
                      if(detail.textContent.includes(test.rawOfferId))throw Error('unproved offer displayed as a calculation');
                    }else if(test.currency){
                      if(offered.length!==1||offered[0].currency!==test.currency||
                         offered[0].metadata.nationalJoin?.nationalSource!=='CH:swiss_integration')
                        throw Error('Swiss direct offer lost or misbound');
                      const direct=[...detail.querySelectorAll('[data-v9-lane-label="Direct"]')];
                      if(!direct.some(row=>row.dataset.v9TariffState==='priced'&&row.textContent.includes(test.provider)&&row.textContent.includes('CHF')))
                        throw Error('Swiss quote or source currency missing');
                    }else{
                      if(!offered.some(o=>o.id===test.offerId&&o.metadata.nationalJoin?.nationalSource==='FR:irve_static')||
                         !offered.some(o=>o.subscriptionId===test.subscriptionId&&o.metadata.annualFeeEur===10))
                        throw Error('public or annual offer lost');
                      const direct=[...detail.querySelectorAll('[data-v9-lane-label="Direct"]')];
                      if(!direct.some(row=>row.dataset.v9TariffState==='priced'&&row.textContent.includes('La Borne Bleue')&&
                         Math.abs(Number(row.dataset.v9EffectiveTotal)-3.75)<.01))
                        throw Error('duration tariff is missing or has the wrong total: '+direct.map(r=>r.dataset.v9EffectiveTotal));
                    }
                    return {source,stationId,evseId,offers:offered.length,unassignedReason:test.unassignedReason,
                      viewport:innerWidth,scroll:document.documentElement.scrollWidth};
                  })().then(done).catch(e=>done({error:String(e)}));
                """, case)
                assert not result.get('error'), (case, result)
                if mobile:
                    assert result['viewport'] == result['scroll'] == 390, result
                results.append(result)
        return results
    finally:
        if server:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--oracle', type=Path, required=True)
    parser.add_argument('--url')
    parser.add_argument('--mobile', action='store_true')
    a = parser.parse_args()
    print(json.dumps(verify(a.site,a.url,json.loads(a.oracle.read_bytes())['cases'],a.mobile)))
