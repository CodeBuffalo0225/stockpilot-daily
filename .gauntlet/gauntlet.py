#!/usr/bin/env python3
"""Gauntlet Loop harness: blind A/B pairing, verdict logging, and code-level gates.

Hard rules live here, not in prompts:
  - critics never see which artifact is ours (neutral names, key stored outside pair dir)
  - a win requires winning BOTH orderings
  - malformed verdicts are never counted as wins
  - wall-clock ceiling and plateau escalation are enforced by `status`

Usage (from repo root):
  python .gauntlet/gauntlet.py pair   --piece tide-chart --round 3 --ours shots/ours.png --bar .gauntlet/bars/tide-chart/ref.png
  python .gauntlet/gauntlet.py record --piece tide-chart --round 3 --o1 v1.json --o2 v2.json
  python .gauntlet/gauntlet.py record --piece api-latency --round 2 --measured --ours-value 180 --bar-value 150 --lower-is-better
  python .gauntlet/gauntlet.py status --piece tide-chart
Stdlib only.
"""
import argparse, json, random, re, shutil, sys, time
from pathlib import Path

ROOT = Path(".gauntlet")
LOG = ROOT / "log.jsonl"
KEYS = ROOT / "keys"          # never passed to critics
PAIRS = ROOT / "pairs"
CONFIG = ROOT / "config.json"
STARTED = ROOT / "started_at"
DEFAULTS = {"max_wall_hours": 8, "plateau_rounds": 3, "plateau_similarity": 0.6}


def config():
    cfg = dict(DEFAULTS)
    if CONFIG.exists():
        cfg.update({k: v for k, v in json.loads(CONFIG.read_text()).items() if v is not None})
    return cfg


def mark_start():
    ROOT.mkdir(exist_ok=True)
    if not STARTED.exists():
        STARTED.write_text(str(time.time()))


def cmd_pair(a):
    mark_start()
    ours, bar = Path(a.ours), Path(a.bar)
    for p in (ours, bar):
        if not p.exists():
            sys.exit(f"missing artifact: {p}")
    ours_is_a = random.random() < 0.5
    key = {"order1": {"A": "ours" if ours_is_a else "bar", "B": "bar" if ours_is_a else "ours"}}
    key["order2"] = {"A": key["order1"]["B"], "B": key["order1"]["A"]}
    src = {"ours": ours, "bar": bar}
    for order in ("order1", "order2"):
        d = PAIRS / a.piece / str(a.round) / order
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
        for label in ("A", "B"):
            s = src[key[order][label]]
            # neutral name: strips path/filename hints; keep extension so tools can open it
            shutil.copyfile(s, d / f"{label}{s.suffix.lower()}")
    KEYS.mkdir(parents=True, exist_ok=True)
    (KEYS / f"{a.piece}-{a.round}.json").write_text(json.dumps(key))
    print(json.dumps({"order1": str(PAIRS / a.piece / str(a.round) / "order1"),
                      "order2": str(PAIRS / a.piece / str(a.round) / "order2")}))


def load_verdict(path):
    try:
        v = json.loads(Path(path).read_text())
    except Exception as e:
        return None, f"unparseable: {e}"
    if v.get("winner") not in ("A", "B"):
        return None, "winner must be A or B"
    if not isinstance(v.get("biggest_gap"), str) or not v["biggest_gap"].strip():
        return None, "biggest_gap missing"
    return v, None


def append_log(entry):
    ROOT.mkdir(exist_ok=True)
    entry["ts"] = time.time()
    with LOG.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    print(json.dumps(entry))


def cmd_record(a):
    if a.measured:
        if a.ours_value is None or a.bar_value is None:
            sys.exit("--measured needs --ours-value and --bar-value")
        win = a.ours_value <= a.bar_value if a.lower_is_better else a.ours_value >= a.bar_value
        gap = "" if win else f"ours {a.ours_value} vs bar {a.bar_value} ({'lower' if a.lower_is_better else 'higher'} is better)"
        return append_log({"piece": a.piece, "round": a.round, "mode": "measured",
                           "result": "win" if win else "loss", "gap": gap})
    kf = KEYS / f"{a.piece}-{a.round}.json"
    if not kf.exists():
        sys.exit(f"no key for {a.piece} round {a.round}; run pair first")
    key = json.loads(kf.read_text())
    results, gaps = [], []
    for order, path in (("order1", a.o1), ("order2", a.o2)):
        v, err = load_verdict(path)
        if err:
            return append_log({"piece": a.piece, "round": a.round, "mode": "blind",
                               "result": "invalid", "gap": "", "error": f"{order}: {err}"})
        ours_won = key[order][v["winner"]] == "ours"
        results.append(ours_won)
        if not ours_won:
            gaps.append(v["biggest_gap"].strip())
    win = all(results)  # two-order rule: split decision is a loss
    append_log({"piece": a.piece, "round": a.round, "mode": "blind",
                "result": "win" if win else ("split" if any(results) else "loss"),
                "gap": gaps[0] if gaps else ""})


def tokens(s):
    return set(re.findall(r"[a-z0-9]+", s.lower())) - {"the", "a", "an", "and", "of", "to", "is", "in", "on"}


def similar(x, y, thresh):
    tx, ty = tokens(x), tokens(y)
    return bool(tx and ty) and len(tx & ty) / len(tx | ty) >= thresh


def cmd_status(a):
    cfg = config()
    if STARTED.exists():
        hours = (time.time() - float(STARTED.read_text())) / 3600
        if hours >= cfg["max_wall_hours"]:
            return print(json.dumps({"decision": "STOP", "reason": f"wall clock {hours:.1f}h >= ceiling {cfg['max_wall_hours']}h"}))
    rows = [json.loads(l) for l in LOG.read_text().splitlines()] if LOG.exists() else []
    rows = [r for r in rows if r["piece"] == a.piece]
    if rows and rows[-1]["result"] == "win":
        return print(json.dumps({"decision": "PASS", "reason": "won latest round"}))
    invalid = [r for r in rows[-2:] if r["result"] == "invalid"]
    if len(invalid) == 2:
        return print(json.dumps({"decision": "ESCALATE", "reason": "two invalid critic verdicts in a row"}))
    n = cfg["plateau_rounds"]
    gaps = [r["gap"] for r in rows if r["result"] in ("loss", "split") and r["gap"]][-n:]
    if len(gaps) == n and all(similar(gaps[0], g, cfg["plateau_similarity"]) for g in gaps[1:]):
        return print(json.dumps({"decision": "ESCALATE", "reason": f"same gap {n} rounds running", "gap": gaps[-1]}))
    print(json.dumps({"decision": "CONTINUE", "rounds_so_far": len(rows),
                      "next_gap": gaps[-1] if gaps else None}))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("pair"); s.add_argument("--piece", required=True); s.add_argument("--round", type=int, required=True)
    s.add_argument("--ours", required=True); s.add_argument("--bar", required=True)
    r = sub.add_parser("record"); r.add_argument("--piece", required=True); r.add_argument("--round", type=int, required=True)
    r.add_argument("--o1"); r.add_argument("--o2"); r.add_argument("--measured", action="store_true")
    r.add_argument("--ours-value", type=float); r.add_argument("--bar-value", type=float)
    r.add_argument("--lower-is-better", action="store_true")
    t = sub.add_parser("status"); t.add_argument("--piece", required=True)
    a = p.parse_args()
    {"pair": cmd_pair, "record": cmd_record, "status": cmd_status}[a.cmd](a)


if __name__ == "__main__":
    main()
