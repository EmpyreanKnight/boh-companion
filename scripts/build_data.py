#!/usr/bin/env python3
"""Parse data-src/raw/pages.json (wiki wikitext) into public/data/*.json."""
import html, json, os, re, sys, unicodedata

ROOT = os.path.join(os.path.dirname(__file__), "..")
RAW = json.load(open(os.path.join(ROOT, "data-src", "raw", "pages.json")))
PAGES = RAW["pages"]
OUT = os.path.join(ROOT, "public", "data")
PRINCIPLES = ["edge", "forge", "grail", "heart", "knock", "lantern", "moon", "moth", "nectar",
              "rose", "scale", "sky", "winter"]
WARN = []

def warn(msg):
    WARN.append(msg)

def slug(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def strip_markup(s):
    s = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"'{2,}", "", s)
    return re.sub(r"\s+", " ", s).strip()

def links(s):
    """Return (target, display) for each [[link]] in s."""
    out = []
    for m in re.finditer(r"\[\[([^\]|]*)(?:\|([^\]]*))?\]\]", s):
        target = m.group(1).strip()
        disp = re.sub(r"<[^>]+>", " ", (m.group(2) or target)).strip()
        out.append((target, re.sub(r"\s+", " ", disp)))
    return out

def lore(s):
    """Parse {{Lore|Edge|2}} occurrences into {principle: n}. Missing number -> 1."""
    out = {}
    for m in re.finditer(r"\{\{\s*Lore\s*\|\s*([A-Za-z]+)\s*(?:\|\s*(\d+))?[^}]*\}\}", s):
        p = m.group(1).lower()
        if p in PRINCIPLES:
            out[p] = int(m.group(2) or 1)
    return out

def lore_list(s):
    seen = []
    for m in re.finditer(r"\{\{\s*Lore\s*\|\s*([A-Za-z]+)|\[\[(" + "|".join(p.title() for p in PRINCIPLES) + r")\]\]", s):
        p = (m.group(1) or m.group(2)).lower()
        if p in PRINCIPLES and p not in seen:
            seen.append(p)
    return seen

def template(text, names):
    """Find the first template whose name is in `names`; return its params dict."""
    for m in re.finditer(r"\{\{\s*([^|{}\n]+?)\s*[\n|]", text):
        if m.group(1).replace("_", " ").strip().lower() in names:
            i, depth, start = m.start(), 0, m.start()
            while i < len(text):
                if text.startswith("{{", i):
                    depth += 1; i += 2; continue
                if text.startswith("}}", i):
                    depth -= 1; i += 2
                    if depth == 0:
                        break
                    continue
                i += 1
            body = text[start + 2:i - 2]
            parts, buf, d1, d2 = [], "", 0, 0
            j = 0
            while j < len(body):
                two = body[j:j + 2]
                if two == "{{": d1 += 1; buf += two; j += 2; continue
                if two == "}}": d1 -= 1; buf += two; j += 2; continue
                if two == "[[": d2 += 1; buf += two; j += 2; continue
                if two == "]]": d2 -= 1; buf += two; j += 2; continue
                if body[j] == "|" and d1 == 0 and d2 == 0:
                    parts.append(buf); buf = ""
                else:
                    buf += body[j]
                j += 1
            parts.append(buf)
            params = {}
            for part in parts[1:]:
                if "=" in part:
                    k, v = part.split("=", 1)
                    params[k.strip().lower()] = v.strip()
            return params
    return None

def quote_parts(text):
    """The first {{Quote|...}} in `text` as (words, attribution); (None, None) when there is none."""
    m = re.search(r"\{\{\s*[Qq]uote\s*\|", text or "")
    if not m:
        return None, None
    depth, j = 1, m.end()
    while j < len(text) and depth:
        if text.startswith("{{", j): depth += 1; j += 2
        elif text.startswith("}}", j): depth -= 1; j += 2
        else: j += 1
    # an inline Principle icon stands for its name
    body = re.sub(r"\[\[File:([^.\]|]+?)(?: PNG)?\.[^\]]*\]\]", r"\1", text[m.end():j - 2])
    body = plain_templates(body)
    # the attribution follows a | that is not inside a [[link|label]]
    parts = [html.unescape(strip_markup(re.sub(r"^\s*\w+\s*=", "", p))) for p in re.split(r"\|(?![^\[\]]*\]\])", body)]
    parts = [re.sub(r"\s+", " ", p).strip() for p in parts if p.strip()]
    if not parts:
        return None, None
    words = parts[0]
    while words.count("]") > words.count("[") and words.endswith("]"):
        words = words[:-1].rstrip()      # a stray bracket typed on the wiki
    return words, parts[1] if len(parts) > 1 else None

def read_texts(text):
    """What the Librarian learns from a book, as (on starting it, on finishing it): the quotes a book page
    introduces with "Upon choosing to master" and "After completing mastery", titled "I'm Reading..." and
    "I've Read..." (or "Study start" and "Study end"). Falls back to the second and third quote of the page."""
    found = []
    for m in re.finditer(r"\{\{\s*[Qq]uote\s*\|", text or ""):
        words, by = quote_parts(text[m.start():])
        found.append((text[max(0, m.start() - 160):m.start()], words, by or ""))
    def pick(lead_pattern, title_pattern, fallback):
        for lead, words, by in found:
            if re.search(lead_pattern, lead) or re.search(title_pattern, by, flags=re.I):
                return words
        return found[fallback][1] if len(found) > fallback else None
    return (pick(r"[Uu]pon (?:choosing|starting|beginning)|choosing to master", r"I'?m Reading|Study start", 1),
            pick(r"After (?:completing|finishing|mastering)|completing mastery|[Oo]nce mastered", r"I'?ve Read|Study end", 2))

