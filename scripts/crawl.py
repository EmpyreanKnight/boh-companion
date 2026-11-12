#!/usr/bin/env python3
"""Crawl the Book of Hours wiki (CC BY-SA) into data-src/raw/. Run by hand, not in CI.

With --pages, fetch only the titles in PAGES and merge them into the existing crawl (for adding a page
to PAGES without downloading everything again). Category names after --pages are fetched as well:
`crawl.py --pages Book`."""
import json, os, subprocess, sys, time, urllib.parse

API = "https://book-of-hours.fandom.com/api.php"
RAW = os.path.join(os.path.dirname(__file__), "..", "data-src", "raw")
CATEGORIES = ["Readable", "Book", "Skill", "Language", "Workstation", "Thing", "Memory", "Tool", "Ink",
              "Beverage", "Material", "Sustenance", "Comfort", "Wall Art", "Candle", "Pigment",
              "Liquid", "Flower", "Leaf", "Remains", "Fuel", "Light", "Numen", "Persistent",
              "Weather", "Sound", "Omen", "Beast", "Blank", "Desk", "Shrine", "Instrument", "Bed",
              "Fireplace", "Lens", "Device", "Fabric and Fibre", "Glass", "Metal", "Gem", "Wood",
              "Woven", "Made of Wood", "Fruit", "Raw", "Brewable", "Mark", "Co-operative",
              "Kitchenware", "Knife", "Root", "Egg", "Stone", "Ductile", "Cooking Ingredient",
              "Locations", "Assistants", "Journal", "The Librarian", "Villagers", "People"]
PAGES = ["Books", "Skills", "Crafting", "Workstations", "Memory", "Tools", "Ink", "Elements of the Soul",
         "The Tree of Wisdoms", "Aspects", "Principles", "Beverage", "Weather", "Assistants", "Locations",
         "The Beginning", "Journals", "Talk",
         # gathering stations and their seasonal decks
         "Gathering", "Garden", "Decks", "Beachcombing", "A Walk on the Moor", "Beehive", "The Sea-Caves",
         "The Gull-Colony", "Hush House Well"]

def api(params):
    params = dict(params, format="json", formatversion="2")
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        r = subprocess.run(["curl", "-sS", "-m", "60", "-A", "boh-companion-crawler/0.1", url],
                           capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.startswith("{"):
            time.sleep(0.4)
            return json.loads(r.stdout)
        time.sleep(2 ** attempt)
    raise SystemExit("request failed: " + url)

def crawl_generator(params, out):
    cont = {}
    while True:
        d = api(dict(params, **cont))
        for p in d.get("query", {}).get("pages", []):
            rev = (p.get("revisions") or [{}])[0]
            text = rev.get("slots", {}).get("main", {}).get("content")
            e = out.setdefault(p["title"], {"title": p["title"], "categories": []})
            if text is not None:
                e["text"] = text
            for c in p.get("categories", []):
                name = c["title"].split(":", 1)[1]
                if name not in e["categories"]:
                    e["categories"].append(name)
        if "continue" not in d:
            break
        cont = d["continue"]

def main():
    os.makedirs(RAW, exist_ok=True)
    pages = {}
    base = {"action": "query", "prop": "revisions|categories", "rvprop": "content", "rvslots": "main",
            "cllimit": "max", "redirects": "1"}
    only_pages = "--pages" in sys.argv
    crawled = time.strftime("%Y-%m-%d")
    if only_pages:
        old = json.load(open(os.path.join(RAW, "pages.json")))
        pages, crawled = old["pages"], old["crawled"]
    for cat in [a for a in sys.argv[1:] if not a.startswith("--")] if only_pages else CATEGORIES:
        before = len(pages)
        crawl_generator(dict(base, generator="categorymembers", gcmtitle="Category:" + cat,
                             gcmnamespace="0", gcmlimit="40"), pages)
        print(f"{cat}: +{len(pages) - before} (total {len(pages)})", file=sys.stderr)
    for i in range(0, len(PAGES), 10):
        crawl_generator(dict(base, titles="|".join(PAGES[i:i + 10])), pages)
    missing = [t for t, p in pages.items() if "text" not in p]
    for i in range(0, len(missing), 40):
        crawl_generator(dict(base, titles="|".join(missing[i:i + 40])), pages)
    with open(os.path.join(RAW, "pages.json"), "w") as f:
        json.dump({"crawled": crawled, "source": API, "pages": pages}, f)
    print(f"saved {len(pages)} pages; {sum('text' not in p for p in pages.values())} without text", file=sys.stderr)

if __name__ == "__main__":
    main()
