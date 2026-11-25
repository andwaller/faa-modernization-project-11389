#!/usr/bin/env python3
"""Run a tiny, explicitly simulated Relate by Neo4j schedule comparison.

Install the repository requirements, then run:
    python examples/cost_aware_schedule_trial.py

The input represents two compatible visits at one simulated facility. The
coordinated dates, time, and expenses are assumptions for demonstrating the
comparison. They are not FAA schedule or cost data, and this script is not an
optimizer. It stores the connected records in Relate by Neo4j, checks the
hand-authored alternative against the stated constraints, and compares it with
the baseline.
"""
from datetime import date, timedelta

import relate


# Every value below is SIMULATED and editable.
VISITS = [
    {
        "visit_id": "SIM-VISIT-001",
        "program_id": "SIM-PROGRAM-VOICE",
        "program": "Voice switch work",
        "facility_id": "SIM-FACILITY-001",
        "crew_id": "SIM-CREW-001",
        "baseline_start": "2027-06-08",
        "earliest_start": "2027-06-08",
        "latest_start": "2027-06-10",
        "work_days": 1,
        "crew_work_hours": 8,
        "round_trip_travel_hours": 3,
        "expense_per_mobilization_usd": 600,
        "coordination_eligible": True,
        "provenance": "SIMULATED",
    },
    {
        "visit_id": "SIM-VISIT-002",
        "program_id": "SIM-PROGRAM-DISPLAYS",
        "program": "Information display work",
        "facility_id": "SIM-FACILITY-001",
        "crew_id": "SIM-CREW-001",
        "baseline_start": "2027-06-22",
        "earliest_start": "2027-06-09",
        "latest_start": "2027-06-23",
        "work_days": 1,
        "crew_work_hours": 8,
        "round_trip_travel_hours": 3,
        "expense_per_mobilization_usd": 600,
        "coordination_eligible": True,
        "provenance": "SIMULATED",
    },
]

# The second visit moves into its allowed window beside the first visit.
# Sharing a mobilization assumes the same crew, facility, and confirmed
# compatibility of the work. Those conditions are simulated here.
SCHEDULES = {
    "Baseline": {
        "SIM-VISIT-001": {"start": "2027-06-08", "mobilization": "BASE-TRIP-1"},
        "SIM-VISIT-002": {"start": "2027-06-22", "mobilization": "BASE-TRIP-2"},
    },
    "Coordinated scenario": {
        "SIM-VISIT-001": {"start": "2027-06-08", "mobilization": "COORD-TRIP-1"},
        "SIM-VISIT-002": {"start": "2027-06-09", "mobilization": "COORD-TRIP-1"},
    },
}

LOAD_VISITS = """
UNWIND $rows AS r
MERGE (p:Program {programId: r.program_id})
  ON CREATE SET p.name = r.program, p.provenance = r.provenance
MERGE (f:Facility {facilityId: r.facility_id})
  ON CREATE SET f.provenance = r.provenance
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

READ_VISITS = """
MATCH (v:Visit)-[:IN_PROGRAM]->(p:Program),
      (v)-[:SCHEDULED_AT]->(f:Facility),
      (v)-[:ASSIGNED_TO]->(c:Crew)
RETURN v.visitId AS visitId,
       p.name AS program,
       f.facilityId AS facilityId,
       c.crewId AS crewId,
       v.baselineStart AS baselineStart,
       v.earliestStart AS earliestStart,
       v.latestStart AS latestStart,
       v.workDays AS workDays,
       v.crewWorkHours AS crewWorkHours,
       v.roundTripTravelHours AS roundTripTravelHours,
       v.expensePerMobilizationUsd AS expensePerMobilizationUsd,
       v.coordinationEligible AS coordinationEligible,
       v.provenance AS provenance