def plain_templates(s):
    """{{Lore|Edge|2}} -> "Edge 2", {{Soul|Chor}} -> "Chor", {{PAGENAME}} left to the caller."""
    s = re.sub(r"\{\{\s*[Ll]ore\s*\|\s*(\w+)\s*(?:\|\s*(\d+))?[^}]*\}\}", lambda x: " ".join(g for g in x.groups() if g), s)
    return re.sub(r"\{\{\s*[Ss]oul\s*\|\s*(\w+)[^}]*\}\}", r"\1", s)

def quote(text):
    """The in-game description: the first {{Quote|...}} on a page, with its attribution if it has one."""
    words, by = quote_parts(text)
    return words + (f" ({by})" if by else "") if words else None

def attunements(text):
    """The "Wisdom Attunement" section of a skill page: wisdom id -> the text the game shows on committing the
    skill there, and its title. The wiki's own sentences only tell which quote belongs to which Wisdom."""
    # the section goes by several headings (and one misspelling) across the skill pages
    m = re.search(r"==\s*(?:Wisdom At+unements?|Committing to Wisdoms?|Wisdoms?)\s*==(.*?)(?:\n==[^=]|\Z)", text or "", flags=re.S)
    body = m.group(1) if m else ""
    # the section is a run of quotes and "Committing X to [[Wisdom]] ..." paragraphs, usually quote first
    tokens = [(q.start(), "quote", q) for q in re.finditer(r"\{\{\s*[Qq]uote\s*\|", body)]
    tokens += [(c.start(), "commit", c) for c in re.finditer(r"[^\n]*\b[Cc]ommitt(?:ing|ed)\b[^\n]*", body)]
    tokens.sort(key=lambda t: t[0])
    out, used = {}, set()
    for i, (_, kind, c) in enumerate(tokens):
        # the first link may be the skill itself; the Wisdom is the first link that names one
        target = [t for t, _ in links(c.group(0)) if slug(t) in WISDOMS or slug(t) == "bosk"] if kind == "commit" else []
        if not target:
            continue
        # its quote stands just before it, or just after when the page put the paragraph first
        near = next((j for j in (i - 1, i + 1) if 0 <= j < len(tokens) and tokens[j][1] == "quote" and j not in used), None)
        words, name = quote_parts(body[tokens[near][0]:]) if near is not None else (None, None)
        used.add(near)
        wid = slug(target[0])
        out["the-bosk" if wid == "bosk" else wid] = {"text": words, "title": name}
    return out

def tables(text):
    """Yield (preceding_text, rows) for each wikitable; rows are lists of cell strings, rowspans expanded."""
    pos = 0
    for m in re.finditer(r"\{\|.*?\n\|\}", text, flags=re.S):
        before = text[pos:m.start()]
        pos = m.end()
        body = m.group(0)
        raw_rows = re.split(r"\n\|-[^\n]*", body)
        rows, pending = [], {}
        caption = ""
        for ri, raw in enumerate(raw_rows):
            cells = []
            for line in raw.split("\n"):
                if ri == 0 and line.startswith("{|"):
                    continue
                if line.startswith("|+"):
                    caption = line[2:]; continue
                if line.startswith("|}"):
                    continue
                if line.startswith("!") or line.startswith("|"):
                    header = line.startswith("!")
                    for c in re.split(r"\|\||!!", line[1:]):
                        cells.append([c, header])
                elif cells:
                    cells[-1][0] += "\n" + line
                elif ri == 0:
                    caption += "\n" + line
            if not cells:
                continue
            row, ci = [], 0
            queue = list(cells)
            while queue or ci in pending:
                if ci in pending:
                    val, left = pending[ci]
                    row.append(val)
                    if left <= 1: del pending[ci]
                    else: pending[ci] = (val, left - 1)
                    ci += 1; continue
                c, header = queue.pop(0)
                attrs = ""
                mm = re.match(r"^((?:\s*[a-zA-Z-]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s|]+)\s*|\s*<span[^>]*>\s*)+)\|(?!\|)", c)
                if mm and "[[" not in mm.group(1) and "{{" not in mm.group(1):
                    attrs, c = mm.group(1), c[mm.end():]
                rs = re.search(r"rowspan\s*=\s*\"?(\d+)", attrs)
                cs = re.search(r"colspan\s*=\s*\"?(\d+)", attrs)
                n = int(cs.group(1)) if cs else 1
                for k in range(n):
                    row.append(c.strip())
                    if rs and int(rs.group(1)) > 1:
                        pending[ci] = (c.strip(), int(rs.group(1)) - 1)
                    ci += 1
            rows.append({"cells": row, "header": all(h for _, h in cells)})
        yield before, caption, rows

# ---------------------------------------------------------------- skills
WISDOMS = {"horomachistry": "Horomachistry", "ithastry": "Ithastry", "illumination": "Illumination",
           "hushery": "Hushery", "nyctodromy": "Nyctodromy", "skolekosophy": "Skolekosophy",
           "the-bosk": "The Bosk", "preservation": "Preservation", "birdsong": "Birdsong"}
