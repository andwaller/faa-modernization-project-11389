# Project 11,389: seeing the connections between thousands of infrastructure projects

*Draft v0.1. Items marked [confirm] are in your voice and need your words.*

## The business problem

Large infrastructure programs run as thousands of separate projects, each with its own schedule. The connections between them are what cause trouble: two projects visiting the same facility months apart, one crew booked in two places at once, a project scheduled before the work it depends on. Each project looks fine on its own. The problem only appears when the schedules are connected.

GAO documented this pattern at the FAA. Its September 2026 report (GAO-26-107992) found 11,389 individual project schedules that were not integrated across programs, and gave one example: technicians scheduled to prepare a St. Louis facility for a voice switch in April 2027, and the information-displays program planning its own site preparation at the same site about eight months later. GAO also reported that FAA officials said integrating all the projects in their scheduling tool "would not be useful or helpful." GAO did not measure what these overlaps cost, and the Department of Transportation disputes parts of GAO's findings. So this project does not claim to know how big the problem is at the FAA. It asks a smaller question: if schedule data is connected, how easily can an AI agent find these problems?

## Why I thought of it [confirm]

I read the GAO report after the FAA's nationwide ground stop on November 13, 2026, which news coverage attributed to aging telecommunications equipment. I wondered whether the real issue is old technology or how modernization is managed. The report's number, 11,389 schedules with no integrated master schedule, made me ask what happens if that complexity is exactly where connected data helps most. I am not suggesting scheduling caused the outage. No source I have found establishes the cause.

## Why Relate

Relate (relatedb.ai) is an open-source, embedded graph database that speaks Cypher: "No signup. No server to deploy." The data lives in memory, a directory, or one `.rl` file, and it ships with an agent skill and an MCP endpoint so an agent can write Cypher and get results back. That matches this problem. Project schedules are naturally a graph (projects, facilities, crews, dependencies), a judge can open the whole database as a single file, and each agent can work on its own disposable copy.

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
