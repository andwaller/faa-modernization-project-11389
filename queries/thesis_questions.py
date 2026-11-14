#!/usr/bin/env python3
"""Thesis questions for Project 11,389, answered in Cypher against a Relate store.

Usage:
    python queries/thesis_questions.py --store store/my_store.rl

The store is never modified. The what-if steps run on a temporary copy.
All portfolio results are SIMULATED. Only the pace table uses documented figures
(GAO-26-107992 Table 2 scope and dates; FAA Modern Skies counts as of 2026-10-15,
which are FAA self-reported).
"""
import argparse
import os
import shutil
import tempfile

import relate

# Same-facility, cross-program visits within 12 months, no dependency between them.
PAIRS = """MATCH (a:Project)-[:SCHEDULED_AT]->(f:Facility)<-[:SCHEDULED_AT]-(b:Project)
WHERE a.projectId < b.projectId AND abs(a.startDay - b.startDay) <= 365
  AND NOT EXISTS { (a)-[:IN_PROGRAM]->(:Program)<-[:IN_PROGRAM]-(b) }
  AND NOT EXISTS { (a)-[:DEPENDS_ON]-(b) }"""

Q = {
    "1. Sites by number of programs": """
MATCH (f:Facility)<-[:SCHEDULED_AT]-(p:Project)-[:IN_PROGRAM]->(g:Program)
WITH f, count(DISTINCT g) AS programs, count(p) AS projects
RETURN programs, count(f) AS facilities, sum(projects) AS projects ORDER BY programs""",

    "2. Duplicate visits: flagged without site restrictions vs. truly mergeable": PAIRS + """
RETURN count(*) AS flagged,
       sum(CASE WHEN f.restriction IS NULL THEN 1 ELSE 0 END) AS mergeable,
       sum(CASE WHEN f.restriction IS NOT NULL THEN 1 ELSE 0 END) AS falseAlarms""",

    "3. Site-days for mergeable pairs: separate vs. one concurrent visit": PAIRS + """
  AND f.restriction IS NULL
WITH a.endDay - a.startDay AS da, b.endDay - b.startDay AS db, abs(a.startDay - b.startDay) AS gap
RETURN count(*) AS pairs, round(avg(gap)) AS avgGapDays, sum(da + db) AS separateSiteDays,
       sum(CASE WHEN da > db THEN da ELSE db END) AS concurrentSiteDays""",

    "4. Dependencies that cross program lines": """
MATCH (d:Project)-[:DEPENDS_ON]->(p:Project)
MATCH (d)-[:IN_PROGRAM]->(gd:Program), (p)-[:IN_PROGRAM]->(gp:Program)
RETURN gd <> gp AS crossProgram, count(*) AS dependencies""",
}

# If every chain head slips by $delay days, what moves downstream (slack-aware)?
SLIP = """MATCH (h:Project)
WHERE EXISTS { (:Project)-[:DEPENDS_ON]->(h) } AND NOT EXISTS { (h)-[:DEPENDS_ON]->() }
MATCH path = (d:Project)-[:DEPENDS_ON*1..]->(h)
WITH d, reverse(nodes(path)) AS ns
WITH d, reduce(s = $delay, i IN range(1, size(ns) - 1) |
       CASE WHEN s <= 0 THEN 0
            WHEN ns[i-1].endDay + s - ns[i].startDay > 0 THEN ns[i-1].endDay + s - ns[i].startDay
            ELSE 0 END) AS shift
WHERE shift > 0
RETURN count(*) AS projectsPushed, sum(shift) AS totalSlipDays,
       sum(CASE WHEN d.endDay + shift > d.deadlineDay THEN 1 ELSE 0 END) AS pushedPastDeadline"""

CREW = """MATCH (a:Project)-[:ASSIGNED_TO]->(:Crew)<-[:ASSIGNED_TO]-(b:Project)
WHERE a.projectId < b.projectId AND a.startDay < b.endDay AND b.startDay < a.endDay
  AND NOT EXISTS { (a)-[:SCHEDULED_AT]->(:Facility)<-[:SCHEDULED_AT]-(b) }
RETURN count(*) AS crewConflicts"""

MERGE = PAIRS + """
  AND f.restriction IS NULL
WITH CASE WHEN a.startDay < b.startDay THEN a ELSE b END AS early,
     CASE WHEN a.startDay < b.startDay THEN b ELSE a END AS late
WITH early, late, late.startDay - early.startDay AS shift
SET late.endDay = late.endDay - shift, late.startDay = early.startDay,
    late.provenance = 'HYPOTHESIS', late.mergedWith = early.projectId
RETURN count(*) AS visitsMerged"""

# FAA Modern Skies, self-reported, as of 2026-10-15 (day 287; day 0 = 2026-01-01).
DONE = [{"n": "Telecommunications", "d": 3508}, {"n": "Radios", "d": 457},
        {"n": "Voice switches", "d": 220}, {"n": "Radars", "d": 15},
        {"n": "Information displays", "d": 0}]
PACE = """UNWIND $rows AS r MATCH (g:Program {name: r.n})
RETURN g.name AS program, g.plannedScope AS scope, r.d AS done, g.completionDate AS due,
       round(10.0 * (g.plannedScope - r.d) / ((g.completionDay - 287) / 30.44)) / 10 AS neededPerMonth
ORDER BY neededPerMonth DESC"""


def run(cur, cypher, params=None):
    cur.execute(cypher, params or {})
    return cur.fetchall()


def show(title, rows):
    print("\n" + title)
    for r in rows:
        print("  ", dict(r))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--store", required=True)
    a = ap.parse_args()

    tmp = tempfile.mkdtemp()
    work = os.path.join(tmp, "whatif.rl")
    shutil.copy(a.store, work)  # never touch the original
    conn = relate.connect(work)
    cur = conn.cursor()

    for title, cypher in Q.items():
        show(title + " [SIMULATED]", run(cur, cypher))
    for delay in (30, 60, 180):
        show(f"5. Every chain head slips {delay} days [SIMULATED]", run(cur, SLIP, {"delay": delay}))

    show("6. What-if: crew conflicts before merging [SIMULATED]", run(cur, CREW))
    show("   merge every mergeable duplicate visit [HYPOTHESIS]", run(cur, MERGE))
    show("   crew conflicts after merging [HYPOTHESIS]", run(cur, CREW))

    show("7. Required pace to hit GAO Table 2 dates [DOCUMENTED inputs, INFERRED pace]",
         run(cur, PACE, {"rows": DONE}))

    conn.close()
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
