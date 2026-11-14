#!/usr/bin/env python3
"""Independent oracle: recompute every conflict class from the raw CSVs and compare with the
planted ground truth. Uses only the rule definitions in TASK_DEFINITIONS.md.

Usage: python -I verify_portfolio.py ../data/synthetic/portfolio_n1000_seed1
Exit code 0 only if every class matches exactly (no missing items, no accidental extras).
"""
import csv
import itertools
import json
import os
import sys

NO_MERGE = "NO_MERGE_VISITS"


def read(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main(root):
    d = os.path.join(root, "data")
    proj = {r["project_id"]: {k: (int(v) if k.endswith("_day") else v) for k, v in r.items()}
            for r in read(os.path.join(d, "projects.csv"))}
    fac = {r["facility_id"]: r for r in read(os.path.join(d, "facilities.csv"))}
    deps = {(r["pre_project_id"], r["post_project_id"]) for r in read(os.path.join(d, "dependencies.csv"))}
    linked = deps | {(b, a) for a, b in deps}
    mws = [(r["facility_id"], int(r["start_day"]), int(r["end_day"]))
           for r in read(os.path.join(d, "maintenance_windows.csv"))]
    with open(os.path.join(root, "truth", "ground_truth.json"), encoding="utf-8") as f:
        truth = json.load(f)["classes"]

    overlap = lambda a, b: a["start_day"] < b["end_day"] and b["start_day"] < a["end_day"]
    by_fac, by_crew = {}, {}
    for p in proj.values():
        by_fac.setdefault(p["facility_id"], []).append(p)
        by_crew.setdefault(p["crew_id"], []).append(p)

    found = {k: set() for k in ("C1", "C2", "C3", "C4", "C5")}
    for fid, ps in by_fac.items():
        for a, b in itertools.combinations(ps, 2):
            if a["program_id"] == b["program_id"]:
                continue
            if abs(a["start_day"] - b["start_day"]) > 365:
                continue
            if (a["project_id"], b["project_id"]) in linked:
                continue
            key = tuple(sorted((a["project_id"], b["project_id"])))
            found["C5" if fac[fid]["restriction"] == NO_MERGE else "C1"].add(key)
    for ps in by_crew.values():
        for a, b in itertools.combinations(ps, 2):
            if a["facility_id"] != b["facility_id"] and overlap(a, b):
                found["C2"].add(tuple(sorted((a["project_id"], b["project_id"]))))
    for pre, post in deps:
        if proj[post]["start_day"] < proj[pre]["end_day"]:
            found["C3"].add((pre, post))
    for fid, s, e in mws:
        for p in by_fac.get(fid, []):
            if p["start_day"] < e and s < p["end_day"]:
                found["C4"].add((p["project_id"], fid))

    planted = {
        "C1": {tuple(t["projects"]) for t in truth["C1"]},
        "C5": {tuple(t["projects"]) for t in truth["C5"]},
        "C2": {tuple(t["projects"]) for t in truth["C2"]},
        "C3": {(t["pre"], t["post"]) for t in truth["C3"]},
        "C4": {(t["project"], t["facility"]) for t in truth["C4"]},
    }
    ok = True
    for k in ("C1", "C2", "C3", "C4", "C5"):
        missing, extra = planted[k] - found[k], found[k] - planted[k]
        status = "OK " if not missing and not extra else "BAD"
        ok &= status == "OK "
        print(f"{status} {k}: planted={len(planted[k])} oracle={len(found[k])} "
              f"missing={len(missing)} extra={len(extra)}")
    print("VERIFIED" if ok else "MISMATCH")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
