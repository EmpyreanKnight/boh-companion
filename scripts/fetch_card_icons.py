#!/usr/bin/env python3
"""Download skill, item and helper icons named in the wiki infoboxes into public/icons/.
Game artwork by Weather Factory; see public/icons/NOTICE.txt. Run after crawl.py, before build_data.py."""
import json, os, re, subprocess, sys, urllib.parse, unicodedata
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(__file__), "..")
API = "https://book-of-hours.fandom.com/api.php"
OUT = os.path.join(ROOT, "public", "icons")
PAGES = json.load(open(os.path.join(ROOT, "data-src", "raw", "pages.json")))["pages"]
GROUPS = {"boh skill": "skill", "boh item": "item", "boh memory": "item", "personinfobox": "person"}

def slug(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def image_of(text):
    m = re.search(r"\{\{\s*([^|{}\n]+?)\s*[\n|]", text)
    while m and m.group(1).replace("_", " ").strip().lower() not in GROUPS:
        m = re.search(r"\{\{\s*([^|{}\n]+?)\s*[\n|]", text[m.end():]) and None
    if not m:
        return None, None
    group = GROUPS[m.group(1).replace("_", " ").strip().lower()]
    im = re.search(r"\|\s*image1?\s*=\s*(?:<gallery>\s*)?(?:\[\[)?(?:File:)?\s*([^|\]\n<]+?\.(?:png|PNG|jpg|jpeg|webp|gif))", text[:2500])
    return group, im.group(1).strip() if im else None

def main():
    wanted = {}
    for title, p in PAGES.items():
        group, img = image_of(p["text"])
        if not group and {"Language", "Skill"} <= set(p["categories"]) and "Aspect" not in p["categories"]:
            # language pages have no infobox; their icon is the image the page opens with
            im = re.match(r"\s*\[\[File:\s*([^|\]\n]+?\.(?:png|PNG|jpg|jpeg|webp|gif))", p["text"])
            group, img = ("skill", im.group(1).strip()) if im else (None, None)
        if group and img:
            if group == "person" and "Assistants" not in p["categories"]:
                continue
            wanted[f"{group}-{slug(title)}"] = "File:" + img.replace("_", " ")
    todo = {k: v for k, v in wanted.items() if not os.path.exists(os.path.join(OUT, k + ".webp"))}
    print(len(wanted), "icons named,", len(todo), "to fetch", file=sys.stderr)
    urls, files = {}, sorted(set(todo.values()))
    for i in range(0, len(files), 40):
        q = urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": "2", "prop": "imageinfo",
                                    "iiprop": "url", "iiurlwidth": "72", "titles": "|".join(files[i:i + 40])})
        d = json.loads(subprocess.run(["curl", "-sS", "-m", "60", f"{API}?{q}"], capture_output=True, text=True).stdout)
        norm = {n["to"]: n["from"] for n in d["query"].get("normalized", [])}
        for pg in d["query"]["pages"]:
            ii = (pg.get("imageinfo") or [None])[0]
            if ii:
                urls[norm.get(pg["title"], pg["title"])] = ii.get("thumburl") or ii["url"]
                urls[pg["title"]] = ii.get("thumburl") or ii["url"]
    def fetch(item):
        key, f = item
        url = urls.get(f)
        if not url:
            return key, False
        dest = os.path.join(OUT, key + ".webp")
        r = subprocess.run(["curl", "-sS", "-m", "60", "-L", "-H", "Accept: image/webp", "-o", dest, url])
        ok = r.returncode == 0 and os.path.exists(dest) and os.path.getsize(dest) > 200
        if not ok and os.path.exists(dest):
            os.remove(dest)
        return key, ok
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(fetch, todo.items()))
    print(sum(ok for _, ok in res), "downloaded,", sum(not ok for _, ok in res), "missing", file=sys.stderr)

if __name__ == "__main__":
    main()
