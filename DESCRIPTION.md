# Project 11,389: connecting work across FAA modernization schedules

## Background

On November 13, 2026, the FAA issued a nationwide ground stop after communications problems affected multiple air traffic control centers. The FAA said a technical problem caused network instability during a remote facility router replacement, and that the cause was under investigation. The incident made me think about modernization and coordination. I have found no evidence that schedule integration caused the ground stop or that it would have prevented it. [FAA update](https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers)

The schedule-planning context comes from an earlier source: the September 14, 2026 GAO report, [Air Traffic Control Systems: Ambitious New Modernization Effort Needs to Improve Cost and Schedule Planning](https://www.gao.gov/products/gao-26-107992), GAO-26-107992. GAO reported that, as of May 2026, FAA had 11,389 individual project schedules supporting 13 BNATCS programs that were not integrated across projects. GAO described site work scheduled separately across projects and reported that conflicts and opportunities were generally not being addressed at scale.

GAO wrote:

> “FAA officials stated that due to the high number of projects, attempting to integrate all the projects in their scheduling tool would not be useful or helpful.”

This is GAO's account of what unnamed FAA officials stated, not a quotation from an identified official. DOT described program-level schedules and an AI scheduling tool in its response; GAO disagreed that the schedules logically sequenced work and managed interdependencies.

## Research question

Can a graph-based schedule model help identify cross-program dependencies and compare feasible options by crew hours, travel time, expenses, and completion dates?

## Thesis

Given project-level schedule data and clearly stated cost and time assumptions, a Relate by Neo4j-based model can connect work across programs and help produce feasible schedule alternatives with lower modeled travel time and expenses than the baseline. The evaluation will report the data and assumptions behind each alternative; simulated results will not be presented as actual FAA savings.

## Why Relate by Neo4j

Schedules contain connected information: tasks belong to programs, happen at facilities, require crews, depend on other tasks, and share time windows and resources. Relate by Neo4j stores these connections in a graph and lets the prototype query them with Cypher. Python applies the scheduling rules and compares alternatives. The cost-aware trial uses deterministic logic; it does not currently use an LLM to choose dates or calculate costs.

## Experiments so far

### Public FAA schedule data and progress counts

The live demo now includes two small documented inputs alongside its much larger simulated portfolio:

- A dated FAA Modern Skies snapshot (November 16, 2026) with nine reported program progress measures. Four measures labeled as completed, installed, converted, or deployed are also compared with September 2026 monthly pace figures retained from the prior snapshot. The E-IDS count is labeled “planned” and excluded from that comparison.
- Four future activity records at EWR transcribed from the FAA's August 20, 2026 Delay Reduction Plan, page 9. The [public schedule page](web/public-schedule.html) stores them as documented records in Relate and screens for overlapping date ranges at the same facility.

These are dated public snapshots, not live feeds or complete FAA schedules. FAA says the DRP dates are for planning and subject to change. The EWR overlap screen cannot establish a crew conflict or recommend revised dates because the source does not publish the needed crew, access, dependency, travel, and cost fields.

### Simulated portfolio and conflict detection

The repository has a seeded generator for portfolios from 100 to 11,389 projects. It plants known examples of duplicate visits, crew conflicts, dependency violations, maintenance-window collisions, and decoys that look mergeable but are not. The loader stores these records in Relate and queries for the planted patterns. An independent checker compares query results with the generated answers.

At 1,000 and 11,389 simulated projects, the tested queries matched the planted conflict cases. The 11,389-project portfolio is a scale test, not a reconstruction of FAA's schedules and not evidence of how many real FAA conflicts exist.

The repository also includes a browser page that runs Relate's WebAssembly build on simulated data. Its built-in questions and optional agent exploration are separate from the cost-aware scheduling trial.

### Cost-aware four-visit trial

A second experiment models four simulated visits: a three-task dependency chain at one synthetic facility and a radio-site visit at another. It includes task windows, facility access, a maintenance closure, two crew identifiers, simulated required skills, travel-time assumptions, and a cost model. The schedule search checks the constraints and compares feasible dates. Skill checks only compare invented task requirements with invented crew capability lists; they do not validate FAA qualifications, certifications, availability, or staffing rules.

| Measure | Baseline | Selected simulated scenario (overnight, travel billable) |
|---|---:|---:|
| Mobilizations | 4 | 2 |
| Crew work hours | 26 | 26 |
| Crew travel hours | 13 | 7 |
| Task labor estimate | $5,695–$6,834 | $5,695–$6,834 |
| Travel labor | $2,848–$3,417 | $1,533–$1,840 |
| Lodging and M&IE | $3,420 | $2,436 |
| Modeled total | $11,963–$13,671 | $9,664–$11,110 |
| Finish date | June 24, 2027 | June 16, 2027 |

In the earlier overnight and billable-travel run, the modeled cost reduction was $2,299–$2,561. Task labor was unchanged; the modeled difference came from fewer travel hours and lower lodging and meal costs. The script now runs four sensitivity cases (local day trip or overnight, crossed with billable or nonbillable travel time). Those additional results have not yet been run, so the earlier cost reduction applies only to its stated scenario.

### Cost assumptions

The flat $600/$800 mobilization placeholders were replaced with a component-based planning estimate:

- BLS wage benchmarks: $32.51/hour for telecommunications equipment installers and repairers, and $78,190/year for electrical and electronic engineering technicians, converted at 2,080 hours per year.
- GSA CALC+ average-rate factors for fringe, overhead, G&A, and fee/profit. Government-site and contractor-site overhead assumptions create the low/high labor-rate range.
- A simulated crew mix of two telecommunications technicians and one engineering technician. Each synthetic visit lists required skill labels; the checker compares them with each crew's simulated capability list. This demonstrates a hard constraint, but it does not validate real qualifications, certifications, staffing, or availability.
- FY2027 St. Louis lodging and meal allowances are used only as a per diem benchmark. Synthetic facilities are not mapped to St. Louis.
- The overnight case assumes each separate one-day visit requires one hotel night and the grouped three-day deployment requires two nights. The local-day-trip case assumes no hotel or M&IE. Both are sensitivity assumptions, not actual itinerary or travel-entitlement findings.

These are not FAA or L3Harris contract rates. The model does not know the contract type or travel reimbursement rules. Facility locations, crew origins, mileage, airfare, vehicle costs, shipping, equipment, overtime, and contract-specific setup fees are not included. The model checks the simulated skill labels, but it does not validate actual skills, qualifications, certifications, staffing, or availability. The trial treats crew work hours as team clock-hours and multiplies them by the assumed crew size, an interpretation that needs confirmation before real data is used.

The calculation and its source links are documented in [the cost-aware schedule prototype](docs/cost-aware-schedule-prototype.md).

## What the experiments do not establish

- The public sources do not provide the complete detailed FAA portfolio, crew assignments, skill requirements, site-level costs, or travel data needed to recreate and optimize the portfolio.
- The four EWR rows are real public planning records from FAA's August 2026 report, but they are a small dated sample. The simulated tasks are not those FAA records, and the repository does not contain the complete 11,389 project-level schedule portfolio.
- The output does not show that the ground stop was schedule-related or that schedule integration would have prevented it.
- The simulated cost reduction is not actual or forecast FAA savings.
- The small exhaustive search is a teaching prototype, not a production optimizer.
- The project does not test how to keep thousands of real schedules current or validate proposed alternatives with FAA schedule owners.

## Next research step

Use documented program and site information as anchors, then obtain or define authorized task-level data for work scope, dates, duration, dependency, facility, crew skills and availability, travel origin, and contract cost terms. Keep documented, inferred, and simulated values distinct. Run and publish the four-case local-day-trip/overnight by billable/nonbillable sensitivity results. Then validate work-hour meaning, crew requirements and availability, local travel assumptions, transport cost, and contract treatment with authorized data before interpreting any modeled range as a planning estimate.

## Disclosures

- Built with Claude Code (Claude Sonnet 5.5).
- The author works at Neo4j, which publishes Relate.
- The optional browser agent uses a visitor-provided Claude API key. Its results can be wrong and are not the same as the deterministic scheduling trial.
- Sources: GAO-26-107992, FAA's November 13, 2026 update, BLS wage data, GSA CALC+ guidance, and GSA FY2027 per diem rates.

## Additional source context

### GAO and DOT positions, and how the 11,389 is explained

**The Department of Transportation disagrees.** As GAO summarizes DOT's written reply, FAA "developed and maintains an integrated detailed master schedule for each BNATCS phase 1 program, covering the next three years," and its integrator has an AI scheduling tool that is still being optimized (p. 33). GAO's answer: "We disagree that FAA has established an integrated detailed master schedule for each BNATCS program that logically sequences activities and manages interdependencies" (p. 34). One reading that fits both: the schedules may be integrated *within* each program but not *across* programs. That is my inference; neither side says it.

**How the 11,389 is explained:** GAO does not define a "project" or say how it counted. The program totals in GAO's Table 2 add up to 8,918, not 11,389. FAA's Modern Skies site cites about 4,600 FAA sites, so 11,389 projects works out to roughly two to three per site (my arithmetic, assuming the same scope). That is where overlaps would arise.

### Is the 11,389 meaningful?

**As a count of problems, no. As a claim to test, yes.**

- It counts schedules, not conflicts or costs. GAO documents one overlap (St. Louis) and measures nothing else, and most of the 11,389 may never touch each other.
- The unit is undefined and the figure is as of May 2026. FAA's own site now lists programs that GAO's table does not (for example, 2,696 analog protocol converter sites), so today's count may differ.
- It is not a computing limit. 11,389 is tiny for a graph database: it loads in about four seconds here. If integration is hard, the difficulty is keeping thousands of schedules current and connected, which this project does not test.
The portfolio-level question is how work across programs, sites, dependencies, crews, and dates can be compared. St. Louis is retained only as one documented reference example; the project does not center the analysis on that location.

### What FAA's public data shows now

- FAA's [Modern Skies](https://modernskies.faa.gov/) site (self-reported, data current as of November 16, 2026): telecommunications 3,651 of 5,170 (71%), Surface Awareness Initiatives 143 of 220 (65%), radio sites 497 of 1,581 (31%), electronic flight strips 28 of 89 (31%), voice switches 230 of 450 (51%), new radar systems 16 of 612 (3%), tower simulation systems 20 of 117 (17%), information displays 5 of 435 planned (1%), and surface movement radars 8 of 53 (15%).
- Its location lookup lists seven programs for St. Louis Lambert (STL): six Phase 1 (voice switches in progress; radios, information displays, flight data, surface radar, and radar replacement planned) and one Phase 2. That is consistent with GAO's St. Louis example, where voice switch and information display work were scheduled at the same site about eight months apart. The lookup shows no dates.

