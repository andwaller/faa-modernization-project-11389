#!/usr/bin/env python3
"""Seeded synthetic portfolio generator for Project 11,389.

Everything generated here is SIMULATED. Only the 13 program rows (names, planned
scope, completion dates) come from GAO-26-107992 Table 2, p. 17. The portfolio is a
scale test, not a reconstruction of FAA's real project portfolio.

Calendar: day 0 = 2026-01-01. A visit occupies the half-open window [start_day, end_day).

Usage:
    python -I generate_portfolio.py --n 1000 --seed 1 --out ../data/synthetic
"""
import argparse
import csv
import datetime
import hashlib
import json
import os
import random

GENERATOR_VERSION = "0.1.0"
EPOCH = datetime.date(2026, 1, 1)
HORIZON = 1096                # days through 2028-12-31 (Phase 1 target, GAO p. 14)
NO_MERGE = "NO_MERGE_VISITS"  # facility restriction: visits cannot be combined
CLEAN_SPACING = 400           # days between starts at clean multi-project facilities (> 365)
C1_GAP = (30, 330)            # start gap for planted duplicate visits (<= 365)
DUR = (20, 90)                # visit duration in days
PLANTED_RATE = 0.01           # items per positive class = max(2, round(rate * n))
CHAIN_RATE = 0.004            # dependency chains = max(2, round(rate * n))


def day(y, m, d):
    return (datetime.date(y, m, d) - EPOCH).days


# GAO-26-107992 Table 2 (p. 17): program, domain, planned scope, BNATCS completion date
PROGRAMS = [
    ("PRG01", "Information displays", "Automation", 435, day(2028, 9, 30)),
    ("PRG02", "Terminal Flight Data Manager", "Automation", 89, day(2028, 11, 30)),
    ("PRG03", "Telecommunications", "Communications", 5170, day(2028, 12, 31)),
    ("PRG04", "Voice switches", "Communications", 450, day(2028, 11, 30)),
    ("PRG05", "Radios", "Communications", 1581, day(2028, 12, 31)),
    ("PRG06", "Radars", "Surveillance", 612, day(2028, 12, 31)),
    ("PRG07", "Surface Awareness Initiative", "Surveillance", 220, day(2027, 8, 31)),
    ("PRG08", "Surface Movement Radar", "Surveillance", 53, day(2028, 12, 31)),
    ("PRG09", "Weather cameras", "Weather", 64, day(2028, 9, 30)),
    ("PRG10", "Automated Weather Observation System", "Weather", 50, day(2028, 12, 31)),
    ("PRG11", "Visual Weather Observation System", "Weather", 60, day(2028, 9, 30)),
    ("PRG12", "Alaska Automation Capability", "Weather", 17, day(2028, 12, 31)),
    ("PRG13", "Tower Simulation System", "Other", 117, day(2028, 5, 31)),
]
# GAO p. 5: 409 towers, 119 combined tower/TRACON, 25 standalone TRACON, 21 ARTCC
FAC_TYPES = [("TWR", 409), ("TWR_TRACON", 119), ("TRACON", 25), ("ARTCC", 21)]


