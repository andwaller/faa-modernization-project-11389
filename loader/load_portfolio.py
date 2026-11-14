#!/usr/bin/env python3
"""Load a generated portfolio into a persistent Relate store using schema/schema.cypher.

Usage:
    python -I load_portfolio.py --portfolio ../data/synthetic/portfolio_n1000_seed1 \
                                --store ../store/portfolio_n1000_seed1.rl [--verify]

--verify recomputes every planted conflict class in Cypher over the loaded graph and compares the
result sets with truth/ground_truth.json. Exit code 0 only if all classes match exactly.
"""
import argparse
import csv
import json
import os
import sys
import time

import relate

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA = os.path.join(HERE, "..", "schema", "schema.cypher")
BATCH = 2000
SOURCE = {
    "sourceId": "GAO-26-107992",
    "title": "Air Traffic Control Systems: Ambitious New Modernization Effort Needs to Improve Cost and Schedule Planning",
    "url": "https://www.gao.gov/products/gao-26-107992",
    "published": "2026-09-14",
    "retrieved": "2026-11-14",
    "provenance": "DOCUMENTED",
}


def read(portfolio, name):
    with open(os.path.join(portfolio, "data", name + ".csv"), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def ints(row, *keys):
    return {**row, **{k: int(row[k]) for k in keys}}


def batches(rows):
    for i in range(0, len(rows), BATCH):
        yield rows[i:i + BATCH]


def run(cur, cypher, params=None):
    cur.execute(cypher, params or {})
    return cur.fetchall()


def apply_schema(cur):
    n = 0
    with open(SCHEMA, encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if s.startswith("CREATE "):
                run(cur, s.rstrip(";"))
                n += 1
    return n


def load(cur, portfolio):
    t = {}

    def step(name, fn):
        s = time.perf_counter()
        fn()
        t[name] = time.perf_counter() - s

    programs = [ints(r, "planned_scope", "completion_day") for r in read(portfolio, "programs")]
    facilities = read(portfolio, "facilities")
    projects = [ints(r, "start_day", "end_day", "deadline_day") for r in read(portfolio, "projects")]
    deps = read(portfolio, "dependencies")
    mws = [ints(r, "start_day", "end_day") for r in read(portfolio, "maintenance_windows")]
    crews = sorted({r["crew_id"] for r in projects})

    def sources():
        run(cur, "CREATE (:Source {sourceId:$sourceId, title:$title, url:$url, published:$published, "
                 "retrieved:$retrieved, provenance:$provenance})", SOURCE)

    def progs():
        run(cur, """UNWIND $rows AS r
                    MATCH (s:Source {sourceId:'GAO-26-107992'})
                    CREATE (p:Program {programId:r.program_id, name:r.name, domain:r.domain,
                                       plannedScope:r.planned_scope, completionDay:r.completion_day,
                                       completionDate:r.completion_date, provenance:r.provenance})
                    CREATE (p)-[:DOCUMENTED_IN {table:'Table 2', page:17}]->(s)""", {"rows": programs})

    def facs():
        for b in batches(facilities):
            run(cur, """UNWIND $rows AS r
                        CREATE (f:Facility {facilityId:r.facility_id, name:r.name, type:r.type,
                                            restriction:CASE WHEN r.restriction = '' THEN null ELSE r.restriction END,
                                            provenance:r.provenance})""", {"rows": b})

    def crew():
        for b in batches([{"crewId": c} for c in crews]):
            run(cur, "UNWIND $rows AS r CREATE (:Crew {crewId:r.crewId, provenance:'SIMULATED'})", {"rows": b})

    def projs():
        for b in batches(projects):
            run(cur, """UNWIND $rows AS r
                        MATCH (pg:Program {programId:r.program_id}), (f:Facility {facilityId:r.facility_id}),
                              (c:Crew {crewId:r.crew_id})
                        CREATE (p:Project {projectId:r.project_id, startDay:r.start_day, endDay:r.end_day,
                                           deadlineDay:r.deadline_day, provenance:r.provenance})
                        CREATE (p)-[:IN_PROGRAM]->(pg)
                        CREATE (p)-[:SCHEDULED_AT]->(f)
                        CREATE (p)-[:ASSIGNED_TO]->(c)""", {"rows": b})

    def dependencies():
        for b in batches(deps):  # CSV is prerequisite -> dependent; graph is dependent -> prerequisite
            run(cur, """UNWIND $rows AS r
                        MATCH (pre:Project {projectId:r.pre_project_id}), (post:Project {projectId:r.post_project_id})
                        CREATE (post)-[:DEPENDS_ON]->(pre)""", {"rows": b})

    def maintenance():
        for b in batches(mws):
            run(cur, """UNWIND $rows AS r
                        MATCH (f:Facility {facilityId:r.facility_id})
                        CREATE (f)-[:HAS_MAINTENANCE]->(:MaintenanceWindow {startDay:r.start_day, endDay:r.end_day,
                                                                             provenance:r.provenance})""", {"rows": b})

    for name, fn in (("source", sources), ("programs", progs), ("facilities", facs), ("crews", crew),
                     ("projects", projs), ("dependencies", dependencies), ("maintenance", maintenance)):
        step(name, fn)
    return t


QUERIES = {
    "C1": """MATCH (a:Project)-[:SCHEDULED_AT]->(f:Facility)<-[:SCHEDULED_AT]-(b:Project)
             WHERE a.projectId < b.projectId AND f.restriction IS NULL
               AND abs(a.startDay - b.startDay) <= 365
               AND NOT EXISTS { (a)-[:IN_PROGRAM]->(:Program)<-[:IN_PROGRAM]-(b) }
               AND NOT EXISTS { (a)-[:DEPENDS_ON]-(b) }
             RETURN a.projectId AS a, b.projectId AS b""",
    "C5": """MATCH (a:Project)-[:SCHEDULED_AT]->(f:Facility)<-[:SCHEDULED_AT]-(b:Project)
             WHERE a.projectId < b.projectId AND f.restriction IS NOT NULL
               AND abs(a.startDay - b.startDay) <= 365
               AND NOT EXISTS { (a)-[:IN_PROGRAM]->(:Program)<-[:IN_PROGRAM]-(b) }
               AND NOT EXISTS { (a)-[:DEPENDS_ON]-(b) }
             RETURN a.projectId AS a, b.projectId AS b""",
    "C2": """MATCH (a:Project)-[:ASSIGNED_TO]->(:Crew)<-[:ASSIGNED_TO]-(b:Project)
             WHERE a.projectId < b.projectId AND a.startDay < b.endDay AND b.startDay < a.endDay
               AND NOT EXISTS { (a)-[:SCHEDULED_AT]->(:Facility)<-[:SCHEDULED_AT]-(b) }
             RETURN a.projectId AS a, b.projectId AS b""",
    "C3": """MATCH (post:Project)-[:DEPENDS_ON]->(pre:Project)
             WHERE post.startDay < pre.endDay
             RETURN pre.projectId AS a, post.projectId AS b""",
    "C4": """MATCH (p:Project)-[:SCHEDULED_AT]->(f:Facility)-[:HAS_MAINTENANCE]->(m:MaintenanceWindow)
             WHERE p.startDay < m.endDay AND m.startDay < p.endDay
             RETURN DISTINCT p.projectId AS a, f.facilityId AS b""",
}


def verify(cur, portfolio):
    with open(os.path.join(portfolio, "truth", "ground_truth.json"), encoding="utf-8") as f:
        c = json.load(f)["classes"]
    planted = {
        "C1": {tuple(x["projects"]) for x in c["C1"]},
        "C5": {tuple(x["projects"]) for x in c["C5"]},
        "C2": {tuple(x["projects"]) for x in c["C2"]},
        "C3": {(x["pre"], x["post"]) for x in c["C3"]},
        "C4": {(x["project"], x["facility"]) for x in c["C4"]},
    }
    ok = True
    for k in ("C1", "C2", "C3", "C4", "C5"):
        s = time.perf_counter()
        rows = run(cur, QUERIES[k])
        ms = (time.perf_counter() - s) * 1000
        found = {tuple(sorted((r["a"], r["b"]))) if k in ("C1", "C2", "C5") else (r["a"], r["b"]) for r in rows}
        missing, extra = planted[k] - found, found - planted[k]
        good = not missing and not extra
        ok &= good
        print(f"{'OK ' if good else 'BAD'} {k}: planted={len(planted[k])} cypher={len(found)} "
              f"missing={len(missing)} extra={len(extra)} ({ms:.0f} ms)")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--portfolio", required=True)
    ap.add_argument("--store", required=True)
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()

    if os.path.exists(a.store):
        sys.exit(f"refusing to overwrite existing store: {a.store}")
    os.makedirs(os.path.dirname(os.path.abspath(a.store)), exist_ok=True)

    start = time.perf_counter()
    conn = relate.connect(a.store)
    cur = conn.cursor()
    n = apply_schema(cur)
    timings = load(cur, a.portfolio)
    conn.commit()
    total = time.perf_counter() - start
    counts = run(cur, "MATCH (n) RETURN count(n) AS nodes")[0]["nodes"], \
        run(cur, "MATCH ()-[r]->() RETURN count(r) AS rels")[0]["rels"]
    print(f"loaded {a.store}: schema statements={n} nodes={counts[0]} relationships={counts[1]} "
          f"total={total:.2f}s | " + ", ".join(f"{k}={v:.2f}s" for k, v in timings.items()))
    ok = verify(cur, a.portfolio) if a.verify else True
    conn.close()
    if a.verify:
        print("VERIFIED" if ok else "MISMATCH")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
