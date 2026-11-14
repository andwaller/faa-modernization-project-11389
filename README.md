## Inspiration

I love the history of computing. Just back from IBM TechExchange, where I gave a talk, I had been watching videos about modernizing stable, critical systems. Banks still run core systems on mainframes descended from the IBM System/370: decades old and rock solid.

Then, on November 13, 2026, the FAA ordered a nationwide ground stop. News coverage pointed to aging telecommunications equipment: outdated technology.

I wondered: **the technology may be outdated, but could the project management approach have an impact too?**

# Project 11,389

**Thousands of infrastructure projects, each on its own schedule. What happens when you connect them?**

An experiment in using [Relate](https://relatedb.ai), Neo4j's embedded graph database, to make the connections between project schedules visible, so that an AI agent can find problems no single schedule shows.

*Work in progress for the Relate by Neo4j Hackathon 2026.*

## Where the 11,389 comes from

Looking for an answer, I found GAO's report on the FAA's modernization ([GAO-26-107992](https://www.gao.gov/products/gao-26-107992), published September 14, 2026, schedule data as of May 2026). It describes the number at the center of this project:

> "FAA has not developed an integrated master schedule for phase 1. Instead, FAA has 11,389 individual project schedules that are not integrated." (GAO highlights page)

And it reports the reason FAA officials gave:

> "FAA officials stated that due to the high number of projects, attempting to integrate all the projects in their scheduling tool would not be useful or helpful." (p. 29; GAO's account of what officials said, not a direct quote from an official)

**The Department of Transportation disagrees.** As GAO summarizes DOT's written reply, FAA "developed and maintains an integrated detailed master schedule for each BNATCS phase 1 program, covering the next three years," and its integrator has an AI scheduling tool that is still being optimized (p. 33). GAO's answer: "We disagree that FAA has established an integrated detailed master schedule for each BNATCS program that logically sequences activities and manages interdependencies" (p. 34). One reading that fits both: the schedules may be integrated *within* each program but not *across* programs. That is my inference; neither side says it.

**How the 11,389 is explained:** GAO does not define a "project" or say how it counted. The program totals in GAO's Table 2 add up to 8,918, not 11,389. FAA's Modern Skies site cites about 4,600 FAA sites, so 11,389 projects works out to roughly two to three per site (my arithmetic, assuming the same scope). That is where overlaps would arise.

## Thesis

> FAA officials said that with so many project schedules, integrating them in their scheduling tool would not be useful. I am testing whether a graph database and an AI agent can make connecting them useful, by surfacing the overlaps and dependencies that no single schedule shows.

This is one angle on "technology or project management?" It cannot settle it. I am not saying the FAA is wrong, and I am not suggesting scheduling caused the ground stop. No source I have found establishes the cause.

## What FAA's public data shows now

- FAA's [Modern Skies](https://modernskies.faa.gov/) site (self-reported, data as of October 15, 2026): telecommunications 3,508 of 5,170 (68%), radio sites 457 of 1,581, voice switches 220 of 450, radars 15 of 612, information displays 0 of 435.
- Its location lookup lists seven programs for St. Louis Lambert (STL): six Phase 1 (voice switches in progress; radios, information displays, flight data, surface radar, and radar replacement planned) and one Phase 2. That is consistent with GAO's St. Louis example, where voice switch and information display work were scheduled at the same site about eight months apart. The lookup shows no dates.

## How I'm using Relate, and why

- **Storage mode: a single `.rl` file** (`store/portfolio_n1000_seed1.rl`, 0.8 MB). Anyone can open the whole database without running a server. In-memory stores are used for tests.
- **Why Relate fits:** schedules are naturally a graph (projects, facilities, crews, dependencies, programs). Relate is embedded, needs no server, speaks Cypher, and is built for agents, with a CLI agent mode, an MCP endpoint, and an installable skill. `relate clone` gives each agent a disposable copy for what-if scenarios, and every node carries a provenance label, so it is always clear what is documented and what is modeled.
- **What I use:** the Python library to load data and run the conflict queries; the CLI to inspect the store; constraints and indexes to keep identities clean; `relate clone` and MCP were tested for agent use.

## What works today

- A graph schema with unique IDs and a provenance label on every node: documented, simulated, or hypothesis (`schema/schema.cypher`).
- A seeded generator for synthetic portfolios from 100 to 11,389 projects with **known conflicts planted in them**: duplicate visits, resource conflicts, dependency violations, maintenance-window collisions, and decoys that look mergeable but are not. An independent checker recomputes every planted conflict from the raw files.
- A loader that puts a portfolio into a persistent Relate store and finds every conflict class in Cypher.
- **Result:** at 1,000 and at 11,389 projects, the Cypher results match the planted answers exactly, with nothing missing and nothing extra (114 of each class at full scale).

All generated data is **simulated**. Only the program names, scope, and completion dates come from GAO's Table 2, p. 17. The 11,389-project size is a scale test, not a reconstruction of the FAA's portfolio.

## Not built yet

- The AI agent that answers questions through Relate.
- A graph of the documented programs and sites (GAO and Modern Skies data) with required installation pace labeled as inferred.
- The incident-scenario network model (hypothetical blast-radius and redundancy questions).
- A comparison against SQLite and a flat-file agent.

## Honest limits

- Nothing here measures real FAA conflicts, costs, or savings. GAO documents one concrete example and quantifies nothing else.
- The project makes no claim about the cause of the 2026-11-13 ground stop.
- The Modern Skies figures are the FAA's own reporting. GAO said it could not verify the reliability of the data behind FAA's internal status dashboard (pp. 3, 36).
- At full scale, some Cypher conflict checks take 2 to 4 seconds. They have not been optimized, and I make no speed claim.

## Try it

Requires Python 3.10 or later (tested on 3.14, Windows, `relate-db` 1.0.1).

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt

# generate a portfolio (deterministic: same seed, same files)
.venv\Scripts\python.exe -I generator\generate_portfolio.py --n 1000 --seed 1 --out data\synthetic

# check the generator against its own oracle
.venv\Scripts\python.exe -I generator\verify_portfolio.py data\synthetic\portfolio_n1000_seed1

# load into a new Relate store and verify every conflict class in Cypher
.venv\Scripts\python.exe -I loader\load_portfolio.py --portfolio data\synthetic\portfolio_n1000_seed1 --store store\my_store.rl --verify
```

Inspect the included store with the Relate CLI ([install](https://relatedb.ai/docs/get-started/install)):

```powershell
relate -d store\portfolio_n1000_seed1.rl --read-only --toon "MATCH (n) UNWIND labels(n) AS l RETURN l, count(*) AS n"
```

## What's in the repo

| Path | What it is |
|---|---|
| `schema/` | Graph schema (constraints and indexes), tested in Relate |
| `generator/` | Seeded portfolio generator and independent checker |
| `loader/` | Loads a portfolio into Relate and verifies it in Cypher |
| `store/` | A ready-made 1,000-project Relate store |
| `DESCRIPTION.md` | The story in more detail |
| `PHASE1-REPORT.md`, `PREREGISTRATION.md` | Sources, findings, and the planned test design |
| `ARTIFACTS.md` | What is built, what is not |

## Disclosures

- Built with Claude Code (Claude Sonnet 5.5).
- [confirm wording] The author works at Neo4j, which publishes Relate.
- Sources: GAO-26-107992, FAA Modern Skies (modernskies.faa.gov), FAA statement of November 13, 2026, relatedb.ai, and the Relate repository.
