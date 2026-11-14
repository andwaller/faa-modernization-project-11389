# Project 11,389: seeing the connections between thousands of infrastructure projects

*Draft v0.1. Items marked [confirm] are in your voice and need your words.*

## The business problem

Large infrastructure programs run as thousands of separate projects, each with its own schedule. The connections between them are what cause trouble: two projects visiting the same facility months apart, one crew booked in two places at once, a project scheduled before the work it depends on. Each project looks fine on its own. The problem only appears when the schedules are connected.

GAO documented this pattern at the FAA. Its September 2026 report (GAO-26-107992) found 11,389 individual project schedules that were not integrated across programs, and gave one example: technicians scheduled to prepare a St. Louis facility for a voice switch in April 2027, and the information-displays program planning its own site preparation at the same site about eight months later. GAO also reported that FAA officials said integrating all the projects in their scheduling tool "would not be useful or helpful." GAO did not measure what these overlaps cost, and the Department of Transportation disputes parts of GAO's findings. So this project does not claim to know how big the problem is at the FAA. It asks a smaller question: if schedule data is connected, how easily can an AI agent find these problems?

## Why I thought of it

I love learning the history of computer technology. I had just come back from IBM TechExchange, where I gave a talk, and I had been watching videos about modernizing stable, critical systems. Then the FAA grounded all flights, and the reasons given got me wondering whether this was a technology problem or a project management problem. That led me to GAO's report, whose number, 11,389 schedules with no integrated master schedule, made me ask what happens if that complexity is exactly where connected data helps most. I am not suggesting scheduling caused the outage. No source I have found establishes the cause.

## Why Relate

Relate by Neo4j (relatedb.ai) is an open-source, embedded graph database that speaks Cypher: "No signup. No server to deploy." The data lives in memory, a directory, or one `.rl` file, and it ships with an agent skill and an MCP endpoint so an agent can write Cypher and get results back. That matches this problem. Project schedules are naturally a graph (projects, facilities, crews, dependencies), a judge can open the whole database as a single file, and each agent can work on its own disposable copy.

## What I did with Relate

- **Modeled the schedule as a connected graph:** programs, facilities, projects, crews, dependencies, maintenance windows, and sources, each labeled documented, simulated, or hypothesis. The 13 programs and their scope and completion dates come from GAO's Table 2. Everything else is simulated and labeled that way.
- **Built a seeded generator:** it produces portfolios from 100 up to 11,389 projects with known conflicts planted in them (duplicate visits, resource conflicts, dependency violations, maintenance-window collisions, and decoys that look mergeable but are not). The 11,389-project size is a scale test, not a reconstruction of the FAA's portfolio.
- **Loaded it into a persistent Relate store** through Relate's Python API, with 14 constraints and 2 indexes. A 1,000-project store is a 0.8 MB file.
- **Asked Relate to find the conflicts in Cypher** and checked every answer against an independent checker. At 1,000 and 11,389 projects, all five classes matched the planted answers exactly: nothing missing and nothing extra (114 of each class at full scale).
- **Tested Relate's agent features:** agent mode (automatic here, with a 100-row cap), compact output, the MCP server, `relate clone`, and the installable skill.

## What it does not show yet

- The AI agent demo is not built.
- The data is simulated, so nothing here measures real FAA conflicts, costs, or savings.
- At full scale, some Cypher conflict checks took 2 to 4 seconds. I have not optimized them, so I make no speed claim.
- The incident-scenario model, which asks hypothetical blast-radius and redundancy questions, is not built.
- The comparison against SQLite and a flat-file agent has not been run.

## Disclosures

- Built with Claude Code (Claude Sonnet 5.5). I describe significant AI use in the submission.
- [confirm wording] I work at Neo4j, which publishes Relate.
- Sources: GAO-26-107992 (pages cited in the repo), relatedb.ai, and the Relate repository.

## Background moved from the README

### GAO and DOT positions, and how the 11,389 is explained

**The Department of Transportation disagrees.** As GAO summarizes DOT's written reply, FAA "developed and maintains an integrated detailed master schedule for each BNATCS phase 1 program, covering the next three years," and its integrator has an AI scheduling tool that is still being optimized (p. 33). GAO's answer: "We disagree that FAA has established an integrated detailed master schedule for each BNATCS program that logically sequences activities and manages interdependencies" (p. 34). One reading that fits both: the schedules may be integrated *within* each program but not *across* programs. That is my inference; neither side says it.

**How the 11,389 is explained:** GAO does not define a "project" or say how it counted. The program totals in GAO's Table 2 add up to 8,918, not 11,389. FAA's Modern Skies site cites about 4,600 FAA sites, so 11,389 projects works out to roughly two to three per site (my arithmetic, assuming the same scope). That is where overlaps would arise.

### Is the 11,389 meaningful?

**As a count of problems, no. As a claim to test, yes.**

- It counts schedules, not conflicts or costs. GAO documents one overlap (St. Louis) and measures nothing else, and most of the 11,389 may never touch each other.
- The unit is undefined and the figure is as of May 2026. FAA's own site now lists programs that GAO's table does not (for example, 2,696 analog protocol converter sites), so today's count may differ.
- It is not a computing limit. 11,389 is tiny for a graph database: it loads in about four seconds here. If integration is hard, the difficulty is keeping thousands of schedules current and connected, which this project does not test.
- What makes it meaningful is that FAA gave scale as the reason not to integrate. The numbers that matter are how many sites have several programs, and how far apart in time their work falls. FAA's lookup lists seven programs for St. Louis alone. That is what this project looks at.

### What FAA's public data shows now

- FAA's [Modern Skies](https://modernskies.faa.gov/) site (self-reported, data as of October 15, 2026): telecommunications 3,508 of 5,170 (68%), radio sites 457 of 1,581, voice switches 220 of 450, radars 15 of 612, information displays 0 of 435.
- Its location lookup lists seven programs for St. Louis Lambert (STL): six Phase 1 (voice switches in progress; radios, information displays, flight data, surface radar, and radar replacement planned) and one Phase 2. That is consistent with GAO's St. Louis example, where voice switch and information display work were scheduled at the same site about eight months apart. The lookup shows no dates.

