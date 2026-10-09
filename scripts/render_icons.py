#!/usr/bin/env python3
"""
Redraw the app icons from public/mascot.svg (the mascot is the source of truth; edit the SVG, then run this).

Uses the Chromium that Playwright already installed (PLAYWRIGHT_BROWSERS_PATH) to turn the SVG into PNGs:
  public/icon-192.png, public/icon-512.png  (web app manifest)
  app/apple-icon.png                        (iPhone home screen)
  app/icon.png                              (browser tab)
"""
import glob
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
svg = open(os.path.join(ROOT, "public", "mascot.svg")).read()
chrome = (glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome") or [None])[0]
targets = [(192, "public/icon-192.png"), (512, "public/icon-512.png"), (180, "app/apple-icon.png"), (96, "app/icon.png")]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=chrome) if chrome else p.chromium.launch()
    for size, rel in targets:
        page = browser.new_page(viewport={"width": size, "height": size})
        sized = svg.replace('width="512" height="512"', f'width="{size}" height="{size}"')
        page.set_content(f'<html><body style="margin:0">{sized}</body></html>')
        page.screenshot(path=os.path.join(ROOT, rel))
        print("wrote", rel)
    browser.close()
