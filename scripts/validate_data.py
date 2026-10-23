#!/usr/bin/env python3
"""Validate the extracted rules data in data/.

Checks that every JSON file parses; that entries have their required fields;
that ids are unique; that references to powers, qualities, categories, and
approaches resolve; that option references are well formed; that abilities
have a name, type, and text; that choice counts don't exceed their options;
and that dice, page numbers, roll tables, and Health tables are well formed.

Usage: python3 scripts/validate_data.py   (exits non-zero on any error)
Set SCRPG_DATA to validate a different data directory.
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("SCRPG_DATA", ROOT / "data"))

DICE = {"d4", "d6", "d8", "d10", "d12"}
ABILITY_TYPES = {"A", "R", "I", "A/I"}
PRINCIPLE_CATEGORIES = {"esoteric", "expertise", "ideals", "identity", "responsibility"}
REF_KEYS = {"power", "quality", "powerCategory", "qualityCategory"}
# Keys allowed alongside a reference key inside an option-reference dict.
REF_EXTRA_KEYS = {"dieCount"}
RULES = {"differentPowers", "differentQualities", "differentPowersOrQualities"}
WORD_COUNTS = {"one", "oneOrMore", "any", "atLeastTwo", "remaining"}
DIE_LIST_KEYS = {"dice", "powerDice", "qualityDice", "powerSourceDice", "archetypeDice",
                 "personalityDice", "startingDice"}
SINGLE_DIE_KEYS = {"die", "fallbackDie", "startingDie", "fillerPowerDie"}
OPTION_LIST_KEYS = {"options", "powerOptions", "required", "suggestedPowers",
                    "suggestedQualities", "extraOptions"}
MAX_PAGE = 450  # the Core Rules has fewer printed pages than this
BASIC_ACTIONS = {"attack", "defend", "boost", "hinder", "overcome"}
IF_ALREADY_HAVE = {"skip", "swap", "addDifferentFromCategory"}
ZONES = {"green", "yellow", "red"}
# Printed page span of the book section each file was extracted from. Catches
# PDF page indexes (printed + 8) and other stray page numbers.
PAGE_SPANS = {
    "heroes/powers-qualities.json": (47, 121),
    "heroes/backgrounds.json": (48, 54),
    "heroes/power-sources.json": (56, 70),
    "heroes/archetypes.json": (72, 98),
    "heroes/personalities.json": (100, 121),
    "heroes/red-abilities.json": (106, 111),
    "heroes/retcons.json": (112, 112),
    "heroes/health.json": (113, 113),
    "heroes/principles.json": (122, 141),
    "villains/approaches.json": (121, 219),
    "villains/archetypes.json": (220, 234),
    "villains/upgrades.json": (235, 238),
    "villains/health.json": (239, 239),
    "minions/minions.json": (186, 207),
    "environments/environments.json": (157, 245),
}

errors = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def load(rel):
    try:
        with open(DATA / rel, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        err(rel, f"cannot load: {e}")
        return None


def walk(node, where, fn):
    """Call fn(node, where) for every object in a JSON tree."""
    if isinstance(node, dict):
        fn(node, where)
        for k, v in node.items():
            walk(v, f"{where}.{k}", fn)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            walk(v, f"{where}[{i}]", fn)


def require(obj, keys, where):
    """Report each missing or empty key. Returns True if all are present."""
    ok = True
    for k in keys:
        v = obj.get(k) if isinstance(obj, dict) else None
        if v is None or v == "" or v == [] or v == {}:
            err(where, f"missing '{k}'")
            ok = False
    return ok


def items(doc, key, where):
    """Return doc[key] as a list, reporting an error if it isn't a non-empty list."""
    value = doc.get(key) if isinstance(doc, dict) else None
    if not isinstance(value, list) or not value:
        err(where, f"missing list '{key}'")
        return []
    return [v for v in value if isinstance(v, dict)]


def check_entries(entries, where, required):
    """Common checks for a list of top-level entries (backgrounds, archetypes, ...)."""
    seen = set()
    for e in entries:
        ew = f"{where}[{e.get('id', '?')}]"
        require(e, ["id", "name"] + required, ew)
        if "page" not in e and "pages" not in e:
            err(ew, "missing 'page'")
        if e.get("id") in seen:
            err(where, f"duplicate id '{e.get('id')}'")
        seen.add(e.get("id"))


