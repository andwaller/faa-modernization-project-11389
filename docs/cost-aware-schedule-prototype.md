# Cost-aware schedule prototype

**Status:** A small deterministic prototype is implemented in `examples/cost_aware_schedule_trial.py`. Its four-visit inputs and expense assumptions are simulated. The script compares four travel assumptions; updated sensitivity output is pending execution.

## Purpose

Test whether connected schedule data in Relate by Neo4j can support a deterministic search over feasible schedule alternatives and compare modeled crew time, travel, expenses, and finish dates. Relate stores the graph of tasks, programs, facilities, crews, dependencies, and maintenance. Python checks constraints and searches dates. No LLM chooses dates or calculates costs.

This prototype does not reconstruct FAA's 11,389 schedules, show FAA-wide savings, or explain the November 13, 2026 ground stop.

## Evidence context

GAO reported that, as of May 2026, FAA had 11,389 individual project schedules supporting 13 BNATCS programs that had not been integrated across projects. GAO wrote:

> “FAA officials stated that due to the high number of projects, attempting to integrate all the projects in their scheduling tool would not be useful or helpful.”

This is GAO's account of what unnamed FAA officials stated, not a direct quotation from an identified official. DOT described program-level schedules and an AI scheduling tool in its written response; GAO disagreed that the schedules logically sequenced work and managed interdependencies.

Source: U.S. GAO, [GAO-26-107992](https://www.gao.gov/products/gao-26-107992), September 14, 2026, pp. 29, 33–34.

## Documented reference versus simulated trial

GAO's St. Louis example identifies voice-switch site preparation in April 2027 and information-display site preparation in January 2028 at the same facility. That is one documented overlap, not proof the work could have been combined. The report does not provide the duration, exact task dates, skill requirements, crew assignments, access windows, dependency details, travel origin, or cost terms needed to optimize it. The evidence-only fixture is in [data/st_louis_documented_anchor.json](../data/st_louis_documented_anchor.json) and is not loaded by the simulation.

The cost trial instead uses four simulated visits: a three-task dependency chain at one synthetic facility, plus a radio-site task at a second synthetic facility. All detailed dates, windows, durations, work hours, skill requirements, crew assignments, travel hours, and expense assumptions in that trial are simulated.

## What the constraint checker covers

- Task start windows and facility access dates
- Facility maintenance closures
- Task prerequisite order and completion
- One crew cannot be booked at overlapping work dates
- Each task's simulated required skill labels must be present in the assigned simulated crew capability list
- A mobilization can group consecutive eligible tasks sharing one crew and one facility

The crew and skill records are illustrative labels. They do not represent real FAA crew qualifications, certifications, work calendars, or availability. Work hours are treated as team clock-hours and multiplied by the assumed three crew members for labor costing. This interpretation needs confirmation before applying real data.

## Cost build-up

The prototype replaces the unsupported flat $600/$800 mobilization placeholders with cost components. It reports task labor, travel labor, lodging/M&IE, and total ranges separately.

- **Wage benchmarks:** BLS May 2025 median pay is $32.51/hour for telecommunications equipment installers and repairers; $78,190/year for electrical and electronic engineering technicians, converted at 2,080 hours/year.
- **Loaded labor range:** GSA CALC+ average rate build-up uses fringe, overhead, G&A, and fee/profit factors. The example applies 35% fringe, 15% G&A, 10% fee/profit, and 25% versus 50% overhead assumptions to create low/high rates. These factors are benchmarks, not bid rates.
- **Simulated crew mix:** two telecommunications technicians and one engineering technician per crew. A separate simulated skills list supports the feasibility check.
- **Per diem benchmark:** FY2027 St. Louis GSA rates ($156 lodging/person/night, $86 full-day M&IE, $64.50 first/last travel day) are an illustrative locality reference. The synthetic facilities have no real location and are not mapped to St. Louis.
- **Excluded:** mileage, airfare, rental vehicles, routing, shipping, equipment, overtime, contract-specific setup charges, and contract reimbursement or fixed-price rules.

Sources: [BLS telecommunications wage data](https://www.bls.gov/iag/tgs/iag517.htm); [BLS engineering technician wage data](https://www.bls.gov/ooh/architecture-and-engineering/electrical-and-electronics-engineering-technicians.htm); [GSA CALC+ rate build-up guidance](https://buy.gsa.gov/pricing/qr/bls); [GSA FY2027 St. Louis per diem](https://www.gsa.gov/travel/plan-book/per-diem-rates/per-diem-rates-results?action=perdiems_report&city=St.+Louis&fiscal_year=2027&state=MO&zip=).

## Sensitivity cases

The script runs the schedule search separately for each combination:

| Trip model | Travel time billable? | Lodging/M&IE treatment |
|---|---:|---|
| Local day trips | Yes | $0 assumed |
| Local day trips | No | $0 assumed |
| Overnight | Yes | Lodging and M&IE estimated with the cited benchmark |
| Overnight | No | Lodging and M&IE estimated with the cited benchmark |

The local cases assume a nearby crew base and no lodging or M&IE. They still count round-trip crew travel hours; billable travel adds labor cost, nonbillable travel does not. All cases exclude mileage, vehicle, airfare, and route costs, so they are not complete trip-cost estimates. In the overnight cases, each stand-alone one-day trip assumes one hotel night; consecutive grouped work uses one fewer hotel night than work-span days. Both the local crew assumption and overnight pattern are hypothetical.

The optimizer selects a feasible schedule separately under each case, minimizing modeled total cost, then travel hours, then finish date. Task labor is constant across dates in this example. The script prints each baseline and selected schedule, cost components, finish date, and modeled change. Results from the new sensitivity run have not yet been recorded. Earlier output for the overnight/billable case showed baseline total $11,963–$13,671 and selected total $9,664–$11,110, an estimated difference of $2,299–$2,561. That output is scenario-specific, not a forecast, invoice estimate, or FAA savings figure.

## Run it

From the repository root:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe examples\cost_aware_schedule_trial.py
```

## Next validation needed

Before treating this as a useful planning estimate, the assumptions requiring real evidence are: meaning of work-hour fields; required task qualifications; actual crew composition and calendars; travel origin and trip mode; local day-trip eligibility; travel billing and reimbursement; route costs; lodging/M&IE eligibility; and contract terms. The optimizer also needs independent review before scaling beyond a handful of visits.
