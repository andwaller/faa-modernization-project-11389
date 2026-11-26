# Cost-aware schedule prototype

**Status:** Design for a small, reproducible prototype. Results from the first trial will be simulated unless they come directly from a cited public source.

## Purpose

Explore whether **Relate by Neo4j** can connect project work across programs and facilities so a deterministic scheduling optimizer can compare feasible coordination options by crew time, travel time, expenses, and completion dates.

This is a decision-support experiment. It does not reconstruct the FAA's actual 11,389 schedules or establish actual FAA savings.

## Thesis context

GAO reported that, as of May 2026, the FAA had **11,389 individual project schedules** supporting 13 BNATCS programs that had not been integrated across the projects. GAO wrote:

> "FAA officials stated that due to the high number of projects, attempting to integrate all the projects in their scheduling tool would not be useful or helpful."

This is GAO's account of what unnamed FAA officials stated, not a direct quotation from an identified official. In its written response, the Department of Transportation described program-level schedules and an AI scheduling tool. GAO disagreed that the schedules logically sequenced work and managed interdependencies.

Source: U.S. Government Accountability Office, [*Air Traffic Control Systems: Ambitious New Modernization Effort Needs to Improve Cost and Schedule Planning*](https://www.gao.gov/products/gao-26-107992), GAO-26-107992 (September 14, 2026), pp. 29, 33–34. Kevin Walsh is listed as the GAO contact; report contributors are named in Appendix IV.

## Research question

Can a schedule-planning prototype built with Relate by Neo4j help identify feasible ways to coordinate work across programs and compare their modeled effects on crew hours, travel time, expenses, and completion dates?

## What is documented and what is simulated

| Data | Status and use |
|---|---|
| 11,389 project-schedule count and the 13 BNATCS program summaries in GAO Table 2 | DOCUMENTED. These are portfolio context, not the underlying project-level schedule records. |
| GAO's St. Louis example: site preparation for a voice switch in April 2027 and for information displays in January 2028 at the same facility | DOCUMENTED. Use as a source-grounded example, not as evidence that the visits could be combined. |
| Detailed visits, flexible work windows, durations, crews, travel, expenses, and task-level dependencies | SIMULATED in the first trial unless a separate source is recorded for a field. |
| Cost rates and expense assumptions | SIMULATED and editable. No result from these values is an actual FAA savings estimate. |

The repository's existing generator provides synthetic facilities, projects, crews, dates, dependencies, and maintenance windows. It does not contain project-level FAA schedules or expense fields.

## Minimum data model

Each visit or work package needs:

- Stable visit, project, program, facility, and crew identifiers
- Activity type and work description
- Baseline start date and duration
- Earliest and latest permitted start dates
- Required crew skills, crew availability, and estimated work hours
- Dependencies and facility access or maintenance restrictions
- Travel time and direct travel or mobilization expense
- Whether coordination with another visit is allowed, with the basis for that decision
- Provenance for each important fact: DOCUMENTED, INFERRED, or SIMULATED, plus source, page or URL, and retrieval date where applicable

Do not infer that two visits can be combined solely because they share a facility. The work, crew skills, access windows, dependencies, and operational constraints must permit it.

## Illustrative cost model for the scheduling trial

The prototype replaces the unsupported flat mobilization charges with a transparent planning estimate. **None of these rates are FAA or L3Harris contract rates, and the simulated facilities are not mapped to St. Louis.**

- **Wage benchmarks:** BLS May 2025 median pay for telecommunications equipment installers and repairers: $32.51/hour; engineering technologists and technicians: $78,190/year, converted using 2,080 hours/year ($37.59/hour).
- **Loaded labor range:** GSA CALC+ BLS guidance uses fringe, overhead, G&A, and fee/profit factors to build a comparable estimated labor rate. The trial applies GSA's average factor assumptions (35% fringe, 15% G&A, 10% fee/profit) with 25% government-site versus 50% contractor-site overhead. This yields approximately $69–$83/hour per telecommunications technician and $80–$96/hour per engineering technician.
- **Costing-only crew assumption:** two telecommunications technicians plus one engineering technician per simulated crew. This is only for pricing the scenario; the prototype does not validate skills, actual staffing, or qualifications.
- **Travel benchmark:** St. Louis FY2027 GSA per diem, used only as a locality reference: $156 lodging per person/night, $86 full-day M&IE, and $64.50 M&IE for first/last travel days. The simulated facilities have no actual location or crew origin.
- **Trip model:** standalone one-day visits assume one overnight; three consecutive workdays combined into one deployment assume two hotel nights. Travel time is assumed billable for this scenario.
- **Excluded pending source data:** mileage/vehicle or airfare, equipment freight, test equipment, overtime, contract-specific mobilization/setup charges, and any contract reimbursement or fixed-price rules.

The model treats `crew_work_hours` as team clock-hours and prices each hour for the assumed three crew members. This interpretation is simulated and must be verified before real schedule data is used. The output separates task labor, billable travel labor, and lodging/M&IE. It does not claim these estimates equal a contractor invoice or actual savings. The optimizer uses the lower modeled total-cost case as its objective; the higher case is shown as a sensitivity bound.

Reference inputs:
- [BLS telecommunications equipment installers and repairers wage data](https://www.bls.gov/iag/tgs/iag517.htm)
- [BLS engineering technologist and technician wage data](https://www.bls.gov/ooh/architecture-and-engineering/electrical-and-electronics-engineering-technicians.htm)
- [GSA CALC+ BLS rate build-up guidance](https://buy.gsa.gov/pricing/qr/bls)
- [GSA FY2027 St. Louis per diem](https://www.gsa.gov/travel/plan-book/per-diem-rates/per-diem-rates-results?action=perdiems_report&city=St.+Louis&fiscal_year=2027&state=MO&zip=)

## Schedule comparison

Keep the baseline and each scenario separate. Report these measures independently:

- Work hours
- Crew travel hours
- Number of separate mobilizations
- Direct expenses, by category
- Project completion dates and any schedule movement
- Constraints satisfied or violated
- Data provenance and assumptions for every changed visit

A monetary total should be calculated only when its rates and cost categories are defined. If the first trial uses assumed rates, label the total as a modeled scenario value. Do not hide trade-offs in one weighted score until its weights are explained.

## Proposed prototype flow

1. Load a small synthetic set of visits into Relate by Neo4j with clear provenance.
2. Use Cypher to retrieve connected visits, dependencies, crews, and facility restrictions.
3. Pass that context to a deterministic scheduling optimizer. Treat dependencies, allowed work windows, resource availability, facility restrictions, and deadlines as hard constraints.
4. Compare the baseline with feasible alternatives under editable time and expense assumptions.
5. Store or export the scenario results with the assumptions and changed visits.
6. Add a LangChain natural-language interface after the deterministic comparison is repeatable. The agent should call defined read and scenario tools, while schedule changes remain proposals for human review.

## First-trial completion criteria

- A clean setup can load and query the small scenario.
- The baseline and at least one alternative can be compared with the same input records.
- Every alternative passes the stated hard constraints.
- The report shows crew hours, travel hours, mobilizations, direct expenses, and completion dates separately.
- The report identifies every simulated value and assumption.
- An independent check confirms the optimizer did not create an invalid schedule.

A positive result means the prototype found a lower modeled time or expense option under its stated assumptions. It does not establish that the FAA can use that option or realize those savings without validation against real schedule, resource, access, and cost data.