def check_rolls(entries, where):
    rolls = sorted(e["roll"] for e in entries if isinstance(e.get("roll"), int))
    if rolls != list(range(1, 21)):
        err(where, f"expected rolls 1-20, got {rolls}")


def is_ability(node):
    return "name" in node and ("text" in node or "type" in node) and not ({"id", "page"} & node.keys())


def is_ref(node):
    return bool(REF_KEYS & node.keys())


def check_node(node, where, known, approaches, span):
    """Checks applied to every object in every file."""
    keys = node.keys()

    # Enumerated values.
    for a in node.get("cannot", []):
        if a not in BASIC_ACTIONS:
            err(where, f"unknown basic action '{a}' in 'cannot'")
    for v in node.get("ifAlreadyHave", []):
        if v not in IF_ALREADY_HAVE:
            err(where, f"unknown ifAlreadyHave option '{v}'")
    for z in node.get("zones", []) if isinstance(node.get("zones"), list) else []:
        if z not in ZONES:
            err(where, f"unknown zone '{z}'")

    # Option references: exactly one reference key, resolving to a known id.
    if is_ref(node) and not is_ability(node):
        ref_keys = REF_KEYS & keys
        if len(ref_keys) > 1:
            err(where, f"option reference has more than one key: {sorted(ref_keys)}")
        elif not keys - REF_KEYS - REF_EXTRA_KEYS:
            k = next(iter(ref_keys))
            if node[k] not in known[k]:
                err(where, f"unknown {k} '{node[k]}'")

    # Lists of option references must contain only references (catches typo'd keys).
    for k in OPTION_LIST_KEYS & keys:
        v = node[k]
        if isinstance(v, list):
            for i, o in enumerate(v):
                if isinstance(o, dict) and not is_ability(o) and "id" not in o and not is_ref(o):
                    err(f"{where}.{k}[{i}]", f"not an option reference (expected one of {sorted(REF_KEYS)}): {sorted(o)}")

    # Abilities: anything with a name plus text or type must have all three, valid.
    if is_ability(node):
        if require(node, ["name", "type", "text"], where) and node["type"] not in ABILITY_TYPES:
            err(where, f"bad ability type '{node['type']}'")
        req = node.get("requires")
        if req is not None:
            if not (isinstance(req, dict) and len(REF_KEYS & req.keys()) == 1):
                err(where, "'requires' must be a single option reference")
            else:
                k = next(iter(REF_KEYS & req.keys()))
                if req[k] not in known[k]:
                    err(where, f"requires unknown {k} '{req[k]}'")

    # Choice blocks: count must be valid and not exceed the options offered.
    if "count" in keys and isinstance(node.get("options"), list):
        count = node["count"]
        if isinstance(count, int):
            if count > len(node["options"]):
                err(where, f"count {count} exceeds {len(node['options'])} options")
        elif count not in WORD_COUNTS:
            err(where, f"bad count '{count}'")
    if "rule" in keys and node["rule"] not in RULES:
        err(where, f"unknown rule '{node['rule']}'")
    if node.get("fromGreenList") and "options" in keys:
        err(where, "fromGreenList blocks should not have their own options")

    # Dice.
    for k in SINGLE_DIE_KEYS & keys:
        if node[k] not in DICE:
            err(where, f"invalid {k} '{node[k]}'")
    for k in DIE_LIST_KEYS & keys:
        v = node[k]
        if isinstance(v, list):
            if not v:
                err(where, f"empty '{k}'")
            for d in v:
                if d not in DICE:
                    err(where, f"invalid die '{d}' in '{k}'")
        elif not (k == "dice" and v == "fromBackground"):
            err(where, f"'{k}' should be a list of dice")

    # Pages.
    lo, hi = span
    if "page" in keys and not (isinstance(node["page"], int) and lo <= node["page"] <= hi):
        err(where, f"page {node['page']!r} outside this file's span {lo}-{hi}")
    if "pages" in keys:
        v = node["pages"]
        if not (isinstance(v, list) and v and all(isinstance(p, int) and lo <= p <= hi for p in v)):
            err(where, f"pages {v!r} outside this file's span {lo}-{hi}")

    # Category and approach references.
    pc = node.get("principleCategory")
    if pc is not None and pc not in PRINCIPLE_CATEGORIES | {"fromSecondaryArchetype"}:
        err(where, f"unknown principle category '{pc}'")
    for a in node.get("suggestedApproaches", []):
        if a not in approaches:
            err(where, f"unknown approach '{a}'")