ELEMENTS = ["chor", "ereb", "fet", "health", "mettle", "phost", "shapt", "trist", "wist"]

def build_skills():
    skills = {}
    text = PAGES["Skills"]["text"]
    for before, caption, rows in tables(text):
        if not rows or "Primary Principle" not in " ".join(rows[0]["cells"]):
            continue
        is_lang = "Tutors" in " ".join(rows[0]["cells"])
        for r in rows[1:]:
            c = r["cells"]
            if len(c) < 5:
                continue
            name = links(c[0])[0][0]
            name = {"Henavek": "Kernewek Henavek"}.get(name, name)
            prim, sec = lore_list(c[1]), lore_list(c[2])
            wis = [slug(t) for t, _ in links(c[3])]
            wis = ["the-bosk" if w == "bosk" else w for w in wis]
            els = [e.lower() for e in re.findall(r"\{\{\s*Soul\s*\|\s*([A-Za-z]+)", c[4])]
            if len(prim) != 1 or len(sec) != 1 or len(wis) != 2 or len(els) != 2:
                warn(f"skill {name}: prim={prim} sec={sec} wis={wis} els={els}")
                continue
            page = PAGES.get(name, {}).get("text")
            said = attunements(page)
            for w in wis:
                if not said.get(w, {}).get("text"):
                    warn(f"skill {name}: no attunement text for {w}")
            skills[slug(name)] = {"id": slug(name), "name": name, "icon": has_icon("skill", slug(name)), "primary": prim[0], "secondary": sec[0],
                                  "isLanguage": is_lang,
                                  "commit": [{"wisdom": w, "element": e, **said.get(w, {})} for w, e in zip(wis, els)],
                                  "description": quote(page),
                                  "specialties": []}
    # specialties table
    for before, caption, rows in tables(text):
        if rows and "Description" in " ".join(rows[0]["cells"]) and "Skills" in " ".join(rows[0]["cells"]):
            for r in rows[1:]:
                c = r["cells"]
                if len(c) >= 3:
                    label = strip_markup(c[1])
                    for t, _ in links(c[2]):
                        if slug(t) in skills:
                            skills[slug(t)]["specialties"].append(label)
    return skills

# ---------------------------------------------------------------- books
def build_books(skills):
    books = {}
    text = (PAGES.get("Books") or PAGES["Readable"])["text"]
    sections = re.split(r"\n==\s*<b>\[\[([A-Za-z]+)\]\]</b>\s*==", text)
    for i in range(1, len(sections), 2):
        principle = sections[i].lower()
        for before, caption, rows in tables(sections[i + 1]):
            for r in rows:
                c = r["cells"]
                if r["header"] or len(c) < 7:
                    continue
                lk = links(c[0])
                if not lk:
                    continue
                title = lk[0][0]
                name = strip_markup(c[0])
                try:
                    mystery = int(strip_markup(c[1]))
                except ValueError:
                    warn(f"book {title}: mystery {c[1]!r}"); continue
                lang = links(c[2])
                lm = re.match(r"\s*(\d+)?\s*\[\[([^\]|]+)", c[5])
                lesson = None
                if lm:
                    sid = slug(lm.group(2))
                    if sid in skills:
                        lesson = {"skill": sid, "count": int(lm.group(1) or 1)}
                    else:
                        warn(f"book {title}: unknown lesson skill {lm.group(2)}")
                mem = links(c[6])
                page = PAGES.get(title, {})
                # a few book pages use the item infobox, and a few give the period only as a category
                info = template(page.get("text", ""), {"book (boh)"}) or template(page.get("text", ""), {"boh item"}) or {}
                period = strip_markup(info.get("period", "")).replace(" Period", "") or next(
                    (c for c in page.get("categories", []) if c in ("Dawn", "Solar", "Baronial", "Curia", "Nocturnal")), None)
                tally = strip_markup(c[3])
                b = {"id": slug(title), "name": name, "principle": principle, "mystery": mystery,
                     "language": slug(lang[0][0]) if lang and slug(lang[0][0]) in skills else None,
                     "languageName": lang[0][0] if lang else None,
                     "type": strip_markup(c[4]), "period": period,
                     "lesson": lesson, "memory": mem[0][0] if mem else None,
                     "tally": int(tally) if tally.isdigit() else None,
                     "multitudinous": "Multitudinous" in page.get("categories", []),
                     "description": quote(page.get("text"))}
                b["reading"], b["read"] = read_texts(page.get("text"))
                if not b["reading"] or not b["read"] or b["reading"] == b["read"]:
                    warn(f"book {title}: reading texts not found")
                books[b["id"]] = b
    return books

# ---------------------------------------------------------------- items
ASPECT_FIX = {"reels of film": "Reel of Film", "tools": "Tool", "sound (aspect)": "Sound", "elements of the soul": "Soul",
              "element of the soul": "Soul", "co-operative": "Co-operative", "co-operative ": "Co-operative",
              "memory#weather": "Weather", "things": "Thing", "beverages": "Beverage", "inks": "Ink",
              "books": "Readable", "candles": "Candle", "comforts": "Comfort", "memories": "Memory",
              "pigments": "Pigment", "materials": "Material", "liquids": "Liquid"}

def aspect_name(target, disp):
    t = target.strip()
    if t.lower().startswith("memories that can evolve"):
        return disp
    if t.lower() in ASPECT_FIX:
        return ASPECT_FIX[t.lower()]
    t = t.split("#")[0] if not t.lower().startswith("memory#") else t
    t = re.sub(r"\s*\(Aspect\)", "", t)
    return t[:1].upper() + t[1:]

