#!/usr/bin/env python3
"""Check isolated preview guidance and local feedback without sending a message."""
import argparse
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def run(site):
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    options = Options()
    options.add_argument('-headless')
    options.binary_location = '/Applications/Firefox.app/Contents/MacOS/firefox'
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.get(f'http://127.0.0.1:{server.server_port}/')
            WebDriverWait(browser, 30).until(lambda d: d.execute_script('return window.__TCC_V9_SHELL__?.ready'))
            result = browser.execute_async_script('''
              const done=arguments[0],tab=document.getElementById('v9ValidationTab');
              tab.click();
              const panel=document.getElementById(tab.getAttribute('aria-controls'));
              const field=document.getElementById('v9FeedbackText');
              const button=document.getElementById('v9FeedbackShare');
              const status=document.getElementById('v9FeedbackStatus');
              Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
              let copied='';
              Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
              button.click();
              const emptyRejected=status.textContent.includes('Décris d’abord');
              field.value='Recette locale : vérifier cette prise.';button.click();
              setTimeout(()=>done({panelVisible:panel.classList.contains('active'),
                steps:panel.querySelectorAll('ol li').length,fieldLabelled:!!field.labels.length,
                liveStatus:status.getAttribute('aria-live'),emptyRejected,
                feedbackCopied:copied.includes(field.value)&&copied.includes('Bundle : '),
                copiedStatus:status.textContent.includes('Signalement copié'),
                radiusMaximum:document.getElementById('simMaxDistance').max}),0);
            ''')
            assert result == dict(panelVisible=True, steps=5, fieldLabelled=True,
                                 liveStatus='polite', emptyRejected=True, feedbackCopied=True,
                                 copiedStatus=True, radiusMaximum='100'), result
            return result
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--site', type=Path, required=True)
    print(json.dumps(run(parser.parse_args().site), ensure_ascii=False))
