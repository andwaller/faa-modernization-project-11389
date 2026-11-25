#!/usr/bin/env python3
"""Compare a baseline with a constraint-aware schedule search using Relate by Neo4j.

Install the repository requirements, then run:
    python examples/cost_aware_schedule_trial.py

The four-visit scenario is explicitly SIMULATED. The small exhaustive search
checks task windows, facility access, a maintenance closure, dependencies, crew
overlap, and the rules for sharing a mobilization. It chooses the feasible
schedule with the lowest modeled direct expense, then travel hours, then finish
date. This is a teaching prototype, not a production optimizer or FAA schedule.
"""
from datetime import date, timedelta
from itertools import product

import relate


# Every value below is SIMULATED and editable.
VISITS = [
    {
        "visit_id": "SIM-VISIT-001",
        "program_id": "SIM-PROGRAM-VOICE",
        "program": "Voice switch work",
        "facility_id": "SIM-FACILITY-001",
        "facility_access_start": "2027-06-08",
        "facility_access_end": "2027-06-30",
        "crew_id": "SIM-CREW-001",
        "baseline_start": "2027-06-08",
        "earliest_start": "2027-06-08",
        "latest_start": "2027-06-10",
        "work_days": 1,
        "crew_work_hours": 8,
        "round_trip_travel_hours": 3,
        "expense_per_mobilization_usd": 600,
        "coordination_eligible": True,
        "depends_on": [],
        "provenance": "SIMULATED",
    },
    {
        "visit_id": "SIM-VISIT-002",
        "program_id": "SIM-PROGRAM-DISPLAYS",
        "program": "Information display work",
        "facility_id": "SIM-FACILITY-001",
        "facility_access_start": "2027-06-08",
        "facility_access_end": "2027-06-30",
        "crew_id": "SIM-CREW-001",
        "baseline_start": "2027-06-22",
        "earliest_start": "2027-06-09",
        "latest_start": "2027-06-23",
        "work_days": 1,
        "crew_work_hours": 8,
        "round_trip_travel_hours": 3,
        "expense_per_mobilization_usd": 600,
        "coordination_eligible": True,
        "depends_on": ["SIM-VISIT-001"],
        "provenance": "SIMULATED",
    },
    {
        "visit_id": "SIM-VISIT-003",
        "program_id": "SIM-PROGRAM-DISPLAYS",
        "program": "Information display validation",
        "facility_id": "SIM-FACILITY-001",
        "facility_access_start": "2027-06-08",
        "facility_access_end": "2027-06-30",
        "crew_id": "SIM-CREW-001",
        "baseline_start": "2027-06-24",
        "earliest_start": "2027-06-10",
        "latest_start": "2027-06-30",
        "work_days": 1,
        "crew_work_hours": 4,
        "round_trip_travel_hours": 3,
        "expense_per_mobilization_usd": 600,
        "coordination_eligible": True,
        "depends_on": ["SIM-VISIT-002"],
        "provenance": "SIMULATED",
    },
    {
        "visit_id": "SIM-VISIT-004",
        "program_id": "SIM-PROGRAM-RADIO",
        "program": "Radio site work",
        "facility_id": "SIM-FACILITY-002",
        "facility_access_start": "2027-06-16",
        "facility_access_end": "2027-06-22",
        "crew_id": "SIM-CREW-002",
        "baseline_start": "2027-06-19",
        "earliest_start": "2027-06-16",
        "latest_start": "2027-06-20",
        "work_days": 1,
        "crew_work_hours": 6,
        "round_trip_travel_hours": 4,
        "expense_per_mobilization_usd": 800,
        "coordination_eligible": True,
        "depends_on": [],
        "provenance": "SIMULATED",
    },
]

# Half-open interval: the site is closed for all of June 18 and open again June 19.
MAINTENANCE_WINDOWS = [
    {
        "window_id": "SIM-MAINT-001",
        "facility_id": "SIM-FACILITY-002",
        "start": "2027-06-18",
        "end_exclusive": "2027-06-19",
        "provenance": "SIMULATED",
    }
]