def build_items():
    items = {}
    for title, p in PAGES.items():
        text = p["text"]
        cats = p["categories"]
        info = template(text, {"boh item"})
        kind = "item"
        if info is None:
            info = template(text, {"boh memory"})
            kind = "memory"
        if info is None:
            continue
        principles = lore(info.get("principles", ""))
        raw_aspects = info.get("type", "") + " " + info.get("aspects", "")
        aspects = []
        for t, d in links(raw_aspects):
            a = aspect_name(t, d)
            if a and a not in aspects:
                aspects.append(a)
        if kind == "memory" and "Memory" not in aspects:
            aspects.insert(0, "Memory")
        for c in cats:  # categories add aspects the infobox omitted
            if c in ("Tool", "Ink", "Memory", "Persistent", "Beverage", "Liquid", "Material", "Comfort",
                     "Wall Art", "Candle", "Pigment", "Weather", "Sound", "Omen", "Lens", "Device", "Numen",
                     "Remains", "Flower", "Leaf", "Fuel", "Light", "Glass", "Metal", "Woven", "Wood",
                     "Made of Wood", "Sustenance", "Restorative", "Mark", "Co-operative", "Beast", "Blank",
                     "Root", "Kitchenware", "Knife", "Fabric and Fibre", "Gem", "Readable") and c not in aspects:
                aspects.append(c)
        if "Readable" in aspects and "Blank" not in aspects:
            continue  # books are a separate table
        gm = re.search(r"Generates?\s+(?:an?\s+|the\s+)?\[\[([^\]|]+)", text)
        sources = []
        for t, d in links(info.get("location", "") + " " + info.get("obtained_by", "")):
            if d not in sources and t not in ("Hush House", "Cache"):
                sources.append(d)
        items[slug(title)] = {"id": slug(title), "name": title, "icon": has_icon("item", slug(title)), "principles": principles, "aspects": aspects,
                              "yieldsMemory": gm.group(1) if gm else None,
                              "considerDestroys": bool(gm and re.match(r"[^.\n]*destroys", text[gm.end():gm.end() + 80])),
                              "sources": sources[:8],
                              "craftable": "Crafting" in cats, "description": quote(text)}
    return items

# ---------------------------------------------------------------- workstations
KINDS = ["Desk", "Shrine", "Instrument", "Bed", "Fireplace"]
# Slots as the owner sees them in the game, where the wiki's list is wrong. The Barber's Chair takes an Element
# of the Soul ("Regret") and a Memory ("Recall"); its wiki page lists Liquid and Fuel for the fifth slot.
OWNER_SLOTS = {"barbers-chair": [["Soul"], ["Memory"]]}

def slot_accepts(s):
    s = re.split(r"Forbidden|\(not |\(Will not|Will not accept", s)[0]
    out = []
    for t, d in links(s):
        if "#fatigue" in t.lower() or "#maladies" in t.lower():
            continue
        a = aspect_name(t, d)
        if a not in out:
            out.append(a)
    return out

def build_workstations():
    ws = {}
    for title, p in PAGES.items():
        if "Workstation" not in p["categories"] or "Gathering" in p["categories"] or title in SEA_STATIONS:
            continue   # gathering stations go to foraging.json
        info = template(p["text"], {"workstation"})
        if not info:
            continue
        principles = lore_list(info.get("principles", ""))
        kind = next((k for k in KINDS if k in p["categories"]), None)
        if kind is None:
            low = title.lower()
            kind = ("Workbench" if "workbench" in low else "Prospect" if "prospect" in low
                    else "Kitchen Range" if "range" in low or "stove" in low else "Other")
        s4, s5 = slot_accepts(info.get("fourth_slot_aspects", "")), slot_accepts(info.get("fifth_slot_aspects", ""))
        ev = [slug(t) for t, _ in links(info.get("evolve_via", ""))]
        ev = ["the-bosk" if e == "bosk" else e for e in ev if e in WISDOMS or e == "bosk"]
        room = links(info.get("location", ""))
        ws[slug(title)] = {"id": slug(title), "name": title, "kind": kind,
                           "room": room[0][1] if room else None, "principles": principles,
                           "slots": OWNER_SLOTS.get(slug(title), [s for s in (s4, s5) if s]), "evolveVia": ev,
                           "canCraft": kind not in ("Bed", "Fireplace") and bool(principles),
                           "description": quote(p["text"])}
    return ws

