# Project 11,389 — Draft evaluation plan

**Status:** working plan, not frozen. This plan reflects the current schedule-coordination thesis. It supersedes the earlier proposed agent-versus-database detection benchmark as the primary evaluation. Record any later protocol changes with dates and reasons before reporting results.

## Motivation and scope

The September 14, 2026 GAO report GAO-26-107992 says that, as of May 2026, FAA had 11,389 project schedules supporting 13 BNATCS programs that were not integrated across projects. GAO wrote: “FAA officials stated that due to the high number of projects, attempting to integrate all the projects in their scheduling tool would not be useful or helpful.” This is GAO's account of what unnamed FAA officials stated.

The November 13, 2026 FAA ground stop is motivation to ask about modernization coordination. No claim is made that schedule integration caused that event or would have prevented it.

## Research question

Can a graph-based schedule model help identify cross-program dependencies and compare feasible schedule alternatives by crew work hours, travel time, modeled expenses, and completion dates?

## Thesis

Given project-level schedule data and explicit cost and time assumptions, a Relate by Neo4j-based model can connect work across programs and help produce feasible schedule alternatives with lower modeled travel time and expenses than a baseline. Results will identify data provenance and assumptions. Simulated values will not be described as actual FAA savings.

## Current experiments

### A. Public FAA schedule sample and synthetic portfolio screening

The browser loads a dated FAA Modern Skies progress snapshot (November 16, 2026) and a separate four-activity schedule snapshot for EWR from the FAA Delay Reduction Plan report dated August 20, 2026, page 9. The public records are labeled DOCUMENTED and stay separate from the seeded SIMULATED portfolio. The EWR page finds same-site date-range overlaps only. FAA says its planning dates may change. Missing crew, skills, access, dependency, travel, and cost inputs prohibit a real constraint-aware reschedule or savings calculation from these public records.

The existing generator produces seeded portfolios from 100 through 11,389 projects. It plants known duplicate-visit, crew-overlap, dependency, maintenance, and decoy cases. Relate queries are checked against an independent generator oracle. This measures query correctness against planted cases, not FAA conflict frequency or Relate's superiority over another database.

### B. Four-visit schedule coordination

The existing example uses a three-visit dependency chain at one synthetic facility and a separate radio visit at another. The deterministic Python search checks date windows, facility access, maintenance, prerequisite order, crew overlap, and simulated required-skill labels. Relate stores the connected schedule records; it does not perform the date search or use an LLM to choose dates.

The current travel sensitivity is a 2 × 2 comparison:

| Itinerary assumption | Travel-time cost treatment |
|---|---|
| Local day trips; no lodging or M&IE | Billable |
| Local day trips; no lodging or M&IE | Nonbillable |
| Overnight; modeled lodging and M&IE | Billable |
| Overnight; modeled lodging and M&IE | Nonbillable |

Each case reports the baseline, selected feasible schedule, mobilizations, work hours, travel hours, labor ranges, lodging/M&IE, total modeled cost, and finish date. The optimizer selects a schedule separately under each case's cost assumptions. Local cases assume the crew is based nearby; mileage and vehicle costs remain excluded. Overnight values use GSA St. Louis per diem as a benchmark only; synthetic facilities are not located in St. Louis.

The documented GAO St. Louis pair is stored separately as a reference record. It lacks duration, detailed dates, crew, skills, access, dependency, and cost data, so it is not used as an optimizer input.

## Measures and interpretation

- **Feasibility:** every scheduled visit is inside its allowed dates and facility access window, outside maintenance closures, after its prerequisites, assigned to a non-overlapping crew, and matched to the simulated skill labels.
- **Schedule effects:** mobilizations, team work-hours, crew travel-hours, and completion date relative to the supplied baseline.
- **Cost effects:** task labor, travel labor, lodging/M&IE, and total range, by scenario.
- **Provenance:** each output must distinguish documented source facts, inferred values, and simulated assumptions.
- **Sensitivity:** show how travel entitlement and overnight assumptions change the selected dates and modeled totals. Do not collapse the measures into a single weighted score.

A result is a feasible modeled alternative under the encoded constraints. It does not establish that a real FAA crew, site owner, program manager, or contract permits that alternative.

## Data and cost assumptions

The current four-visit inputs, wage benchmarks, burden factors, crew mix, and per diem assumptions are documented in [docs/cost-aware-schedule-prototype.md](docs/cost-aware-schedule-prototype.md). Values use BLS wages and GSA CALC+ factors as estimation benchmarks. They are not FAA or L3Harris contract rates. Travel-mode assumptions, team-clock-hour interpretation, and the task skill lists are simulated and require validation.

No complete project-level FAA portfolio is public in this repository. A few public planning activities are included, but crew assignments, qualifications, crew origin, route, and contract terms are unavailable. Do not infer those values from GAO's reported schedule count or from a small public sample.

## Planned evaluation steps

1. Run the four-visit example and save the complete output for all four scenarios.
2. Independently inspect every selected schedule against the encoded hard constraints.
3. Report all four cases, including any case where the modeled savings disappear or the best dates differ.
4. Vary wage burden and per diem assumptions after documenting their sources; keep those changes separate from the core 2 × 2 travel sensitivity.
5. Replace simulated task, crew, travel, and cost inputs only when authorized, sourceable data becomes available.
6. Evaluate portfolio-scale scheduling only after the small case's constraints and cost semantics are independently reviewed.

## Known limitations

- The four-visit example is too small to establish performance on an FAA-wide schedule.
- Crew skills and capabilities are synthetic labels, not qualification records; crew availability and calendars are not validated.
- The local day-trip case assumes no hotel or M&IE and excludes mileage, vehicle, airfare, and route costs.
- The overnight case applies an illustrative per diem benchmark to synthetic facilities.
- The optimizer is exhaustive and intended only for a tiny scenario.
- A lower modeled total does not imply a lower contract price, an achievable saving, or an operationally acceptable schedule.
- The author works at Neo4j, which publishes Relate; disclose this affiliation alongside results.

## Sources

- U.S. GAO, [GAO-26-107992](https://www.gao.gov/products/gao-26-107992), September 14, 2026, especially pp. 17, 29–34.
- FAA, [November 13, 2026 ground-stop update](https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers).
- See the cost prototype for BLS, GSA CALC+, and GSA per diem source links.

## Changes log

| Date | Change | Reason |
|---|---|---|
| 2026-11-26 | Replaced the earlier agent-detection primary question with the current schedule-coordination thesis; added travel sensitivity and simulated skill-fit checks. | Align plan with implemented work and current project direction. |