LOAD_VISITS = """
UNWIND $rows AS r
MERGE (p:Program {programId: r.program_id})
  ON CREATE SET p.name = r.program, p.provenance = r.provenance
MERGE (f:Facility {facilityId: r.facility_id})
  ON CREATE SET f.accessStart = r.facility_access_start,
                f.accessEnd = r.facility_access_end,
                f.provenance = r.provenance
MERGE (c:Crew {crewId: r.crew_id})
  ON CREATE SET c.provenance = r.provenance
CREATE (v:Visit {
  visitId: r.visit_id,
  baselineStart: r.baseline_start,
  earliestStart: r.earliest_start,
  latestStart: r.latest_start,
  workDays: r.work_days,
  crewWorkHours: r.crew_work_hours,
  roundTripTravelHours: r.round_trip_travel_hours,
  expensePerMobilizationUsd: r.expense_per_mobilization_usd,
  coordinationEligible: r.coordination_eligible,
  provenance: r.provenance
})
CREATE (v)-[:IN_PROGRAM]->(p)
CREATE (v)-[:SCHEDULED_AT]->(f)
CREATE (v)-[:ASSIGNED_TO]->(c)
"""

LOAD_DEPENDENCIES = """
UNWIND $rows AS r
MATCH (v:Visit {visitId: r.visit_id})
UNWIND r.prerequisites AS prerequisiteId
MATCH (pre:Visit {visitId: prerequisiteId})
MERGE (v)-[:DEPENDS_ON]->(pre)
"""

LOAD_MAINTENANCE = """
UNWIND $rows AS r
MATCH (f:Facility {facilityId: r.facility_id})
CREATE (m:MaintenanceWindow {
  windowId: r.window_id,
  start: r.start,
  endExclusive: r.end_exclusive,
  provenance: r.provenance
})
CREATE (f)-[:HAS_MAINTENANCE]->(m)
"""

READ_VISITS = """
MATCH (v:Visit)-[:IN_PROGRAM]->(p:Program),
      (v)-[:SCHEDULED_AT]->(f:Facility),
      (v)-[:ASSIGNED_TO]->(c:Crew)
OPTIONAL MATCH (v)-[:DEPENDS_ON]->(pre:Visit)
RETURN v.visitId AS visitId,
       p.name AS program,
       f.facilityId AS facilityId,
       f.accessStart AS facilityAccessStart,
       f.accessEnd AS facilityAccessEnd,
       c.crewId AS crewId,
       v.baselineStart AS baselineStart,
       v.earliestStart AS earliestStart,
       v.latestStart AS latestStart,
       v.workDays AS workDays,
       v.crewWorkHours AS crewWorkHours,
       v.roundTripTravelHours AS roundTripTravelHours,
       v.expensePerMobilizationUsd AS expensePerMobilizationUsd,
       v.coordinationEligible AS coordinationEligible,
       collect(DISTINCT pre.visitId) AS dependsOn,
       v.provenance AS provenance
ORDER BY visitId
"""

READ_MAINTENANCE = """
MATCH (f:Facility)-[:HAS_MAINTENANCE]->(m:MaintenanceWindow)
RETURN f.facilityId AS facilityId,
       m.start AS start,
       m.endExclusive AS endExclusive
ORDER BY facilityId, start
"""


def as_date(value):
    return date.fromisoformat(value)


def load_graph():
    conn = relate.connect(":memory:")
    conn.execute(LOAD_VISITS, {"rows": VISITS})
    dependency_rows = [
        {"visit_id": row["visit_id"], "prerequisites": row["depends_on"]}
        for row in VISITS if row["depends_on"]
    ]
    if dependency_rows:
        conn.execute(LOAD_DEPENDENCIES, {"rows": dependency_rows})
    if MAINTENANCE_WINDOWS:
        conn.execute(LOAD_MAINTENANCE, {"rows": MAINTENANCE_WINDOWS})

    rows = conn.execute(READ_VISITS).fetchall()
    windows = conn.execute(READ_MAINTENANCE).fetchall()
    windows_by_facility = {}
    for row in windows:
        windows_by_facility.setdefault(row["facilityId"], []).append(
            {"start": row["start"], "endExclusive": row["endExclusive"]}
        )
    visits = {row["visitId"]: dict(row) for row in rows}
    for visit in visits.values():
        visit["maintenanceWindows"] = windows_by_facility.get(visit["facilityId"], [])
    return conn, visits