# ---------------------------------------------------------------- recipes
def build_recipes(skills, items):
    recipes = []
    text = PAGES["Crafting"]["text"]
    parts = re.split(r"\n===\s*<big>\{\{Lore\|([A-Za-z]+)\}\}</big>\s*===?", text)
    for i in range(1, len(parts), 2):
        principle = parts[i].lower()
        for before, caption, rows in tables(parts[i + 1]):
            tm = re.search(r"(Prentice|Scholar|Keeper)", caption)
            if not tm:
                continue
            tier = tm.group(1).lower()
            for r in rows:
                c = r["cells"]
                if r["header"] or len(c) < 6:
                    continue
                lk = links(c[0])
                if not lk:
                    continue
                result = lk[0][0]
                sk = [slug(t) for t, _ in links(c[1])]
                bad = [s for s in sk if s not in skills]
                if bad:
                    warn(f"recipe {result}: unknown skills {bad}")
                sk = [s for s in sk if s in skills]
                names = lore_list(c[2])
                vals = [int(v) for v in re.findall(r"\d+", strip_markup(c[3]))]
                req_links = links(c[5])
                req = None
                if req_links:
                    t, d = req_links[0]
                    if slug(t) in items and tier != "scholar":
                        req = {"item": slug(t), "label": t}
                    elif slug(t) in items and aspect_name(t, d) not in ALL_ASPECTS:
                        req = {"item": slug(t), "label": t}
                    else:
                        req = {"aspect": aspect_name(t, d), "label": aspect_name(t, d)}
                    if len(req_links) > 1:
                        req["note"] = strip_markup(c[5])
                rid = f"{slug(result)}--{principle}-{tier}"
                n = sum(1 for x in recipes if x["id"].split("~")[0] == rid)
                if n:
                    rid += f"~{n + 1}"
                recipes.append({"id": rid, "result": slug(result), "resultName": result, "principle": principle,
                                "tier": tier, "skills": sk,
                                "resultPrinciples": dict(zip(names, vals)) if len(names) == len(vals) else {},
                                "resultAspects": [aspect_name(t, d) for t, d in links(c[4])],
                                "ingredient": req})
                if slug(result) not in items:
                    warn(f"recipe result {result} has no item page")
    return recipes

ALL_ASPECTS = set()
ICON_DIR = os.path.join(ROOT, "public", "icons")

def has_icon(group, id_):
    return os.path.exists(os.path.join(ICON_DIR, f"{group}-{id_}.webp"))

# ---------------------------------------------------------------- rooms
OWNER_PREREQUISITES = {"rowenarium-room": ["upper-pump-room"]}   # the Locations table says Lower Pump Room
# Principles a room needs on top of one of `requires`. The Stair Tenebrous page lists Edge as one more
# alternative; the owner confirmed the Locations table's reading: Edge 3 and 3 of one of the others.
OWNER_REQUIRES_ALSO = {"stair-tenebrous": ["edge"]}
VILLAGE_PLACES = ["Brancrug Village", "Mrs and Mr Kille", "The Rectory", "The Smithy", "The Sweet Bones", "Post Office",
                  "The Atlantic Ocean"]

def build_rooms(items, ws):
    rooms = {}
    for title, p in PAGES.items():
        info = template(p["text"], {"boh room"})
        if not info:
            continue
        text = p["text"]
        req_raw = info.get("required_aspects", "")
        requires = lore(req_raw)
        # what is placed on the locked room: a helper (Assistance), a card with some aspect, a named thing, or
        # a Circumstance card produced elsewhere
        targets = [t for t, _ in links(req_raw) if t.lower() not in PRINCIPLES and not t.startswith("Winter (")]
        opener, opener_name, forbids = "Assistance", None, None
        if any(t in ("Assistance", "Assistants") for t in targets) or not targets:
            pass
        elif "Circumstance" in targets:
            cm = re.search(r"\[\[Circumstance\]\]\s*\(\[\[([^\]|]+)", text)
            opener, opener_name = "Circumstance", cm.group(1) if cm else None
        elif aspect_name(targets[0], targets[0]) in ALL_ASPECTS:
            opener = aspect_name(targets[0], targets[0])
            forbids = aspect_name(targets[1], targets[1]) if len(targets) > 1 and "without" in req_raw else None
        else:
            opener, opener_name = "Item", targets[0]
        req_items = [opener_name] if opener == "Item" else []
        lm = re.search(r"==\s*([^=\n]+?)\s*\(Locked\)\s*==", text)
        exposes = []
        em = re.search(r"Opening (?:it|them|the [^\[\n]*?) (?:will )?(?:also )?exposes?:?(.*?)(?:\n==|\Z)", text, flags=re.S)
        if em:
            block = em.group(1)
            first_blank = re.search(r"\n\s*\n(?!\*)", block)
            if first_blank:
                block = block[:first_blank.start()]
            exposes = [slug(t) for t, _ in links(block)]
        cm = re.search(r"\n==\s*Contents\s*==(.*?)(?:\n==[^=]|\Z)", text, flags=re.S)
        contents = []
        if cm:
            visible = cm.group(1).split("{{Spoilers")[0]   # hidden items are not lying in plain sight
            for t, _ in links(visible):
                if slug(t) in items and slug(t) not in contents:
                    contents.append(slug(t))
        stations = [slug(t) for t, _ in links(info.get("workstations", "")) if slug(t) in ws]
        era = strip_markup(info.get("era", "")).replace(" Period", "") or None
        also = {p: requires.pop(p) for p in OWNER_REQUIRES_ALSO.get(slug(title), [])}
        rooms[slug(title)] = {"id": slug(title), "name": title, "lockedName": lm.group(1).strip() if lm else None,
                              "era": era, "requires": requires, "requiresAlso": also, "requiresItems": req_items,
                              "needsAssistance": opener == "Assistance", "opener": opener,
                              "openerName": opener_name, "openerForbids": forbids, "exposes": exposes,
                              "contents": contents, "workstations": stations, "description": quote(text)}
    # the village, its shops and the ocean open during the introductory story, not through the house
    for name in VILLAGE_PLACES:
        rooms.pop(slug(name), None)
    # a link such as [[Rowenarium]] can mean the page "Rowenarium (Room)"
    resolve = lambda e: e if e in rooms else e + "-room"
    for r in rooms.values():
        r["exposes"] = [resolve(e) for e in r["exposes"] if resolve(e) in rooms and resolve(e) != r["id"]]
    for r in rooms.values():
        r["openedFrom"] = sorted(o["id"] for o in rooms.values() if r["id"] in o["exposes"])
    # second source: the "Prerequisite Location" column of the Locations page; the two sources are merged
    norm = lambda n: slug(n.replace("St. ", "St ").replace("Servant's", "Servants'"))
    by_locked = {slug(r["lockedName"]): r["id"] for r in rooms.values() if r["lockedName"]}
    find = lambda n: next((i for i in (norm(n), norm(n) + "-room", by_locked.get(norm(n))) if i in rooms), None)
    def link(pre, rid):
        if pre != rid and pre not in rooms[rid]["openedFrom"]:
            rooms[rid]["openedFrom"] = sorted(rooms[rid]["openedFrom"] + [pre])
            rooms[pre]["exposes"].append(rid)
    for before, caption, rows in tables(PAGES["Locations"]["text"]):
        head = [strip_markup(c) for c in rows[0]["cells"]] if rows else []
        if "Prerequisite Location" not in head:
            continue
        ci = head.index("Prerequisite Location")
        for row in rows[1:]:
            c = row["cells"]
            lk = links(c[0]) if c else []
            rid = find(lk[0][0]) if lk and len(c) > ci else None
            if not rid or rid in OWNER_PREREQUISITES:
                continue
            for n in re.split(r"\bor\b|\n|,", strip_markup(c[ci])):
                if not n.strip():
                    continue
                if find(n.strip()):
                    link(find(n.strip()), rid)
                else:
                    warn(f"room {rid}: unknown prerequisite {n.strip()!r}")
    # where the owner has confirmed a prerequisite, it replaces what the wiki says (see docs/DESIGN.md)
    for rid, pres in OWNER_PREREQUISITES.items():
        for o in rooms.values():
            o["exposes"] = [e for e in o["exposes"] if e != rid]
        rooms[rid]["openedFrom"] = []
        for pre in pres:
            link(pre, rid)
    return rooms

