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
        "activity": "Voice switch site preparation",
        "required_skills": ["telecommunications", "voice-switch"],
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
        "coordination_eligible": True,
        "depends_on": [],
        "provenance": "SIMULATED",
    },
    {
        "visit_id": "SIM-VISIT-002",
        "program_id": "SIM-PROGRAM-DISPLAYS",
        "program": "Information display work",
        "activity": "Information display site preparation",
        "required_skills": ["telecommunications", "information-display"],
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
        "coordination_eligible": True,
        "depends_on": ["SIM-VISIT-001"],
        "provenance": "SIMULATED",
    },
    {
        "visit_id": "SIM-VISIT-003",
        "program_id": "SIM-PROGRAM-DISPLAYS",
        "program": "Information display work",
        "activity": "Information display validation",
        "required_skills": ["telecommunications", "information-display"],
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
        "coordination_eligible": True,
        "depends_on": ["SIM-VISIT-002"],
        "provenance": "SIMULATED",
    },
    {
        "visit_id": "SIM-VISIT-004",
        "program_id": "SIM-PROGRAM-RADIO",
        "program": "Radio site work",
        "activity": "Radio site work",
        "required_skills": ["telecommunications", "radio"],
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
        "coordination_eligible": True,
        "depends_on": [],
        "provenance": "SIMULATED",
    },
]


# Planning estimate only. These are public wage/travel benchmarks, not FAA or
# L3Harris contract rates. See docs/cost-aware-schedule-prototype.md.
COST_ASSUMPTIONS = {
    "wages": {
        "telecom_technician_usd_per_hour": 32.51,  # BLS May 2025 median
        "engineering_technician_annual_usd": 78190,  # BLS May 2025 median
        "annual_hours": 2080,
    },
    # GSA CALC+ BLS average-rate build-up guidance.
    "burden": {
        "fringe": 0.35,
        "government_site_overhead": 0.25,
        "contractor_site_overhead": 0.50,
        "general_and_administrative": 0.15,
        "fee_or_profit": 0.10,
    },
    # SIMULATED crew mix for each synthetic crew.
    "crew_profiles": {
        "SIM-CREW-001": {"telecom_technicians": 2, "engineering_technicians": 1, "skills": ["telecommunications", "voice-switch", "information-display"]},
        "SIM-CREW-002": {"telecom_technicians": 2, "engineering_technicians": 1, "skills": ["telecommunications", "radio"]},
    },
    # FY 2027 St. Louis per diem used only as a travel-cost benchmark.
    "travel": {
        "locality": "St. Louis, MO (benchmark; simulated facilities are not mapped)",
        "lodging_per_person_night_usd": 156,
        "mie_full_day_per_person_usd": 86,
        "mie_first_or_last_day_per_person_usd": 64.50,
        "overnight_model": (
            "one night for a standalone one-day visit; for a grouped multi-day "
            "deployment, nights equal work-span days minus one"
        ),
    },
    # Route, vehicle, rental, airfare, shipping, test equipment, overtime, and
    # any contract-specific fixed mobilization fee are unpriced and excluded.
}

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
  ON CREATE SET c.provenance = r.provenance, c.skills = r.crew_skills