def check_schedule(schedule, visits):
    """Check task dates, facility access/closures, dependencies, and crew overlap."""
    errors = []
    if set(schedule) != set(visits):
        return ["schedule must include every visit exactly once"]

    for visit_id, start_text in schedule.items():
        visit = visits[visit_id]
        start = as_date(start_text)
        end_exclusive = start + timedelta(days=int(visit["workDays"]))
        last_workday = end_exclusive - timedelta(days=1)

        if not as_date(visit["earliestStart"]) <= start <= as_date(visit["latestStart"]):
            errors.append(f"{visit_id} starts outside its allowed task window")
        if start < as_date(visit["facilityAccessStart"]) or last_workday > as_date(visit["facilityAccessEnd"]):
            errors.append(f"{visit_id} falls outside facility access dates")

        for window in visit["maintenanceWindows"]:
            closed_start = as_date(window["start"])
            closed_end_exclusive = as_date(window["endExclusive"])
            if start < closed_end_exclusive and closed_start < end_exclusive:
                errors.append(f"{visit_id} overlaps facility maintenance")

        for prerequisite_id in visit["dependsOn"]:
            if prerequisite_id not in schedule:
                errors.append(f"{visit_id} has a missing prerequisite: {prerequisite_id}")
                continue
            prerequisite = visits[prerequisite_id]
            prerequisite_end = as_date(schedule[prerequisite_id]) + timedelta(
                days=int(prerequisite["workDays"])
            )
            if start < prerequisite_end:
                errors.append(f"{visit_id} starts before prerequisite {prerequisite_id} finishes")

    ids = list(schedule)
    for i, left_id in enumerate(ids):
        left = visits[left_id]
        left_start = as_date(schedule[left_id])
        left_end_exclusive = left_start + timedelta(days=int(left["workDays"]))
        for right_id in ids[i + 1:]:
            right = visits[right_id]
            right_start = as_date(schedule[right_id])
            right_end_exclusive = right_start + timedelta(days=int(right["workDays"]))
            overlaps = left_start < right_end_exclusive and right_start < left_end_exclusive
            if left["crewId"] == right["crewId"] and overlaps:
                errors.append(f"{left_id} and {right_id} overlap for the same crew")

    return errors


def mobilization_groups(schedule, visits):
    """Group consecutive eligible visits sharing a crew and facility."""
    ordered = sorted(
        schedule,
        key=lambda visit_id: (
            visits[visit_id]["crewId"],
            visits[visit_id]["facilityId"],
            as_date(schedule[visit_id]),
            visit_id,
        ),
    )
    groups = []
    for visit_id in ordered:
        visit = visits[visit_id]
        start = as_date(schedule[visit_id])
        can_join = False
        if groups:
            group = groups[-1]
            previous = visits[group[-1]]
            previous_end_exclusive = max(
                as_date(schedule[item]) + timedelta(days=int(visits[item]["workDays"]))
                for item in group
            )
            can_join = (
                visit["facilityId"] == previous["facilityId"]
                and visit["crewId"] == previous["crewId"]
                and bool(visit["coordinationEligible"])
                and all(bool(visits[item]["coordinationEligible"]) for item in group)
                and start <= previous_end_exclusive
            )
        if can_join:
            groups[-1].append(visit_id)
        else:
            groups.append([visit_id])
    return groups


def metrics(schedule, visits):
    errors = check_schedule(schedule, visits)
    if errors:
        raise ValueError("; ".join(errors))

    groups = mobilization_groups(schedule, visits)
    travel_hours = 0
    direct_expenses = 0
    for group in groups:
        group_visits = [visits[visit_id] for visit_id in group]
        travel_rates = {int(visit["roundTripTravelHours"]) for visit in group_visits}
        expense_rates = {int(visit["expensePerMobilizationUsd"]) for visit in group_visits}
        if len(travel_rates) != 1 or len(expense_rates) != 1:
            raise ValueError("visits in one mobilization must share the same simulated trip assumptions")
        travel_hours += travel_rates.pop()
        direct_expenses += expense_rates.pop()

    work_hours = sum(int(visit["crewWorkHours"]) for visit in visits.values())
    finish = max(
        as_date(schedule[visit_id]) + timedelta(days=int(visits[visit_id]["workDays"]) - 1)
        for visit_id in schedule
    )
    return {
        "mobilizations": len(groups),
        "crew_work_hours": work_hours,
        "crew_travel_hours": travel_hours,
        "direct_expenses_usd": direct_expenses,
        "finish_date": finish.isoformat(),
    }