# ---------------------------------------------------------------- assistants
def build_assistants():
    out = []
    text = PAGES["Assistants"]["text"]
    kinds = [("Villagers", "Villager"), ("Seasonal Workers", "Seasonal worker"), ("Unusual Helpers", "Unusual helper")]
    for heading, kind in kinds:
        m = re.search(r"==\s*" + heading + r"\s*==(.*?)(?:\n==[^=]|\Z)", text, flags=re.S)
        if not m:
            warn("assistants: no section " + heading); continue
        for before, caption, rows in tables(m.group(1)):
            head = [strip_markup(c) for c in rows[0]["cells"]]
            for r in rows[1:]:
                c = dict(zip(head, r["cells"]))
                name = links(c.get("Assistant", ""))
                if not name:
                    continue
                uniq = links(c.get("Unique Collaboration", ""))
                unique = aspect_name(*uniq[0]) if uniq else None
                unique = {"Fabric": "Fabric and Fibre"}.get(unique, unique)
                out.append({"id": slug(name[0][0]), "name": name[0][0], "kind": kind,
                            "season": strip_markup(c.get("Season", "")) or None,
                            "principles": lore(c.get("Principles", "")), "unique": unique,
                            "hire": strip_markup(re.sub(r"\{\{Lore\|(\w+)[^}]*\}\}", r"\1", c.get("To Hire", ""))) or None,
                            "fee": 24 if kind == "Unusual helper" else 12})
    return out

# ---------------------------------------------------------------- caches
def build_caches(items):
    """Things that are opened (Considered) for one of several things: every page in the Cache category."""
    titles = [t for t, p in PAGES.items() if "Cache" in p["categories"] and "Cut Content" not in p["categories"]
              and template(p["text"], {"boh item"})]
    ids = {slug(t) for t in titles}
    # where each comes from: the list on the Cache page, repeatable ways in bold
    found = {}
    for before, caption, rows in tables(PAGES["Cache"]["text"]):
        for r in rows:
            c = r["cells"]
            if r["header"] or len(c) < 2 or not links(c[0]):
                continue
            ways = []
            for part in re.split(r"<br\s*/?>", re.split(r"\n\s*\|\|", c[1])[0]):   # one row breaks its cells over two lines
                if links(part):
                    note = re.search(r"<small>\((.*?)\)</small>", part)
                    ways.append({"name": links(part)[0][1] + (f" ({note.group(1)})" if note else ""), "repeatable": "'''" in part})
            found[slug(links(c[0])[0][0])] = ways
    out = []
    for title in sorted(titles):
        text = PAGES[title]["text"]
        info = template(text, {"boh item"})
        body = re.split(r"\n==\s*Trivia|\[\[Category:", text[text.find("onsider"):])[0]
        lead, _, rest = body.partition("\n*")
        drops = []
        for line in ("*" + rest).split("\n"):
            lk = links(line) if line.startswith("*") else []
            if not lk:
                continue
            many = re.search(r"\((\d+)/\d+\)|\((\d+) chances\)|\(x(\d+)\)", line)
            target = lk[0][0] if lk[0][0] != "Tally" else lk[0][1]
            drops.append({"item": slug(target) if slug(target) in items else None,
                          "cache": slug(target) if slug(target) in ids else None,
                          "name": re.sub(r"\s+", " ", lk[0][1]), "weight": int(next(g for g in many.groups() if g)) if many else 1})
        total = sum(d["weight"] for d in drops)
        for d in drops:
            d["chance"] = round(100 * d.pop("weight") / total, 1) if total else None
        also = re.search(r"(?:provides|Convert this to) \[\[([^\]|]+)\]\] and one of", lead)
        shared = re.search(r"deck for this cache is shared with ([^.]*)\.", body)
        if not drops:
            warn(f"cache {title}: nothing inside")
        out.append({"id": slug(title), "name": title, "icon": has_icon("item", slug(title)),
                    "principles": lore(info.get("principles", "")), "description": quote(text),
                    "sources": found.get(slug(title), []),
                    "alsoGives": also.group(1) if also else None,
                    "sharedWith": [t for t, _ in links(shared.group(1))] if shared else [], "drops": drops})
    return out