def check_heroes(docs):
    bg = docs.get("heroes/backgrounds.json")
    if bg:
        entries = items(bg, "backgrounds", "backgrounds")
        check_entries(entries, "backgrounds", ["roll", "qualities", "principleCategory", "powerSourceDice"])
        check_rolls(entries, "backgrounds")
        for e in entries:
            require(e.get("qualities"), ["dice", "options"], f"backgrounds[{e.get('id')}].qualities")

    ps = docs.get("heroes/power-sources.json")
    if ps:
        entries = items(ps, "powerSources", "powerSources")
        check_entries(entries, "powerSources", ["roll", "powers", "yellowAbilities", "archetypeDice"])
        check_rolls(entries, "powerSources")
        for e in entries:
            require(e.get("powers"), ["dice", "options"], f"powerSources[{e.get('id')}].powers")
            require(e.get("yellowAbilities"), ["count", "options"], f"powerSources[{e.get('id')}].yellowAbilities")

    ar = docs.get("heroes/archetypes.json")
    if ar:
        entries = items(ar, "archetypes", "archetypes")
        check_entries(entries, "archetypes", ["roll", "principleCategory", "personalityDice"])
        check_rolls(entries, "archetypes")
        for e in entries:
            ew = f"archetypes[{e.get('id')}]"
            if not e.get("complex"):
                require(e, ["powers", "qualities"], ew)
            if not any(k in e for k in ("greenAbilities", "fixedGreenAbilities", "transitionMethods")):
                err(ew, "has no Green abilities")

    pe = docs.get("heroes/personalities.json")
    if pe:
        entries = items(pe, "personalities", "personalities")
        check_entries(entries, "personalities", ["roll", "statusDice", "outAbility"])
        check_rolls(entries, "personalities")
        for e in entries:
            sd = e.get("statusDice")
            if not isinstance(sd, dict) or set(sd) != {"green", "yellow", "red"} or not set(sd.values()) <= DICE:
                err(f"personalities[{e.get('id')}]", f"statusDice must map green/yellow/red to dice, got {sd}")

    ra = docs.get("heroes/red-abilities.json")
    if ra:
        for i, c in enumerate(items(ra, "categories", "red-abilities")):
            cw = f"red-abilities.categories[{i}]"
            if len(REF_KEYS & c.keys()) != 1:
                err(cw, "needs exactly one category key")
            require(c, ["page", "abilities"], cw)

    rc = docs.get("heroes/retcons.json")
    if rc:
        for i, r in enumerate(items(rc, "retcons", "retcons")):
            require(r, ["id", "kind", "summary"], f"retcons[{i}]")

    pr = docs.get("heroes/principles.json")
    if pr:
        entries = items(pr, "principles", "principles")
        check_entries(entries, "principles", ["category", "roleplaying", "minorTwist", "majorTwist", "greenAbility"])
        for e in entries:
            if e.get("category") not in PRINCIPLE_CATEGORIES:
                err(f"principles[{e.get('id')}]", f"bad category '{e.get('category')}'")
        if len(entries) != 64:
            err("principles", f"expected 64 principles, got {len(entries)}")

    hh = docs.get("heroes/health.json")
    if hh:
        ranges = items(hh, "ranges", "heroes/health.json")
        maxes = [r.get("max") for r in ranges]
        if maxes != list(range(40, 16, -1)):
            err("heroes/health.json", f"ranges should cover 40 down to 17, got {maxes}")
        check_ranges(ranges, "heroes/health.json")


def check_ranges(ranges, where):
    for r in ranges:
        try:
            g, y, rd, mx = r["green"], r["yellow"], r["red"], r["max"]
            if not (g[0] == mx and g[0] >= g[1] and g[1] - 1 == y[0] and y[0] >= y[1]
                    and y[1] - 1 == rd[0] and rd[0] >= rd[1] == 1):
                err(where, f"ranges for max {mx} are not contiguous")
        except (KeyError, IndexError, TypeError) as e:
            err(where, f"malformed range row {r}: {e!r}")


