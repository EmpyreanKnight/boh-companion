#!/usr/bin/env python3
"""Download Principle, soul-element and Wisdom icons from the wiki into public/icons/.
These images are Weather Factory's game artwork (not CC BY-SA); see public/icons/NOTICE.txt."""
import json, os, subprocess, urllib.parse

API = "https://book-of-hours.fandom.com/api.php"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
NAMES = {
    "principle": ["Edge", "Forge", "Grail", "Heart", "Knock", "Lantern", "Moon", "Moth", "Nectar", "Rose",
                  "Scale", "Sky", "Winter"],
    "soul": ["Chor", "Ereb", "Fet", "Health", "Mettle", "Phost", "Shapt", "Trist", "Wist"],
    "wisdom": ["Horomachistry", "Ithastry", "Illumination", "Hushery", "Nyctodromy", "Skolekosophy", "Bosk",
               "Preservation", "Birdsong"],
}

FILES = {"Edge": "File:Edge PNG.png"}

def main():
    os.makedirs(OUT, exist_ok=True)
    got = {}
    for group, names in NAMES.items():
        q = urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": "2",
                                    "prop": "imageinfo", "iiprop": "url", "iiurlwidth": "96",
                                    "titles": "|".join(FILES.get(n, f"File:{n}.png") for n in names)})
        d = json.loads(subprocess.run(["curl", "-sS", "-m", "60", f"{API}?{q}"], capture_output=True, text=True).stdout)
        for p in d["query"]["pages"]:
            ii = (p.get("imageinfo") or [None])[0]
            if not ii:
                print("missing", p["title"]); continue
            name = p["title"].split(":", 1)[1].rsplit(".", 1)[0].lower().replace(" png", "")
            name = "the-bosk" if name == "bosk" else name
            dest = os.path.join(OUT, f"{group}-{name}.webp")
            # the image CDN serves WebP to curl whatever the file name says
            r = subprocess.run(["curl", "-sS", "-m", "60", "-L", "-H", "Accept: image/webp", "-o", dest,
                                ii.get("thumburl") or ii["url"]])
            if r.returncode == 0 and os.path.getsize(dest) > 200:
                got[f"{group}-{name}"] = True
            else:
                print("failed", p["title"])
    with open(os.path.join(OUT, "NOTICE.txt"), "w") as f:
        f.write("Icons in this folder are artwork from Book of Hours by Weather Factory, downloaded from the\n"
                "Book of Hours Wiki (https://book-of-hours.fandom.com). They are NOT covered by this\n"
                "repository's CC BY-SA licence. Build with VITE_ICONS=off to ship without them.\n")
    print(len(got), "icons")

if __name__ == "__main__":
    main()