ORDER BY visitId
"""


def as_date(value):
    return date.fromisoformat(value)


def load_graph():
    conn = relate.connect(":memory:")
    conn.execute(LOAD_VISITS, {"rows": VISITS})
    rows = conn.execute(READ_VISITS).fetchall()
    return conn, {row["visitId"]: dict(row) for row in rows}


def check_schedule(schedule, visits):
    """Check dates, crew overlap, and the declared shared-mobilization rule."""
    errors = []

    for visit_id, assignment in schedule.items():
        visit = visits[visit_id]
        start = as_date(assignment["start"])
        if not as_date(visit["earliestStart"]) <= start <= as_date(visit["latestStart"]):
            errors.append(f"{visit_id} starts outside its allowed window")

    ids = list(schedule)
    for i, left_id in enumerate(ids):
        left = visits[left_id]
        left_start = as_date(schedule[left_id]["start"])
        left_end = left_start + timedelta(days=int(left["workDays"]))
        for right_id in ids[i + 1:]:
            right = visits[right_id]
            right_start = as_date(schedule[right_id]["start"])
            right_end = right_start + timedelta(days=int(right["workDays"]))
            if left["crewId"] == right["crewId"] and left_start < right_end and right_start < left_end:
                errors.append(f"{left_id} and {right_id} overlap for the same crew")

    grouped = {}
    for visit_id, assignment in schedule.items():
        grouped.setdefault(assignment["mobilization"], []).append(visit_id)

    for visit_ids in grouped.values():
        if len(visit_ids) < 2:
            continue
        group_visits = [visits[visit_id] for visit_id in visit_ids]
        same_site = len({v["facilityId"] for v in group_visits}) == 1
        same_crew = len({v["crewId"] for v in group_visits}) == 1
        eligible = all(bool(v["coordinationEligible"]) for v in group_visits)
        dates = sorted(as_date(schedule[visit_id]["start"]) for visit_id in visit_ids)
        adjacent = all((b - a).days <= 1 for a, b in zip(dates, dates[1:]))
        if not (same_site and same_crew and eligible and adjacent):
            errors.append(
                f"shared mobilization {schedule[visit_ids[0]]['mobilization']} "
                "fails the simulated site, crew, eligibility, or date rule"
            )

    return errors


def metrics(schedule, visits):
    errors = check_schedule(schedule, visits)
    if errors:
        raise ValueError("; ".join(errors))

    trip_ids = {assignment["mobilization"] for assignment in schedule.values()}
    visits_by_trip = {}
    for visit_id, assignment in schedule.items():
        visits_by_trip.setdefault(assignment["mobilization"], []).append(visit_id)

    travel_hours = 0
    direct_expenses = 0
    for trip_visit_ids in visits_by_trip.values():
        # Same simulated crew and site share one round trip and one mobilization.
        first = visits[trip_visit_ids[0]]
        travel_hours += int(first["roundTripTravelHours"])
        direct_expenses += int(first["expensePerMobilizationUsd"])

    work_hours = sum(int(visits[visit_id]["crewWorkHours"]) for visit_id in schedule)
    finish = max(
        as_date(assignment["start"]) + timedelta(days=int(visits[visit_id]["workDays"]))
        for visit_id, assignment in schedule.items()
    )
    return {
        "mobilizations": len(trip_ids),
        "crew_work_hours": work_hours,
        "crew_travel_hours": travel_hours,
        "direct_expenses_usd": direct_expenses,
        "finish_date": finish.isoformat(),
    }


def main():
    conn, visits = load_graph()
    try:
        print("Relate by Neo4j returned these connected visits:")
        for visit_id, visit in visits.items():
            print(f"  {visit_id}: {visit['program']} at {visit['facilityId']} "
                  f"({visit['provenance']})")

        results = {}
        for name, schedule in SCHEDULES.items():
            results[name] = metrics(schedule, visits)

        print("\nSIMULATED comparison (assumptions in this file):")
        for name, result in results.items():
            print(f"\n{name}")
            for metric, value in result.items():
                print(f"  {metric}: {value}")

        baseline = results["Baseline"]
        coordinated = results["Coordinated scenario"]
        print("\nChange from baseline to coordinated scenario")
        print(f"  mobilizations: {baseline['mobilizations'] - coordinated['mobilizations']} fewer")
        print(f"  crew work hours: {coordinated['crew_work_hours'] - baseline['crew_work_hours']:+d}")
        print(f"  crew travel hours: {coordinated['crew_travel_hours'] - baseline['crew_travel_hours']:+d}")
        print(f"  direct expenses: "
              f"${coordinated['direct_expenses_usd'] - baseline['direct_expenses_usd']:+d}")
        print("  schedule dates and expense rates are illustrative, not FAA data.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