def check_villains(docs):
    va = docs.get("villains/approaches.json")
    if va:
        entries = items(va, "approaches", "approaches")
        check_entries(entries, "approaches", ["number", "baseHealth", "powerDice", "qualityDice", "abilities"])
        for e in entries:
            if isinstance(e.get("baseHealth"), int) and e["baseHealth"] % 5:
                err(f"approaches[{e.get('id')}]", "baseHealth should be a multiple of 5")
            require(e.get("abilities"), ["count", "options"], f"approaches[{e.get('id')}].abilities")

    vr = docs.get("villains/archetypes.json")
    if vr:
        entries = items(vr, "archetypes", "villain archetypes")
        check_entries(entries, "villain archetypes", ["number", "status", "abilities", "suggestedApproaches"])
        for e in entries:
            ew = f"villain archetypes[{e.get('id')}]"
            hm = e.get("healthModifier")
            if not isinstance(hm, int):
                err(ew, "missing 'healthModifier'")
            elif hm % 5:
                err(ew, "healthModifier should be a multiple of 5")
            status = e.get("status") if isinstance(e.get("status"), dict) else {}
            if not status.get("basis"):
                err(ew, "status missing 'basis'")
            for t in status.get("tiers", []):
                if t.get("die") not in DICE:
                    err(ew, f"status tier has invalid die '{t.get('die')}'")
            for z, d in status.get("zones", {}).items():
                if d not in DICE:
                    err(ew, f"status zone {z} has invalid die '{d}'")

    vu = docs.get("villains/upgrades.json")
    if vu:
        entries = items(vu, "upgrades", "upgrades")
        check_entries(entries, "upgrades", ["number", "requirement"])
        for e in entries:
            h = e.get("health")
            if not isinstance(h, int):
                err(f"upgrades[{e.get('id')}]", "missing 'health'")
            elif h % 5:
                err(f"upgrades[{e.get('id')}]", "health should be a multiple of 5")

    vh = docs.get("villains/health.json")
    if vh:
        check_ranges(items(vh, "ranges", "villains/health.json"), "villains/health.json")


def main():
    files = sorted(p.relative_to(DATA).as_posix() for p in DATA.rglob("*.json"))
    docs = {rel: load(rel) for rel in files}

    pq = docs.get("heroes/powers-qualities.json")
    if not isinstance(pq, dict):
        err("heroes/powers-qualities.json", "missing; it is required to check references")
        return report(len(files))
    pcats = items(pq, "powerCategories", "powerCategories")
    qcats = items(pq, "qualityCategories", "qualityCategories")
    check_entries(pcats, "powerCategories", ["powers"])
    check_entries(qcats, "qualityCategories", ["qualities"])
    all_powers = [p for c in pcats for p in c.get("powers", []) if isinstance(p, dict)]
    all_qualities = [q for c in qcats for q in c.get("qualities", []) if isinstance(q, dict)]
    for label, entries in (("powers", all_powers), ("qualities", all_qualities)):
        seen = set()
        for e in entries:
            require(e, ["id", "name", "summary"], f"{label}[{e.get('id', '?')}]")
            if e.get("id") in seen:
                err(label, f"duplicate id '{e.get('id')}'")
            seen.add(e.get("id"))
    known = {
        "powerCategory": {c.get("id") for c in pcats},
        "qualityCategory": {c.get("id") for c in qcats},
        "power": {p.get("id") for p in all_powers},
        "quality": {q.get("id") for q in all_qualities},
    }
    va = docs.get("villains/approaches.json")
    approaches = {a.get("id") for a in va.get("approaches", []) if isinstance(a, dict)} if isinstance(va, dict) else set()

    for rel, doc in docs.items():
        if doc is not None:
            span = PAGE_SPANS.get(rel)
            if span is None:
                err(rel, "no page span registered in PAGE_SPANS")
                span = (1, MAX_PAGE)
            walk(doc, rel, lambda node, where, span=span: check_node(node, where, known, approaches, span))

    check_heroes(docs)
    check_villains(docs)
    report(len(files))


def report(count=0):
    if errors:
        print(f"{len(errors)} error(s):")
        for e in errors:
            print("  " + e)
        sys.exit(1)
    print(f"OK: {count} data files valid")


if __name__ == "__main__":
    main()
