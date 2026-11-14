## Inspiration

I love learning the history of computer technology. I had just come back from IBM TechExchange, where I gave a talk, and I had been watching videos about modernizing stable, critical systems. Banks, for example, still run core systems on mainframes that descend from the IBM System/370: decades old and rock solid.

Then, on November 13, 2026, the FAA ordered a nationwide ground stop. The last one, in January 2023, was the first since the September 11, 2001 attacks (GAO-26-107992, p. 6). The media's reporting on what happened and why left me with more questions. If old systems can be rock solid, was age really the problem? GAO says FAA's aging systems are hard to maintain because replacement parts are unavailable and the technicians who knew them are retiring (p. 6). So I asked: **was this a technology problem or a project management problem?**

I put the same question to my network on LinkedIn:

<details>
<summary>My LinkedIn post</summary>

> **Antiquated Tech or Management?**
>
> Curious what others with experience in large-scale infrastructure modernization think?
>
> Aren't some of our most critical systems run on some of our oldest technology...but remain exceptionally reliable?
>
> With the recent FAA shutdown being attributed to aging telecommunications infrastructure, I have to wonder: Is the issue really the aging technology, or how we're managing its modernization?
>
> If newer technology overwhelmed older systems, shouldn't that have been anticipated, tested, and accounted for?
>
> A September 2026 GAO report identified 11,389 individual project schedules without an integrated master schedule, along with accelerated modernization timelines.
>
> I'm not suggesting this caused the shutdown, but it raises some reasonable questions about planning, dependencies, redundancy, and testing.
>
> GAO report: https://www.gao.gov/products/gao-26-107992

*(Posted as written, except that the shortened LinkedIn links are replaced with the direct GAO link and the dashboard link is removed.)*

</details>

That question led me to GAO's report on the FAA's modernization, where one sentence stood out:

> "FAA officials stated that due to the high number of projects, attempting to integrate all the projects in their scheduling tool would not be useful or helpful."
>
> GAO-26-107992, p. 29 (GAO's account of what FAA officials stated, not a direct quote from an FAA official)

The more projects there are, the harder it is to see how they connect. That is where I thought a graph might help, rather than a reason to give up.

I am not saying the FAA is wrong, and I am not suggesting scheduling caused the ground stop. News coverage attributed it to aging telecommunications equipment, but no source I have found establishes the underlying cause, and the FAA's integrator says its own AI scheduling tool is in the works. I wanted to see what connecting the data would actually let an AI agent find.

# Project 11,389

**Thousands of infrastructure projects, each on its own schedule. What happens when you connect them?**

An experiment in using [Relate](https://relatedb.ai), Neo4j's embedded graph database, to make the connections between project schedules visible, so that an AI agent can find problems no single schedule shows.

*Work in progress for the Relate by Neo4j Hackathon 2026. See "What works today" and "Not built yet" below.*



## The problem

Large modernization programs run as thousands of separate projects. The trouble is in the connections: two projects visiting the same facility months apart, one crew booked in two places at once, a project scheduled before the work it depends on. Each schedule looks fine alone. The conflict only appears when they are connected.

GAO documented this pattern at the FAA. Its September 2026 report ([GAO-26-107992](https://www.gao.gov/products/gao-26-107992)) found **11,389 individual project schedules that were not integrated across programs**, and gave one example: site preparation for a voice switch at a St. Louis facility in April 2027, and the information-displays program planning its own site preparation at the same site about eight months later. GAO reported that FAA officials said integrating all the projects in their scheduling tool "would not be useful or helpful." The Department of Transportation disputes parts of GAO's findings, and GAO did not measure what these overlaps cost.

So this project does not claim to know how big the problem is. It asks something smaller and testable: **when schedule data is connected, how easily can an AI agent find these problems?**

## How I'm using Relate, and why

- **Storage mode: a single `.rl` file** (`store/portfolio_n1000_seed1.rl`, 0.8 MB). Anyone can open the whole database without running a server. In-memory stores are used for tests.
- **Why Relate fits:** project schedules are naturally a graph (projects, facilities, crews, dependencies, programs). Relate is embedded, needs no server, speaks Cypher, and is built for agents, with a CLI agent mode, an MCP endpoint, and an installable skill.
- **What I use:** the Python library to load data and run the conflict queries; the CLI to inspect the store; constraints and indexes to keep identities clean; `relate clone` and MCP were tested for agent use.

## What works today

- A graph schema with unique IDs and a provenance label on every node: documented, simulated, or hypothesis (`schema/schema.cypher`).
- A seeded generator for synthetic portfolios from 100 to 11,389 projects with **known conflicts planted in them**: duplicate visits, resource conflicts, dependency violations, maintenance-window collisions, and decoys that look mergeable but are not. An independent checker recomputes every planted conflict from the raw files.
- A loader that puts a portfolio into a persistent Relate store and finds every conflict class in Cypher.
- **Result:** at 1,000 and at 11,389 projects, the Cypher results match the planted answers exactly, with nothing missing and nothing extra (114 of each class at full scale).

All generated data is **simulated**. Only the 13 programs (names, scope, completion dates) come from GAO's Table 2, p. 17. The 11,389-project size is a scale test, not a reconstruction of the FAA's portfolio.

## Not built yet

- The AI agent that answers questions through Relate.
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
