# Project 11,389

Seeing the connections between thousands of infrastructure project schedules, with [Relate](https://relatedb.ai), the embedded graph database.

**Status: work in progress.** See `DESCRIPTION.md` for the problem and approach, `ARTIFACTS.md` for what is built and what is not, and `PHASE1-REPORT.md` and `PREREGISTRATION.md` for sources and the planned test design.

## What exists today

- `schema/schema.cypher`: the graph schema (constraints and indexes), tested in Relate.
- `generator/`: a seeded generator for synthetic project portfolios (100 to 11,389 projects) with planted conflicts, and an independent checker (`verify_portfolio.py`) that recomputes every planted conflict from the raw files. All generated data is **simulated**; only the 13 programs in `programs.csv` come from GAO-26-107992, Table 2, p. 17.
- `loader/load_portfolio.py`: loads a portfolio into a persistent Relate store and, with `--verify`, recomputes every conflict class in Cypher and compares it with the planted answers.
- `store/portfolio_n1000_seed1.rl`: a ready-made 1,000-project Relate store (0.8 MB).

Not built yet: the AI agent demo, the incident-scenario network model, and the comparison against SQLite and a flat-file agent.

## Run it

Requires Python 3.10 or later. Tested with Python 3.14 on Windows, `relate-db` 1.0.1.

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

Inspect the included store with the Relate CLI (install from [relatedb.ai](https://relatedb.ai/docs/get-started/install)):

```powershell
relate -d store\portfolio_n1000_seed1.rl --read-only --toon "MATCH (n) UNWIND labels(n) AS l RETURN l, count(*) AS n"
```

## Honesty notes

- Nothing here measures real FAA conflicts, costs, or savings. GAO documents one concrete example (St. Louis) and quantifies nothing else.
- The project makes no claim about the cause of the 2026-11-13 FAA ground stop.
- Some full-scale (11,389-project) Cypher conflict checks take 2 to 4 seconds. They have not been optimized.

Built with Claude Code (Claude Sonnet 5.5).