# ---------------------------------------------------------------- foraging
SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter", "Numa"]
CACHE_IDS = set()
SEA_STATIONS = ["Sea's Edge", "Brancrug Boathouse"]   # swimming and renouncing a penny; discarding things is left out

def deck(key, items):
    """A seasonal deck from the Decks page: [{item, name, chance: {season: percent}}]."""
    m = re.search(r'<section begin="?%s"?\s*/>(.*?)<section end="?%s"?\s*/>' % (key, key), PAGES["Decks"]["text"], flags=re.S)
    drops = []
    for before, caption, rows in tables(m.group(1) if m else ""):
        for r in rows:
            c = r["cells"]
            lk = links(c[0]) if c else []
            if r["header"] or not lk or len(c) < 6:
                continue
            chance = {}
            for season, cell in zip(SEASON_NAMES, c[1:6]):
                pm = re.search(r"(\d+)\s*%", cell)
                if pm:
                    chance[season] = int(pm.group(1))
            drops.append({"item": slug(lk[0][0]) if slug(lk[0][0]) in items else None, "name": lk[0][1], "chance": chance})
            if slug(lk[0][0]) in CACHE_IDS:
                drops[-1]["cache"] = slug(lk[0][0])
    if not drops:
        warn(f"foraging: no deck {key}")
    return drops

def build_foraging(items, rooms, caches):
    out = []
    room_id = lambda name: next((i for i in (slug(name.replace("St. ", "St ")),) if i in rooms), None)
    def station(name, place, principles, drops, count=1, skill=True, note=None, elements=None, needs=None):
        # rule from the Gathering page: a station whose only Principle is Nectar takes a Heart Element and a
        # Nectar Skill; any other takes an Element and a Skill sharing one of its Principles
        soul = ["heart"] if principles in (["nectar"], []) else principles
        n = sum(1 for f in out if f["id"].split("~")[0] == slug(f"{name} {place}"))
        out.append({"id": slug(f"{name} {place}") + (f"~{n + 1}" if n else ""), "name": name, "place": place,
                    "room": room_id(place), "count": count, "principles": principles,
                    "soulPrinciples": [] if elements is not None else soul, "soulElements": elements,
                    "skillPrinciples": principles if skill else [], "needs": needs, "drops": drops, "note": note})
    item = lambda title: slug(title) if slug(title) in items else None
    regular = SEASON_NAMES[:4]
    # named stations: the list on the Gathering page, each with a deck on its own page
    for before, caption, rows in tables(PAGES["Gathering"]["text"]):
        for r in rows:
            c = r["cells"]
            lk = links(c[0]) if c else []
            if r["header"] or not lk or len(c) < 4:
                continue      # the Garden rows carry no link; they come from the Garden page below
            title = lk[0][0]
            page = PAGES.get(title, {}).get("text", "")
            place = links(c[2])[0][0] if links(c[2]) else None
            dm = re.search(r"\{\{#lst:Decks\|([^}|]+)\}\}", page)
            if dm:
                station(title, place, lore_list(c[1]), deck(dm.group(1).strip(), items), note=strip_markup(c[3]))
            elif title == "Hush House Well":
                wm = re.search(r"Draw \[\[([^\]|]+)\]\], or \[\[([^\]|]+)\]\] during \[\[Numa\]\]", page)
                if not wm:
                    warn("foraging: well outcomes not found"); continue
                usual, numa = wm.group(1), wm.group(2)
                station(title, place, [], [
                    {"item": slug(usual) if slug(usual) in items else None, "name": usual, "chance": {x: 100 for x in SEASON_NAMES[:4]}},
                    {"item": slug(numa) if slug(numa) in items else None, "name": numa, "chance": {"Numa": 100}}],
                    skill=False, note=strip_markup(c[3]))
            else:
                warn(f"foraging: no deck for {title}")
    # gardens: one row per kind of patch on the Garden page, a fixed yield per season
    for before, caption, rows in tables(PAGES["Garden"]["text"]):
        head = [strip_markup(c) for c in rows[0]["cells"]] if rows else []
        if head[:2] != ["Garden", "Count"]:
            continue
        for r in rows[1:]:
            c = r["cells"]
            if len(c) < 7 or "chance" in " ".join(c):
                continue      # the Beehive row repeats the deck above
            drops = {}
            for season, cell in zip(SEASON_NAMES, c[2:7]):
                for target, disp in links(cell):
                    many = re.search(r"\(x(\d+)\)", cell)
                    name = disp + (f" ×{many.group(1)}" if many else "")
                    d = drops.setdefault(name, {"item": slug(target) if slug(target) in items else None, "name": name, "chance": {}})
                    d["chance"][season] = 100
            kinds = list(dict.fromkeys(re.sub(r" ×\d+$", "", n) for n in drops))
            station("Garden: " + ", ".join(kinds), links(c[0])[0][0], ["nectar"], list(drops.values()),
                    count=int(strip_markup(c[1]) or 1))
    # the sea: swim with Health for a memory, or renounce a penny for another
    for title in SEA_STATIONS:
        page = PAGES[title]["text"]
        place = links(template(page, {"workstation"}).get("location", ""))[0][0]
        sm = re.search(r"\* Swim here with a \[\[Health\]\] card to obtain \[\[([^\]|]+)\]\] \((additionally get )?\[\[([^\]|]+)\]\] in Numa( instead)?\)", page)
        if sm:
            # In Numa the second memory replaces the first. The Sea's Edge page says "additionally"; the owner
            # confirmed "instead", as the Boathouse page has it (see docs/DESIGN.md).
            both = False
            drops = [{"item": item(sm.group(1)), "name": sm.group(1), "chance": {x: 100 for x in (SEASON_NAMES if both else regular)}},
                     {"item": item(sm.group(3)), "name": sm.group(3), "chance": {"Numa": 100}}]
            tm = re.search(r"Dry yourself off with a \[\[([^\]|]+)\]\]( \(not possible in Numa\))?,? to obtain \[\[([^\]|]+)\]\]", page)
            if tm:
                # towels cannot be used in Numa (owner's rule; only the Sea's Edge page says so)
                drops.append({"item": item(tm.group(3)), "name": tm.group(3), "with": tm.group(1),
                              "chance": {x: 100 for x in regular}})
            nm = re.search(r"\n(You cannot swim[^\n]*)", page)
            station(f"{title}: swim", place, [], drops, skill=False, elements=["health"], note=strip_markup(nm.group(1)) if nm else None)
        else:
            warn(f"foraging: no swimming at {title}")
        pm = re.search(r"\* Renounce one \[\[[^\]]*Penny\]\] to obtain \[\[([^\]|]+)\]\] \(\[\[([^\]|]+)\]\] in \[\[Numa\]\] instead\)", page)
        if pm:
            station(f"{title}: renounce a penny", place, [], [
                {"item": item(pm.group(1)), "name": pm.group(1), "chance": {x: 100 for x in regular}},
                {"item": item(pm.group(2)), "name": pm.group(2), "chance": {"Numa": 100}}], skill=False, elements=[], needs="Penny")
    for f in out:
        if f["place"] and not f["room"] and f["place"] != "Brancrug Village":
            warn(f"foraging: unknown place {f['place']}")
    return out

