#!/usr/bin/env python3
"""Validate the extracted rules data in data/.

Checks that every JSON file parses; that entries have their required fields;
that ids are unique; that references to powers, qualities, categories, and
approaches resolve; that option references are well formed; that abilities
have a name, type, and text; that choice counts don't exceed their options;
that every prose constraint has a machine-readable restriction and that
restriction keys are well formed; that every page reference names a book
from books.json; and that dice, page numbers, roll tables, and Health tables
are well formed.

Usage: python3 scripts/validate_data.py   (exits non-zero on any error)
Set SCRPG_DATA to validate a different data directory.
"""
import json
import re
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
                    "suggestedQualities", "extraOptions", "usesFrom", "uses"}
# Machine-readable restrictions on which power/quality the abilities in a choice block use.
USES_FROM = {"archetypeLists", "archetypePowerList"}
USES_KINDS = {"power", "quality"}
RESTRICTION_KEYS = {"rule", "usesFrom", "requireAtLeast", "minDifferentPowers", "differentFromGreen", "sameUsePattern"}
# Ability effects (game aid): the actions an ability produces and which roll sets each one.
ACTIONS = {"attack", "defend", "boost", "hinder", "overcome", "recover"}
EFFECT_USES = {"max", "mid", "min", "max+mid", "max+min", "mid+min", "max+mid+min", "single", "damage", "other"}
EFFECT_KEYS = {"actions", "use", "optional", "when", "doublesUse", "fromBlank"}
POOL_SINGLES = {"trait", "status", "redStatus"}
MAX_PAGE = 450  # fallback upper bound for files with no registered span
BASIC_ACTIONS = {"attack", "defend", "boost", "hinder", "overcome"}
IF_ALREADY_HAVE = {"skip", "swap", "addDifferentFromCategory"}
ZONES = {"green", "yellow", "red"}
PAGE_KEYS = {"page", "pages", "chartPage"}
BOOKS_FILE = "books.json"
COLORS_FILE = "colors.json"
# For each file, the printed page span of each book section it was extracted
# from. Catches PDF page indexes (printed + 8) and other stray page numbers.
PAGE_SPANS = {
    "heroes/powers-qualities.json": {"core-rules": (47, 121)},
    "heroes/backgrounds.json": {"core-rules": (48, 54)},
    "heroes/power-sources.json": {"core-rules": (56, 70)},
    "heroes/archetypes.json": {"core-rules": (72, 98)},
    "heroes/personalities.json": {"core-rules": (100, 121)},
    "heroes/red-abilities.json": {"core-rules": (106, 111)},
    "heroes/retcons.json": {"core-rules": (112, 112)},
    "heroes/health.json": {"core-rules": (113, 113)},
    "heroes/principles.json": {"core-rules": (122, 141)},
    "villains/approaches.json": {"core-rules": (121, 219)},
    "villains/archetypes.json": {"core-rules": (220, 234)},
    "villains/upgrades.json": {"core-rules": (235, 238)},
    "villains/health.json": {"core-rules": (239, 239)},
    "minions/minions.json": {"core-rules": (186, 207)},
    "environments/environments.json": {"core-rules": (157, 245)},
    "scenes/trackers.json": {"core-rules": (1, MAX_PAGE)},
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


def check_node(node, where, known, approaches, books, spans):
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
        # Every hero and villain ability lists its effects (an empty list for one that produces none).
        if "effects" in node or where.startswith(("heroes/", "villains/")):
            check_effects(node.get("effects"), f"{where}.effects")
        if "pool" in node:
            check_pool(node["pool"], f"{where}.pool")
        check_pool_uses(node.get("effects"), node.get("pool"), where)
        if "makesMinions" in node and (node["makesMinions"] is not True or not where.startswith("villains/")):
            err(where, "'makesMinions' must be true, and only on villain abilities")
        if "saveBonus" in node:
            b = node["saveBonus"]
            if not (isinstance(b, int) and not isinstance(b, bool) and b > 0) or not where.startswith("villains/"):
                err(where, "'saveBonus' must be a positive whole number, and only on villain abilities")
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
        if is_int(count):
            if count > len(node["options"]):
                err(where, f"count {count} exceeds {len(node['options'])} options")
        elif count not in WORD_COUNTS:
            err(where, f"bad count '{count}'")
    if "rule" in keys and node["rule"] not in RULES:
        err(where, f"unknown rule '{node['rule']}'")
    if node.get("fromGreenList") and "options" in keys:
        err(where, "fromGreenList blocks should not have their own options")
    check_restrictions(node, where)

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

    # Pages: every page reference names its book, and falls in that book's span for this file.
    if PAGE_KEYS & keys:
        book = node.get("book")
        if book not in books:
            err(where, f"page reference needs a 'book' from {BOOKS_FILE}, got {book!r}")
        elif spans is not None and book not in spans:
            err(where, f"no page span registered for book '{book}' in this file")
        else:
            lo, hi = spans[book] if spans is not None else (1, MAX_PAGE)
            for k in ("page", "chartPage"):
                if k in keys and not (isinstance(node[k], int) and lo <= node[k] <= hi):
                    err(where, f"{k} {node[k]!r} outside this file's span {lo}-{hi} for '{book}'")
            if "pages" in keys:
                v = node["pages"]
                if not (isinstance(v, list) and v and all(isinstance(p, int) and lo <= p <= hi for p in v)):
                    err(where, f"pages {v!r} outside this file's span {lo}-{hi} for '{book}'")
    elif "book" in keys and not (where.startswith("scenes/trackers.json") and node.get("pageUnknown") is True):
        err(where, "'book' without a page reference")

    # Category and approach references.
    pc = node.get("principleCategory")
    if pc is not None and pc not in PRINCIPLE_CATEGORIES | {"fromSecondaryArchetype"}:
        err(where, f"unknown principle category '{pc}'")
    for a in node.get("suggestedApproaches", []):
        if a not in approaches:
            err(where, f"unknown approach '{a}'")


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def is_ref_list(v):
    """A non-empty list of bare option references (one reference key, nothing else)."""
    return isinstance(v, list) and bool(v) and all(
        isinstance(o, dict) and len(o) == 1 and is_ref(o) for o in v)


def check_effects(effects, where):
    """An ability's `effects` list: each names its actions and which roll sets it."""
    if not isinstance(effects, list):
        err(where, "effects must be a list")
        return
    for i, e in enumerate(effects):
        w = f"{where}[{i}]"
        if not isinstance(e, dict):
            err(w, "an effect must be an object")
            continue
        for k in e.keys() - EFFECT_KEYS:
            err(w, f"unknown effect key '{k}'")
        acts = e.get("actions")
        if not (isinstance(acts, list) and acts and all(a in ACTIONS for a in acts) and len(set(acts)) == len(acts)):
            err(w, f"'actions' must be a non-empty list of distinct actions from {sorted(ACTIONS)}")
        use = e.get("use")
        uses = use if isinstance(use, list) else [use]
        if not (uses and all(u in EFFECT_USES for u in uses)) or (isinstance(use, list) and len(use) < 2):
            err(w, f"'use' must be one of {sorted(EFFECT_USES)}, or a list of two or more of them")
        if "doublesUse" in e and e["doublesUse"] not in EFFECT_USES:
            err(w, "bad 'doublesUse'")
        if "optional" in e and e["optional"] is not True:
            err(w, "'optional' must be true when present")
        if "when" in e and e["when"] != "doubles":
            err(w, "'when' must be 'doubles'")
        if "fromBlank" in e and not isinstance(e["fromBlank"], str):
            err(w, "'fromBlank' must be the blank's label")


def check_pool(pool, where):
    """An ability's `pool`: present only when it rolls a single die instead of the usual three."""
    if not (isinstance(pool, dict) and set(pool) == {"single"} and pool["single"] in POOL_SINGLES):
        err(where, f"pool must be {{\"single\": one of {sorted(POOL_SINGLES)}}}")


def check_pool_uses(effects, pool, where):
    """A `single` effect needs a single-die `pool`, and a single-die `pool` needs a `single` effect."""
    if not isinstance(effects, list):
        return
    uses = [u for e in effects if isinstance(e, dict) for u in (e.get("use") if isinstance(e.get("use"), list) else [e.get("use")])]
    if "single" in uses and not pool:
        err(where, "an effect uses 'single' but there's no single-die pool")
    if pool and "single" not in uses:
        err(where, "a single-die pool but no effect uses 'single'")


def check_restrictions(node, where):
    """Restriction keys on a choice block: well formed, and consistent with its count."""
    count = node.get("count")
    # A prose constraint on another list (e.g. fixedGreenConstraint) needs a matching rule
    # (fixedGreenRule).
    for k in node:
        if k.endswith("Constraint"):
            rule_key = k[: -len("Constraint")] + "Rule"
            if node.get(rule_key) not in RULES:
                err(where, f"{k} needs a machine-readable {rule_key} (one of {sorted(RULES)})")
    # Every prose constraint needs a machine-readable form the app can check.
    if "constraint" in node and not (RESTRICTION_KEYS & node.keys() or node.get("fromGreenList") or (
            isinstance(node.get("options"), list) and node["options"]
            and all(isinstance(o, dict) and "requires" in o for o in node["options"]))):
        err(where, f"constraint has no machine-readable form (one of {sorted(RESTRICTION_KEYS)}, "
                   "fromGreenList, or 'requires' on every option)")
    if "usesFrom" in node:
        v = node["usesFrom"]
        if not (v in USES_FROM if isinstance(v, str) else is_ref_list(v)):
            err(where, f"usesFrom must be one of {sorted(USES_FROM)} or a non-empty list of option references")
    if "requireAtLeast" in node:
        clauses = node["requireAtLeast"]
        if not (isinstance(clauses, list) and clauses):
            err(where, "requireAtLeast must be a non-empty list")
            clauses = []
        for i, c in enumerate(clauses):
            cw = f"{where}.requireAtLeast[{i}]"
            if not isinstance(c, dict):
                err(cw, "must be an object")
                continue
            if set(c) != {"count", "uses"}:
                err(cw, f"must have exactly the keys count and uses, got {sorted(c)}")
            if not (is_int(c.get("count")) and c["count"] >= 1):
                err(cw, "count must be a positive integer")
            u = c.get("uses")
            if not (u in USES_KINDS if isinstance(u, str) else is_ref_list(u)):
                err(cw, f"uses must be one of {sorted(USES_KINDS)} or a non-empty list of option references")
        total = sum(c["count"] for c in clauses if isinstance(c, dict) and is_int(c.get("count")))
        if is_int(count) and total > count:
            err(where, f"requireAtLeast needs {total} abilities but the block takes {count}")
    if "minDifferentPowers" in node:
        m = node["minDifferentPowers"]
        if not (is_int(m) and m >= 2 and (not is_int(count) or m <= count)):
            err(where, f"minDifferentPowers must be an integer from 2 to the block's count, got {m!r}")
    if "differentFromGreen" in node and not (node["differentFromGreen"] is True and node.get("fromGreenList")):
        err(where, "differentFromGreen must be true and only appear on a fromGreenList block")
    if "sameUsePattern" in node:
        p = node["sameUsePattern"]
        groups = p.get("groups") if isinstance(p, dict) else None
        if not (isinstance(p, dict) and set(p) == {"uses", "groups"} and p.get("uses") in USES_KINDS
                and isinstance(groups, list) and groups and all(is_int(g) and g >= 1 for g in groups)):
            err(where, f"sameUsePattern needs 'uses' in {sorted(USES_KINDS)} and a list of positive 'groups'")
        elif is_int(count) and sum(groups) != count:
            err(where, f"sameUsePattern groups add up to {sum(groups)}, not the block's count {count}")


def check_books(entries):
    seen = set()
    for b in entries:
        require(b, ["id", "title", "shortTitle"], f"{BOOKS_FILE}[{b.get('id', '?')}]")
        if b.get("id") in seen:
            err(BOOKS_FILE, f"duplicate id '{b.get('id')}'")
        seen.add(b.get("id"))
    for rel, spans in PAGE_SPANS.items():
        for book in spans:
            if book not in seen:
                err(rel, f"PAGE_SPANS names unknown book '{book}'")


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
            check_effects(e.get("outEffects"), f"personalities[{e.get('id')}].outEffects")
            if "outPool" in e:
                check_pool(e["outPool"], f"personalities[{e.get('id')}].outPool")
            check_pool_uses(e.get("outEffects"), e.get("outPool"), f"personalities[{e.get('id')}]")
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

    approach_ids = {e.get("id") for e in (va or {}).get("approaches", []) if isinstance(e, dict)}
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
            pn = e.get("pairingNote")
            if pn is not None:
                if not (isinstance(pn, dict) and isinstance(pn.get("text"), str) and pn["text"] and isinstance(pn.get("approaches"), list) and pn["approaches"]):
                    err(ew, "pairingNote needs 'approaches' (a list of approach ids) and 'text'")
                else:
                    for a in pn["approaches"]:
                        if a not in approach_ids:
                            err(ew, f"pairingNote names unknown approach '{a}'")
            nm = e.get("needsMinionMaker")
            if nm is not None and not (isinstance(nm, dict) and isinstance(nm.get("note"), str) and nm["note"]):
                err(ew, "needsMinionMaker needs a 'note'")

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


def check_scenes(docs):
    """Scene tracker presets: counts per zone, and a page (or the explicit pageUnknown marker)."""
    entries = items(docs.get("scenes/trackers.json"), "trackers", "scenes/trackers.json")
    seen = set()
    ids = set()
    for t in entries:
        where = f"scenes/trackers.json[{t.get('id', '?')}]"
        require(t, ["id", "name", "counts", "book"], where)
        if t.get("id") in ids:
            err("scenes/trackers.json", f"duplicate id '{t.get('id')}'")
        ids.add(t.get("id"))
        if "page" not in t and t.get("pageUnknown") is not True:
            err(where, "needs a page, or pageUnknown: true until the page is known")
        counts = t.get("counts")
        if not isinstance(counts, dict) or set(counts) != ZONES or not all(is_int(n) and 0 <= n <= 10 for n in counts.values()):
            err(where, "counts should be green, yellow and red, each 0 to 10")
            continue
        if sum(counts.values()) < 1:
            err(where, "a tracker needs at least one box")
        key = tuple(counts[z] for z in ("green", "yellow", "red"))
        if key in seen:
            err(where, "another preset has the same counts")
        seen.add(key)


def contrast(a, b):
    def luminance(color):
        channels = [int(color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
        linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]

    hi, lo = sorted([luminance(a), luminance(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def check_colors(doc):
    """The character color palette: not rules, so no page; each theme's ink reads on its fill."""
    entries = items(doc, "colors", COLORS_FILE)
    seen = set()
    for c in entries:
        where = f"{COLORS_FILE}[{c.get('id', '?')}]"
        require(c, ["id", "name", "light", "dark"], where)
        if c.get("id") in seen:
            err(COLORS_FILE, f"duplicate id '{c.get('id')}'")
        seen.add(c.get("id"))
        for theme in ("light", "dark"):
            pair = c.get(theme)
            if not isinstance(pair, dict) or not all(re.fullmatch(r"#[0-9A-Fa-f]{6}", str(pair.get(k))) for k in ("fill", "ink")):
                err(where, f"{theme} needs a hex fill and ink")
            elif contrast(pair["fill"], pair["ink"]) < 4.5:
                err(where, f"{theme} ink is below 4.5:1 on its fill")


def check_char_tokens(doc):
    """The token file's --char-* block has to match the palette: scripts/generate_char_tokens.py writes it."""
    tokens_path = DATA.parent / "src/theme/tokens.css"
    tokens = tokens_path.read_text() if tokens_path.exists() else ""
    for c in items(doc, "colors", COLORS_FILE):
        for theme, times in (("light", 1), ("dark", 3)):
            pair = c.get(theme)
            if not isinstance(pair, dict):
                continue
            fill = f"--char-{c.get('id')}: {pair.get('fill')};"
            ink = f"--char-{c.get('id')}-ink: {pair.get('ink')};"
            if tokens.count(fill) < times or tokens.count(ink) < times:
                err("src/theme/tokens.css", f"out of date for {c.get('id')} ({theme}): run scripts/generate_char_tokens.py")


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

    book_entries = items(docs.get(BOOKS_FILE), "books", BOOKS_FILE)
    check_books(book_entries)
    books = {b.get("id") for b in book_entries}

    for rel, doc in docs.items():
        if doc is not None and rel not in (BOOKS_FILE, COLORS_FILE):
            spans = PAGE_SPANS.get(rel)
            if spans is None:
                err(rel, "no page span registered in PAGE_SPANS")
            walk(doc, rel, lambda node, where, spans=spans: check_node(node, where, known, approaches, books, spans))

    check_heroes(docs)
    check_villains(docs)
    check_scenes(docs)
    check_colors(docs.get(COLORS_FILE))
    check_char_tokens(docs.get(COLORS_FILE))
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