CREATE (v:Visit {
  visitId: r.visit_id,
  activity: r.activity,
  baselineStart: r.baseline_start,
  earliestStart: r.earliest_start,
  latestStart: r.latest_start,
  workDays: r.work_days,
  crewWorkHours: r.crew_work_hours,
  roundTripTravelHours: r.round_trip_travel_hours,
  coordinationEligible: r.coordination_eligible,
  requiredSkills: r.required_skills,
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
       v.activity AS activity,
       v.requiredSkills AS requiredSkills,
       c.skills AS crewSkills,
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
    crew_skills = {crew_id: profile["skills"] for crew_id, profile in COST_ASSUMPTIONS["crew_profiles"].items()}
    # Crew capability data is simulated, not a qualification record.
    visit_rows = [
        {**visit, "crew_skills": crew_skills[visit["crew_id"]]}
        for visit in VISITS
    ]
    conn.execute(LOAD_VISITS, {"rows": visit_rows})
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
    """Check dates, access, dependencies, crew overlap, and simulated skill fit."""
    errors = []
    if set(schedule) != set(visits):
        return ["schedule must include every visit exactly once"]

    for visit_id, start_text in schedule.items():
        visit = visits[visit_id]
        start = as_date(start_text)
        end_exclusive = start + timedelta(days=int(visit["workDays"]))
        last_workday = end_exclusive - timedelta(days=1)

        if not set(visit["requiredSkills"]).issubset(set(visit["crewSkills"])):
            errors.append(f"{visit_id} crew lacks required simulated skills")
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


def loaded_rates(overhead_key):
    """Build indicative loaded rates using GSA CALC+ average assumptions."""
    wages = COST_ASSUMPTIONS["wages"]
    burden = COST_ASSUMPTIONS["burden"]
    engineering_wage = wages["engineering_technician_annual_usd"] / wages["annual_hours"]
    overhead = burden[overhead_key]
    multiplier = (
        (1 + burden["fringe"])
        * (1 + overhead)
        * (1 + burden["general_and_administrative"])
        * (1 + burden["fee_or_profit"])
    )
    return {
        "telecom_technician": wages["telecom_technician_usd_per_hour"] * multiplier,
        "engineering_technician": engineering_wage * multiplier,
    }


def crew_hour_rate(crew_id, rates):
    profile = COST_ASSUMPTIONS["crew_profiles"][crew_id]
    return (
        profile["telecom_technicians"] * rates["telecom_technician"]
        + profile["engineering_technicians"] * rates["engineering_technician"]
    )


def trip_allowance(group, schedule, visits, scenario):
    """Estimate lodging and M&IE under the named itinerary assumption."""
    if not scenario["overnight"]:
        # Local day trips assume no hotel or reimbursed M&IE; mileage/vehicle
        # costs remain unpriced in every scenario.
        return 0
    first_start = min(as_date(schedule[item]) for item in group)
    last_end_exclusive = max(
        as_date(schedule[item]) + timedelta(days=int(visits[item]["workDays"]))
        for item in group
    )
    work_span_days = (last_end_exclusive - first_start).days
    profile = COST_ASSUMPTIONS["crew_profiles"][visits[group[0]]["crewId"]]
    traveler_count = profile["telecom_technicians"] + profile["engineering_technicians"]
    travel = COST_ASSUMPTIONS["travel"]

    # A one-day dispatch is modeled as one overnight trip. A grouped, consecutive
    # deployment keeps the crew at the site and uses one fewer hotel night than
    # work-span days.
    nights = 1 if work_span_days == 1 else max(1, work_span_days - 1)
    mie_days = 2 if work_span_days == 1 else work_span_days
    mie = 2 * travel["mie_first_or_last_day_per_person_usd"]
    mie += max(0, mie_days - 2) * travel["mie_full_day_per_person_usd"]
    lodging_cost = nights * traveler_count * travel["lodging_per_person_night_usd"]
    mie_cost = traveler_count * mie
    return lodging_cost + mie_cost


SCENARIOS = {
    "local_day_trip_billable": {"overnight": False, "travel_time_billable": True, "label": "Local day trips; travel time billable"},
    "local_day_trip_nonbillable": {"overnight": False, "travel_time_billable": False, "label": "Local day trips; travel time nonbillable"},
    "overnight_billable": {"overnight": True, "travel_time_billable": True, "label": "Overnight travel; travel time billable"},
    "overnight_nonbillable": {"overnight": True, "travel_time_billable": False, "label": "Overnight travel; travel time nonbillable"},
}

def metrics(schedule, visits, scenario=SCENARIOS["overnight_billable"]):
    errors = check_schedule(schedule, visits)
    if errors:
        raise ValueError("; ".join(errors))

    groups = mobilization_groups(schedule, visits)
    rates_low = loaded_rates("government_site_overhead")
    rates_high = loaded_rates("contractor_site_overhead")
    work_cost_low = 0.0
    work_cost_high = 0.0
    travel_labor_low = 0.0
    travel_labor_high = 0.0
    lodging_mie = 0.0
    travel_hours = 0

    for visit in visits.values():
        # crew_work_hours are treated as team clock-hours, then priced for each
        # assumed crew member. This is a simulated interpretation of the field.
        work_cost_low += int(visit["crewWorkHours"]) * crew_hour_rate(visit["crewId"], rates_low)
        work_cost_high += int(visit["crewWorkHours"]) * crew_hour_rate(visit["crewId"], rates_high)

    for group in groups:
        group_visits = [visits[visit_id] for visit_id in group]
        travel_rates = {int(visit["roundTripTravelHours"]) for visit in group_visits}
        if len(travel_rates) != 1:
            raise ValueError("visits in one mobilization must share the same simulated trip time")
        group_travel_hours = travel_rates.pop()
        crew_id = group_visits[0]["crewId"]
        travel_hours += group_travel_hours
        if scenario["travel_time_billable"]:
            travel_labor_low += group_travel_hours * crew_hour_rate(crew_id, rates_low)
            travel_labor_high += group_travel_hours * crew_hour_rate(crew_id, rates_high)
        lodging_mie += trip_allowance(group, schedule, visits, scenario)

    finish = max(
        as_date(schedule[visit_id]) + timedelta(days=int(visits[visit_id]["workDays"]) - 1)
        for visit_id in schedule
    )
    total_low = work_cost_low + travel_labor_low + lodging_mie
    total_high = work_cost_high + travel_labor_high + lodging_mie
    return {
        "mobilizations": len(groups),
        "crew_work_hours": sum(int(visit["crewWorkHours"]) for visit in visits.values()),
        "crew_travel_hours": travel_hours,
        "task_labor_low_usd": round(work_cost_low),
        "task_labor_high_usd": round(work_cost_high),
        "travel_labor_low_usd": round(travel_labor_low),
        "travel_labor_high_usd": round(travel_labor_high),
        "lodging_and_mie_usd": round(lodging_mie),
        "modeled_total_cost_low_usd": round(total_low),
        "modeled_total_cost_high_usd": round(total_high),
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


def optimize_schedule(visits, scenario=SCENARIOS["overnight_billable"]):
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
        result = metrics(schedule, visits, scenario)
        # Prioritize modeled total cost, then crew travel time, then finish date.
        score = (
            result["modeled_total_cost_low_usd"],
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
        print(f"  {visit['activity']}: {schedule[visit_id]} "
              f"(allowed {visit['earliestStart']} to {visit['latestStart']})")
    print(f"  mobilizations: {result['mobilizations']}")
    print(f"  crew work hours: {result['crew_work_hours']}")
    print(f"  crew travel hours: {result['crew_travel_hours']}")
    print(f"  task labor estimate: ${result['task_labor_low_usd']:,}–${result['task_labor_high_usd']:,}")
    print(f"  travel labor: ${result['travel_labor_low_usd']:,}–${result['travel_labor_high_usd']:,}")
    print(f"  lodging and M&IE: ${result['lodging_and_mie_usd']:,}")
    print(f"  modeled total: ${result['modeled_total_cost_low_usd']:,}–${result['modeled_total_cost_high_usd']:,}")
    print(f"  finish date: {result['finish_date']}")


def main():
    conn, visits = load_graph()
    try:
        print("Relate by Neo4j returned these connected visits:")
        for visit_id, visit in visits.items():
            print(f"  {visit_id}: {visit['activity']} ({visit['program']}) at {visit['facilityId']} "
                  f"depends on {visit['dependsOn']} ({visit['provenance']})")

        baseline = {
            visit_id: visit["baselineStart"]
            for visit_id, visit in visits.items()
        }

        print("\nSIMULATED sensitivity comparison (four explicit travel assumptions):")
        print("  Skills: checked against simulated crew capabilities, not real qualifications.")
        print("  Local day trips assume no lodging/M&IE; vehicle and mileage costs remain excluded.")
        print("  Overnight cases use the stated St. Louis per-diem benchmark for synthetic locations.")
        print("  Nonbillable travel still counts as crew travel hours but adds no travel labor cost.")
        for scenario in SCENARIOS.values():
            baseline_result = metrics(baseline, visits, scenario)
            optimized, optimized_result = optimize_schedule(visits, scenario)
            show_schedule(scenario["label"] + " — baseline", baseline, visits, baseline_result)
            show_schedule(scenario["label"] + " — lowest-expense feasible scenario", optimized, visits, optimized_result)
            savings_low = baseline_result["modeled_total_cost_low_usd"] - optimized_result["modeled_total_cost_low_usd"]
            savings_high = baseline_result["modeled_total_cost_high_usd"] - optimized_result["modeled_total_cost_high_usd"]
            print(f"  Modeled cost change: ${savings_low:,}–${savings_high:,}")
            print(f"  Finish date: {baseline_result['finish_date']} to {optimized_result['finish_date']}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
