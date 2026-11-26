# Project artifacts and status

Status reflects the repository after the schedule-coordination update on 2026-11-26.

| Component | Status | What it establishes |
|---|---|---|
| GAO/FAA context and thesis | Documented in README and DESCRIPTION | Motivation and evidence boundaries; no claim that scheduling caused or could have prevented the November 2026 ground stop. |
| Synthetic portfolio generator | Implemented | Creates seeded schedules with planted conflicts and an independent checker. The data is simulated. |
| Relate loader and Cypher checks | Implemented | Stores connected records and finds planted conflict classes in the synthetic portfolios. This is not an FAA conflict-rate estimate. |
| Browser portfolio demo | Published through GitHub Pages | Interactive conflict-detection experiment using simulated data, with separate documented FAA inputs. |
| FAA public inputs | Added as dated snapshots | Nine Modern Skies progress measures from Nov. 16, 2026, and four EWR planned activities from the FAA August 2026 DRP report (p. 9). Not a live feed or full schedule. |
| Public schedule overlap view | Added | Relate checks date ranges at the same facility; results are review flags, not proof of conflicts. Crew, access, dependencies, travel, and cost fields are missing. |
| Four-visit cost-aware schedule trial | Implemented as a small deterministic example | Relate stores the connected schedule; Python checks constraints and searches feasible dates. The example includes synthetic task skills and a four-case travel sensitivity. |
| Cost sensitivity output | Added; results pending execution | Compares local-day-trip/overnight assumptions with billable/nonbillable travel time. It has not yet been run after this change. |
| St. Louis GAO reference fixture | Added as evidence-only data | Preserves the limited public overlap and labels unavailable fields; not loaded into the optimizer. |
| Crew skill matching | Added for simulated skills | Checks required task labels against synthetic crew capability lists. Not a qualification, certification, staffing, or availability check. |
| Cost evidence | Partly source-grounded | BLS and GSA benchmarks support a transparent estimate; no FAA/L3Harris rates, route costs, or contract terms are available. |
| Preregistration | Draft, not frozen | Current schedule-coordination evaluation plan; assumptions and protocol still need review. |
| Phase 1 report | Historical snapshot | Records earlier research and the earlier detection-efficiency thesis. Do not treat that thesis as current. |

## Remaining work

1. Run the updated four-case simulation and record the complete output.
2. Review the assumptions for team work-hours, local crew origins, reimbursable travel, and overnight stays.
3. Add realistic but sourceable travel costs only after route and transport assumptions are available.
4. Validate crew skills, calendars, and task constraints against authorized data.
5. Keep the St. Louis pair as a documented reference unless sufficient task-level inputs are obtained; GAO's public example alone does not support optimization.
6. Define and review an independent evaluation before scaling schedule search beyond the four-visit teaching example.
