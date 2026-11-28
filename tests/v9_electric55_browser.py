"""Check Electric 55 offers and their exact national PDCs in the assembled shell."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread
from urllib.parse import urljoin

from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def run(site, url, cases, mobile):
    server = None
    if not url:
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(site)))
        Thread(target=server.serve_forever, daemon=True).start()
        url = f'http://127.0.0.1:{server.server_port}/'
    url = url.rstrip('/') + '/'
    opts = Options()
    opts.add_argument('-headless')
    opts.binary_location = '/Applications/Firefox.app/Contents/MacOS/firefox'
    try:
        with webdriver.Firefox(options=opts) as browser:
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
            WebDriverWait(browser, 40).until(lambda b: b.execute_script('return window.__TCC_V9_SHELL__?.ready'))
            results = []
            for case in cases:
                result = browser.execute_async_script(r"""
                  const [test,done]=arguments;
                  (async()=>{
                    const {latitude:lat,longitude:lon,name,stationId,evseId,offerId,connectorIds}=test;
                    const get=id=>document.getElementById(id);
                    window.resolveOrigin=async()=>({lat,lon,label:name});
                    sessionStorage.setItem('tcc-v9-country:'+lat.toFixed(3)+','+lon.toFixed(3),'FR');
                    get('simOrigin').value=name;
                    get('simMaxDistance').value='1';
                    get('simDate').value='2026-11-27';
                    get('simTime').value='22:45';
                    get('simUnplugTime').value='23:45';
                    get('simOperatorFilter').dataset.v9Mode='all';
                    get('simRanking').value='price';
                    get('simNow').value='45';get('simTarget').value='50';
                    let area=await window.compare();
                    if(!area||area.diagnostics?.errors?.length)throw Error('source not loaded '+JSON.stringify(area?.diagnostics?.errors));
                    const matches=area.mapStations.filter(s=>s.id===stationId);
                    if(matches.length!==1)throw Error('missing or duplicated national station');
                    if(matches[0].page)area=await area.navigateToPage(matches[0].page);
                    const station=area.stations.find(s=>s.id===stationId);
                    const physical=station?.evses.find(e=>e.officialEvseId===evseId);
                    if(!physical)throw Error('national PDC missing');
                    const offers=station.offers.filter(o=>o.metadata?.sourceId==='FR:electric55_chain'&&o.evseIds.includes(physical.id));
                    const card=()=>[...document.querySelectorAll('.v9-result-card')].find(e=>e.dataset.v9StationId===stationId);
                    while(!card()){
                      const more=document.querySelector('.v9-more-stations');if(!more)break;more.click();
                    }
                    const pdc=[...(card()?.querySelectorAll('.v9-pdc-detail')||[])].find(detail=>
                      detail.querySelector('summary')?.textContent.includes(evseId));
                    if(!pdc)throw Error('national PDC missing from station card');
                    if(!offerId){
                      if(offers.length)throw Error('price propagated to a national PDC without a source tariff');
                    }else{
                      if(offers.length!==1||offers[0].id!==offerId||offers[0].metadata.nationalJoin?.nationalSource!=='FR:irve_static'||
                         JSON.stringify([...offers[0].connectorIds].sort())!==JSON.stringify(connectorIds))
                        throw Error('tariff outside its exact IRVE scope');
                      const rates=[...pdc.querySelectorAll('.v9-tariff-row')].filter(row=>
                        row.dataset.v9LaneLabel==='Direct'&&row.dataset.v9TariffState==='priced'&&row.textContent.includes('Electric 55 Direct'));
                      if(!rates.length)throw Error('no calculated Electric 55 on the card '+card().textContent.slice(0,1500));
                      if(!rates.some(row=>Number(row.dataset.v9EffectiveTotal)>0&&row.textContent.includes('0,60')))
                        throw Error('missing simulation or fixed fee detail '+rates[0].textContent);
                    }
                    return {stationId,evseId,offerCount:offers.length,width:innerWidth,scrollWidth:document.documentElement.scrollWidth};
                  })().then(done).catch(error=>done({error:String(error)}));
                """, case)
                assert not result.get('error'), (case, result)
                if mobile:
                    assert result['width'] == result['scrollWidth'] == 390, result
                results.append(result)
            return results
    finally:
        if server:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--cases', type=Path, required=True)
    parser.add_argument('--url')
    parser.add_argument('--mobile', action='store_true')
    args = parser.parse_args()
    print(json.dumps(run(args.site, args.url, json.loads(args.cases.read_bytes()), args.mobile)))