class Builder:
    def __init__(self, n, seed):
        self.n = n
        self.seed = seed
        self.rng = random.Random(seed)
        self.projects = {}    # tmp id -> dict
        self.facilities = {}  # tmp id -> dict
        self.deps = []        # (pre, post)
        self.mws = []         # (facility, start, end)
        self.truth = {k: [] for k in ("C1", "C2", "C3", "C4", "C5")}
        self.chains = []
        self.n_crew_dedicated = 0
        self._p = 0
        self._f = 0

    # ---- primitives -------------------------------------------------------------
    def fac(self, restriction=False):
        self._f += 1
        fid = f"tf{self._f}"
        kinds, weights = zip(*FAC_TYPES)
        self.facilities[fid] = {
            "type": self.rng.choices(kinds, weights=weights, k=1)[0],
            "restriction": NO_MERGE if restriction else "",
        }
        return fid

    def program(self, end, exclude=()):
        el = [p for p in PROGRAMS if p[4] >= end and p[0] not in exclude]
        return self.rng.choices(el, weights=[p[3] for p in el], k=1)[0]

    def proj(self, fid, start, dur, exclude=()):
        self._p += 1
        pid = f"tp{self._p}"
        prog = self.program(start + dur, exclude)
        self.projects[pid] = {
            "idx": self._p, "facility": fid, "program": prog[0],
            "start": start, "end": start + dur, "deadline": prog[4],
            "crew": "", "dedicated": "",
        }
        return pid

    def dur(self):
        return self.rng.randint(*DUR)

    def progs_differ(self, a, b):
        return self.projects[a]["program"] != self.projects[b]["program"]

    # ---- planted classes ---------------------------------------------------------
    def pair_same_facility(self, gap, restriction):
        """Two projects, different programs, one facility, start gap `gap` days."""
        fid = self.fac(restriction=restriction)
        d1, d2 = self.dur(), self.dur()
        s0 = self.rng.randint(0, HORIZON - 1 - gap - d2)
        a = self.proj(fid, s0, d1)
        b = self.proj(fid, s0 + gap, d2, exclude=(self.projects[a]["program"],))
        return fid, a, b

    def plant_c1(self):
        fid, a, b = self.pair_same_facility(self.rng.randint(*C1_GAP), restriction=False)
        self.truth["C1"].append({"facility": fid, "projects": [a, b]})

    def plant_c5(self):
        fid, a, b = self.pair_same_facility(self.rng.randint(*C1_GAP), restriction=True)
        self.truth["C5"].append({"facility": fid, "projects": [a, b]})

    def plant_c3(self):
        fid = self.fac()
        d1, d2 = self.rng.randint(DUR[0], DUR[1]), self.dur()
        s0 = self.rng.randint(0, HORIZON - 1 - d1 - d2)
        a = self.proj(fid, s0, d1)
        # B starts while A is still running although B depends on A
        b = self.proj(fid, s0 + self.rng.randint(1, d1 - 1), d2,
                      exclude=(self.projects[a]["program"],))
        self.deps.append((a, b))
        self.truth["C3"].append({"facility": fid, "pre": a, "post": b})

    def plant_c4(self):
        fid = self.fac()
        d = self.dur()
        s = self.rng.randint(25, HORIZON - 1 - d)
        p = self.proj(fid, s, d)
        mw_start = s + self.rng.randint(-20, d - 1)
        self.mws.append((fid, mw_start, mw_start + 30))
        self.truth["C4"].append({"facility": fid, "project": p})

    def plant_c2(self):
        fa, fb = self.fac(), self.fac()
        da, db = self.rng.randint(DUR[0], DUR[1]), self.dur()
        sa = self.rng.randint(0, HORIZON - 1 - da - db)
        a = self.proj(fa, sa, da)
        b = self.proj(fb, sa + self.rng.randint(1, da - 1), db)
        self.n_crew_dedicated += 1
        crew = f"tcd{self.n_crew_dedicated}"
        self.projects[a]["dedicated"] = crew
        self.projects[b]["dedicated"] = crew
        self.truth["C2"].append({"crew": crew, "projects": [a, b], "facilities": [fa, fb]})

    def plant_chain(self):
        length = self.rng.randint(3, 5)
        durs = [self.dur() for _ in range(length)]
        slacks = [self.rng.randint(0, 120) for _ in range(length - 1)]
        s = self.rng.randint(0, HORIZON - 1 - sum(durs) - sum(slacks))
        ids, prev_prog = [], ()
        for i in range(length):
            p = self.proj(self.fac(), s, durs[i], exclude=prev_prog)
            ids.append(p)
            prev_prog = (self.projects[p]["program"],)
            s = s + durs[i] + (slacks[i] if i < length - 1 else 0)
        for x, y in zip(ids, ids[1:]):
            self.deps.append((x, y))
        self.chains.append(ids)

    # ---- clean filler ------------------------------------------------------------
    def fill_clean(self):
        while len(self.projects) < self.n:
            remaining = self.n - len(self.projects)
            k = min(self.rng.choices([1, 2, 3], weights=[2, 2, 1], k=1)[0], remaining)
            fid = self.fac(restriction=self.rng.random() < 0.10)
            gaps = [CLEAN_SPACING + self.rng.randint(0, 30) for _ in range(k - 1)]
            durs = [self.dur() for _ in range(k)]
            s = self.rng.randint(0, HORIZON - 1 - sum(gaps) - durs[-1])
            ids = []
            for i in range(k):
                ids.append(self.proj(fid, s, durs[i]))
                if i < k - 1:
                    s += gaps[i]
            if k >= 2 and self.rng.random() < 0.15:   # a satisfied dependency
                self.deps.append((ids[0], ids[1]))
            if self.rng.random() < 0.10:               # a non-colliding maintenance window
                for _ in range(10):
                    ms = self.rng.randint(0, HORIZON - 31)
                    if all(ms + 30 + 5 <= self.projects[p]["start"] or
                           ms >= self.projects[p]["end"] + 5 for p in ids):
                        self.mws.append((fid, ms, ms + 30))
                        break

    # ---- assembly ----------------------------------------------------------------
    def build(self):
        k = max(2, round(PLANTED_RATE * self.n))
        n_chains = max(2, round(CHAIN_RATE * self.n))
        planted = 9 * k + 5 * n_chains  # upper bound on planted projects
        assert planted < self.n, f"n={self.n} too small for k={k}"
        for _ in range(k):
            self.plant_c1()
            self.plant_c2()
            self.plant_c3()
            self.plant_c4()
            self.plant_c5()
        for _ in range(n_chains):
            self.plant_chain()
        self.fill_clean()
        self.assign_crews()
        return self.finalize(k)

    def assign_crews(self):
        """First-fit crews for every project that has no dedicated crew: no overlaps by construction."""
        free_at, tmp = [], []
        order = sorted((p for p in self.projects.values() if not p["dedicated"]),
                       key=lambda p: (p["start"], p["idx"]))
        for p in order:
            for i, f in enumerate(free_at):
                if f <= p["start"]:
                    free_at[i] = p["end"]
                    p["crew"] = f"tcf{i + 1}"
                    break
            else:
                free_at.append(p["end"])
                p["crew"] = f"tcf{len(free_at)}"
        for p in self.projects.values():
            if p["dedicated"]:
                p["crew"] = p["dedicated"]

    def propagate(self, head, delay):
        """Projects pushed later when `head` slips by `delay` days (dependency propagation)."""
        preds = {}
        for a, b in self.deps:
            preds.setdefault(b, []).append(a)
        shift = {head: delay}
        for pid in sorted(self.projects, key=lambda x: (self.projects[x]["start"], self.projects[x]["idx"])):
            for a in preds.get(pid, []):
                if a in shift:
                    need = self.projects[a]["end"] + shift[a] - self.projects[pid]["start"]
                    if need > 0:
                        shift[pid] = max(shift.get(pid, 0), need)
        return sorted(set(shift) - {head})

    def finalize(self, k):
        rng = self.rng
        # shuffle so ids reveal nothing about planting order
        pids = sorted(self.projects, key=lambda x: self.projects[x]["idx"])
        fids = sorted(self.facilities, key=lambda x: int(x[2:]))
        cids = sorted({p["crew"] for p in self.projects.values()})
        rng.shuffle(pids)
        rng.shuffle(fids)
        rng.shuffle(cids)
        pmap = {t: f"P{i + 1:05d}" for i, t in enumerate(pids)}
        fmap = {t: f"F{i + 1:05d}" for i, t in enumerate(fids)}
        cmap = {t: f"CRW{i + 1:04d}" for i, t in enumerate(cids)}

        # T4 queries from the chains, computed before ids are rewritten
        t4 = []
        for i, chain in enumerate(self.chains[:5]):
            delay = 60 if i % 2 == 0 else 180
            t4.append({"project": pmap[chain[0]], "delay_days": delay,
                       "affected": sorted(pmap[x] for x in self.propagate(chain[0], delay))})

        truth = {
            "C1": [{"facility": fmap[t["facility"]], "projects": sorted(pmap[x] for x in t["projects"])}
                   for t in self.truth["C1"]],
            "C5": [{"facility": fmap[t["facility"]], "projects": sorted(pmap[x] for x in t["projects"])}
                   for t in self.truth["C5"]],
            "C2": [{"crew": cmap[t["crew"]], "projects": sorted(pmap[x] for x in t["projects"]),
                    "facilities": sorted(fmap[x] for x in t["facilities"])} for t in self.truth["C2"]],
            "C3": [{"facility": fmap[t["facility"]], "pre": pmap[t["pre"]], "post": pmap[t["post"]]}
                   for t in self.truth["C3"]],
            "C4": [{"facility": fmap[t["facility"]], "project": pmap[t["project"]]}
                   for t in self.truth["C4"]],
        }
        by_fac = {}
        for t, p in self.projects.items():
            by_fac.setdefault(fmap[p["facility"]], []).append(pmap[t])
        t1 = [{"facility": f, "projects": sorted(by_fac[f])}
              for f in rng.sample(sorted(by_fac), 5)]
        c1f = sorted(x["facility"] for x in truth["C1"])
        c5f = sorted(x["facility"] for x in truth["C5"])
        t6 = {"facilities": rng.sample(c1f, 2) + rng.sample(c5f, 1),
              "expected": {"merge_feasible": sorted(rng.sample(c1f, 0))}}  # filled below
        t6["expected"] = {"merge_feasible": t6["facilities"][:2], "merge_infeasible": t6["facilities"][2:]}

        facs = [{"facility_id": fmap[t], "name": f"SIM-{f['type']}-{fmap[t][1:]}", "type": f["type"],
                 "restriction": f["restriction"], "provenance": "SIMULATED"}
                for t, f in self.facilities.items()]
        projs = [{"project_id": pmap[t], "program_id": p["program"], "facility_id": fmap[p["facility"]],
                  "crew_id": cmap[p["crew"]], "start_day": p["start"], "end_day": p["end"],
                  "deadline_day": p["deadline"], "provenance": "SIMULATED"}
                 for t, p in self.projects.items()]
        deps = [{"pre_project_id": pmap[a], "post_project_id": pmap[b], "provenance": "SIMULATED"}
                for a, b in self.deps]
        mws = [{"facility_id": fmap[f], "start_day": s, "end_day": e, "provenance": "SIMULATED"}
               for f, s, e in self.mws]
        progs = [{"program_id": p[0], "name": p[1], "domain": p[2], "planned_scope": p[3],
                  "completion_day": p[4],
                  "completion_date": (EPOCH + datetime.timedelta(days=p[4])).isoformat(),
                  "provenance": "DOCUMENTED", "source": "GAO-26-107992 Table 2, p. 17"} for p in PROGRAMS]
        return {
            "tables": {"programs": progs,
                       "facilities": sorted(facs, key=lambda r: r["facility_id"]),
                       "projects": sorted(projs, key=lambda r: r["project_id"]),
                       "dependencies": sorted(deps, key=lambda r: (r["pre_project_id"], r["post_project_id"])),
                       "maintenance_windows": sorted(mws, key=lambda r: (r["facility_id"], r["start_day"]))},
            "truth": {"seed": self.seed, "n_projects": self.n, "items_per_class": k,
                      "n_chains": len(self.chains), "classes": truth, "T1": t1, "T4": t4, "T6": t6},
        }