def candidate_starts(visit):
    first = max(as_date(visit["earliestStart"]), as_date(visit["facilityAccessStart"]))
    latest_by_access = as_date(visit["facilityAccessEnd"]) - timedelta(
        days=int(visit["workDays"]) - 1
    )
    last = min(as_date(visit["latestStart"]), latest_by_access)
    if last < first:
        return []
    count = (last - first).days
    candidates = []
    for offset in range(count + 1):
        start = first + timedelta(days=offset)
        end_exclusive = start + timedelta(days=int(visit["workDays"]))
        overlaps_maintenance = any(
            start < as_date(window["endExclusive"])
            and as_date(window["start"]) < end_exclusive
            for window in visit["maintenanceWindows"]
        )
        if not overlaps_maintenance:
            candidates.append(start.isoformat())
    return candidates


def optimize_schedule(visits):
    """Exhaustively search this small example; use a solver for larger schedules."""
    visit_ids = sorted(visits)
    options = [candidate_starts(visits[visit_id]) for visit_id in visit_ids]
    if any(not dates for dates in options):
        raise ValueError("a visit has no allowed dates after applying facility constraints")

    best = None
    for starts in product(*options):
        schedule = dict(zip(visit_ids, starts))
        if check_schedule(schedule, visits):
            continue
        result = metrics(schedule, visits)
        # Prioritize direct expense, then crew travel time, then finish date.
        score = (
            result["direct_expenses_usd"],
            result["crew_travel_hours"],
            result["finish_date"],
        )
        if best is None or score < best[0]:
            best = (score, schedule, result)
    if best is None:
        raise ValueError("no feasible schedule exists within the supplied constraints")
    return best[1], best[2]


def show_schedule(name, schedule, visits, result):
    print(f"\n{name}")
    for visit_id in sorted(schedule):
        visit = visits[visit_id]
        print(f"  {visit['program']}: {schedule[visit_id]} "
              f"(allowed {visit['earliestStart']} to {visit['latestStart']})")
    for metric, value in result.items():
        print(f"  {metric}: {value}")


def main():
    conn, visits = load_graph()
    try:
        print("Relate by Neo4j returned these connected visits:")
        for visit_id, visit in visits.items():
            print(f"  {visit_id}: {visit['program']} at {visit['facilityId']} "
                  f"depends on {visit['dependsOn']} ({visit['provenance']})")

        baseline = {
            visit_id: visit["baselineStart"]
            for visit_id, visit in visits.items()
        }
        baseline_result = metrics(baseline, visits)
        optimized, optimized_result = optimize_schedule(visits)

        print("\nSIMULATED comparison (assumptions in this file):")
        show_schedule("Baseline", baseline, visits, baseline_result)
        show_schedule("Lowest-expense feasible scenario", optimized, visits, optimized_result)

        print("\nChange from baseline to selected scenario")
        print(f"  mobilizations: "
              f"{baseline_result['mobilizations'] - optimized_result['mobilizations']} fewer")
        print(f"  crew work hours: "
              f"{optimized_result['crew_work_hours'] - baseline_result['crew_work_hours']:+d}")
        print(f"  crew travel hours: "
              f"{optimized_result['crew_travel_hours'] - baseline_result['crew_travel_hours']:+d}")
        print(f"  direct expenses: "
              f"{optimized_result['direct_expenses_usd'] - baseline_result['direct_expenses_usd']:+d} USD")
        print(f"  finish date: {baseline_result['finish_date']} to "
              f"{optimized_result['finish_date']}")
        print("  all dates and expense rates are illustrative, not FAA data.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
