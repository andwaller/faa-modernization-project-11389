## Inspiration

I love the history of computing. Just back from IBM TechExchange, where I gave a talk, I had been watching videos about modernizing stable, critical systems. Banks still run core systems on mainframes descended from the IBM System/370: decades old and rock solid.

Then, on November 13, 2026, the FAA ordered a nationwide ground stop. If old systems can be rock solid, was age really the problem? **Was this a technology problem or a project management problem?**

GAO's report on the FAA's modernization had one sentence that stood out:

> "FAA officials stated that due to the high number of projects, attempting to integrate all the projects in their scheduling tool would not be useful or helpful."
>
> GAO-26-107992, p. 29 (GAO's account of what FAA officials stated, not a direct quote)

The more projects there are, the harder it is to see how they connect. That is where I thought a graph might help.

*I am not saying the FAA is wrong or that scheduling caused the ground stop. No source I have found establishes the cause.*

# Project 11,389

**Thousands of infrastructure projects, each on its own schedule. What happens when you connect them?**

An experiment in using [Relate](https://relatedb.ai), Neo4j's embedded graph database, to make the connections between project schedules visible, so that an AI agent can find problems no single schedule shows.

*Work in progress for the Relate by Neo4j Hackathon 2026. See "What works today" and "Not built yet" below.*



## The problem

Large modernization programs run as thousands of separate projects. The trouble is in the connections: two projects visiting the same facility months apart, one crew booked in two places at once, a project scheduled before the work it depends on. Each schedule looks fine alone. The conflict only appears when they are connected.

GAO documented this pattern at the FAA. Its report ([GAO-26-107992](https://www.gao.gov/products/gao-26-107992), published September 14, 2026, with schedule data as of May 2026) found **11,389 individual project schedules that were not integrated across programs**, and gave one example: site preparation for a voice switch at a St. Louis facility in April 2027, and the information-displays program planning its own site preparation at the same site about eight months later. GAO reported that FAA officials said integrating all the projects in their scheduling tool "would not be useful or helpful." The Department of Transportation disputes parts of GAO's findings, and GAO did not measure what these overlaps cost.

So this project does not claim to know how big the problem is. It asks something smaller and testable: **when schedule data is connected, how easily can an AI agent find these problems?**

## How I'm using Relate, and why

- **Storage mode: a single `.rl` file** (`store/portfolio_n1000_seed1.rl`, 0.8 MB). Anyone can open the whole database without running a server. In-memory stores are used for tests.
- **Why Relate fits:** project schedules are naturally a graph (projects, facilities, crews, dependencies, programs). Relate is embedded, needs no server, speaks Cypher, and is built for agents, with a CLI agent mode, an MCP endpoint, and an installable skill. `relate clone` gives each agent a disposable copy for what-if scenarios without touching the original, and every node carries a provenance label, so it is always clear what is documented and what is modeled.
- **What I use:** the Python library to load data and run the conflict queries; the CLI to inspect the store; constraints and indexes to keep identities clean; `relate clone` and MCP were tested for agent use.

## What Relate can tell us about what is happening now

**Supported by the public record (documented)**, from GAO-26-107992:
- 8 of the 13 Phase 1 programs, including telecommunications, voice switches, radios, and radars, are due to finish in November or December 2028 (Table 2, p. 17).
- FAA officials call telecommunications the most critical program because it "provides the backbone for ATC communications" (p. 18), and said voice switches carry the highest risk (p. 25).
- As of June 2026, 30 months remained, with 2,610 fiber installs, 398 voice switches, and 1,311 radio sites still to do (pp. 26, 30).

Loaded into Relate with those relationships, a few queries can show which programs converge on the same deadline, which sit on the telecom backbone, and the installation pace needed to finish (simple arithmetic, labeled inferred, not a forecast). **Planned, not built yet.**

**Hypothetical only:** blast radius, single points of failure, and redundancy on a clearly labeled model. The real FAA network layout is not public.

**Not answerable here:** what caused the November 13 ground stop, or whether scheduling played any part.

## What works today

- A graph schema with unique IDs and a provenance label on every node: documented, simulated, or hypothesis (`schema/schema.cypher`).
- A seeded generator for synthetic portfolios from 100 to 11,389 projects with **known conflicts planted in them**: duplicate visits, resource conflicts, dependency violations, maintenance-window collisions, and decoys that look mergeable but are not. An independent checker recomputes every planted conflict from the raw files.
- A loader that puts a portfolio into a persistent Relate store and finds every conflict class in Cypher.
- **Result:** at 1,000 and at 11,389 projects, the Cypher results match the planted answers exactly, with nothing missing and nothing extra (114 of each class at full scale).

All generated data is **simulated**. Only the 13 programs (names, scope, completion dates) come from GAO's Table 2, p. 17. The 11,389-project size is a scale test, not a reconstruction of the FAA's portfolio.

## Not built yet

- The AI agent that answers questions through Relate.
- The graph of the 13 documented programs (deadline convergence, telecom backbone, required installation pace).
- The incident-scenario network model (hypothetical blast-radius and redundancy questions).
- A comparison against SQLite and a flat-file agent.

## Honest limits

- Nothing here measures real FAA conflicts, costs, or savings. GAO documents one concrete example and quantifies nothing else.
- The project makes no claim about the cause of the 2026-11-13 ground stop.
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
- Sources: GAO-26-107992, relatedb.ai, and the Relate repository.