def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, required=True)
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    result = Builder(a.n, a.seed).build()
    root = os.path.join(a.out, f"portfolio_n{a.n}_seed{a.seed}")
    data_dir, truth_dir = os.path.join(root, "data"), os.path.join(root, "truth")
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(truth_dir, exist_ok=True)

    for name, rows in result["tables"].items():
        write_csv(os.path.join(data_dir, f"{name}.csv"), rows,
                  list(rows[0].keys()) if rows else ["facility_id", "start_day", "end_day", "provenance"])
    tpath = os.path.join(truth_dir, "ground_truth.json")
    with open(tpath, "w", encoding="utf-8", newline="") as f:
        json.dump(result["truth"], f, indent=1, sort_keys=True)
        f.write("\n")

    files = {f"data/{n}.csv": sha256(os.path.join(data_dir, f"{n}.csv")) for n in result["tables"]}
    files["truth/ground_truth.json"] = sha256(tpath)
    manifest = {
        "generator_version": GENERATOR_VERSION,
        "generator_sha256": sha256(os.path.abspath(__file__)),
        "seed": a.seed, "n_projects": a.n,
        "counts": {k: len(v) for k, v in result["tables"].items()},
        "planted": {k: len(v) for k, v in result["truth"]["classes"].items()},
        "note": "All rows SIMULATED except programs.csv (GAO-26-107992 Table 2, p. 17). "
                "Day 0 = 2026-01-01. Windows are half-open [start_day, end_day).",
        "sha256": files,
    }
    with open(os.path.join(root, "MANIFEST.json"), "w", encoding="utf-8", newline="") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"{root}: " + ", ".join(f"{k}={v}" for k, v in manifest["counts"].items())
          + " | planted " + ", ".join(f"{k}={v}" for k, v in manifest["planted"].items()))


if __name__ == "__main__":
    main()