def main():
    skills = build_skills()
    books = build_books(skills)
    items = build_items()
    for it in items.values():
        ALL_ASPECTS.update(it["aspects"])
    ws = build_workstations()
    recipes = build_recipes(skills, items)
    # item scope: yields a memory, is a memory, fits some workstation slot, or is used by a recipe
    slot_aspects = {"Memory", "Tool", "Ink"}
    for w in ws.values():
        for s in w["slots"]:
            slot_aspects.update(s)
    used = {r["result"] for r in recipes} | {r["ingredient"]["item"] for r in recipes if r["ingredient"] and "item" in r["ingredient"]}
    scoped = {k: v for k, v in items.items()
              if v["yieldsMemory"] or k in used or (set(v["aspects"]) & slot_aspects)}
    os.makedirs(OUT, exist_ok=True)
    def dump(name, data):
        with open(os.path.join(OUT, name + ".json"), "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
    dump("skills", sorted(skills.values(), key=lambda s: s["name"]))
    dump("books", sorted(books.values(), key=lambda s: s["name"]))
    dump("items", sorted(scoped.values(), key=lambda s: s["name"]))
    dump("workstations", sorted(ws.values(), key=lambda s: s["name"]))
    dump("recipes", recipes)
    rooms = build_rooms(scoped, ws)
    assistants = build_assistants()
    for a in assistants:
        a["icon"] = has_icon("person", a["id"])
    dump("rooms", sorted(rooms.values(), key=lambda r: r["name"]))
    caches = build_caches(scoped)
    CACHE_IDS.update(c["id"] for c in caches)
    dump("caches", caches)
    foraging = build_foraging(scoped, rooms, caches)
    dump("foraging", foraging)
    dump("assistants", assistants)
    dump("manifest", {"dataVersion": RAW["crawled"], "source": "https://book-of-hours.fandom.com",
                      "license": "CC BY-SA", "counts": {"skills": len(skills), "books": len(books),
                      "items": len(scoped), "workstations": len(ws), "recipes": len(recipes), "rooms": len(rooms),
                      "assistants": len(assistants), "foraging": len(foraging), "caches": len(caches)}})
    print(json.dumps({"skills": len(skills), "languages": sum(s["isLanguage"] for s in skills.values()),
                      "books": len(books), "items_all": len(items), "items": len(scoped),
                      "workstations": len(ws), "recipes": len(recipes), "rooms": len(rooms), "assistants": len(assistants),
                      "foraging": len(foraging), "caches": len(caches), "warnings": len(WARN)}))
    for w in WARN:
        print("WARN", w, file=sys.stderr)

if __name__ == "__main__":
    main()
