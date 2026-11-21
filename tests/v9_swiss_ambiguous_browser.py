"""Verify the two real national records sharing an EVSE at the Swiss preview URL."""
import argparse
import json

from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def run(url):
    options = Options()
    options.add_argument("-headless")
    options.binary_location = "/Applications/Firefox.app/Contents/MacOS/firefox"
    with webdriver.Firefox(options=options) as browser:
        browser.get(url)
        WebDriverWait(browser, 45).until(lambda tab: tab.execute_script("return window.__TCC_V9_SHELL__?.ready"))
        browser.set_script_timeout(150)
        result = browser.execute_async_script("""
          const done = arguments[0];
          (async () => {
            const eid = 'CH*CCC*E50049', lat = 46.84785108, lon = 8.63321941;
            const expectedStations = 2;
            window.resolveOrigin = async () => ({lat, lon, label: 'Contrôle national suisse'});
            sessionStorage.setItem('tcc-v9-country:' + lat.toFixed(3) + ',' + lon.toFixed(3), 'CH');
            document.getElementById('simOrigin').value = 'Contrôle national suisse';
            document.getElementById('simMaxDistance').value = '1';
            document.getElementById('simOperatorFilter').dataset.v9Mode = 'all';
            const area = await window.compare();
            const found = area.stations.flatMap(station => (station.evses || [])
              .filter(evse => evse.officialEvseId === eid)
              .map(evse => ({station: station.id, evse: evse.id,
                priced: station.offers.filter(offer => offer.evseIds?.includes(evse.id)).length,
                raw: station.unparsedOffers.filter(offer => offer.scope?.evseId === evse.id).length})));
            if (new Set(found.map(item => item.station)).size !== expectedStations ||
                new Set(found.map(item => item.evse)).size !== expectedStations ||
                found.some(item => item.priced || item.raw)) throw Error(JSON.stringify(found));
            return {officialEvseId: eid, records: found};
          })().then(done).catch(err => done({error: String(err)}));
        """)
        if "error" in result:
            raise AssertionError(result["error"])
        return {"url": url, "status": "pass", **result}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    print(json.dumps(run(parser.parse_args().url)))
