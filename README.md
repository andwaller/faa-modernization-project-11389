# FAA modernization - Project 11,389

**Can connected schedule data help teams coordinate complex modernization work?**

An experiment using Relate by Neo4j to connect work across programs and compare feasible schedule options. The repository includes a large simulated portfolio for conflict-detection experiments and a separate, smaller cost-aware scheduling trial.

## Why I started asking

I love learning the history of computing. After speaking at IBM TechExchange, I had been thinking about how organizations modernize systems that have to remain dependable while they change.

On November 13, 2026, the FAA issued a nationwide ground stop after communications problems affected multiple air traffic control centers. The FAA said a technical issue caused network instability during a remote facility router replacement and that the cause was under investigation. The incident raised questions for me about modernization and coordination. **I have no evidence that schedule integration caused the ground stop or that it would have prevented it.** [FAA update](https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers)

## The schedule-planning context

A report published before that incident, the GAO's September 14, 2026 report [GAO-26-107992](https://www.gao.gov/products/gao-26-107992), says that as of May 2026 the FAA had 11,389 individual project schedules supporting 13 BNATCS programs that were not integrated across projects. GAO described work at the same sites that generally was not coordinated across projects to address conflicts, optimize schedules, or reduce disruption.

GAO records this statement:

> “FAA officials stated that due to the high number of projects, attempting to integrate all the projects in their scheduling tool would not be useful or helpful.”

This is GAO's account of what unnamed FAA officials stated, not a direct quote from an identified official. DOT described program-level schedules and an AI scheduling tool in its response. GAO disagreed that the schedules logically sequenced work and managed interdependencies.

## Research question

Can a graph-based schedule model help identify cross-program dependencies and compare feasible options by crew hours, travel time, expenses, and completion dates?

## Thesis

Given project-level schedule data and clearly stated cost and time assumptions, a Relate by Neo4j-based model can connect work across programs and help produce feasible schedule alternatives with lower modeled travel time and expenses than the baseline. The evaluation will report the data and assumptions behind each alternative; simulated results will not be presented as actual FAA savings.

The project asks whether connected schedule data can support better analysis. It does not claim that the November ground stop was caused by scheduling, that the current prototype reproduces FAA schedules, or that the simulated savings are achievable in FAA operations.

## How I'm using Relate, and why

- **Storage mode:** a single `.rl` file (`store/portfolio_n1000_seed1.rl`, 0.8 MB). No server. In-memory stores for tests.
- **Why it fits:** schedules are a graph (projects, facilities, crews, dependencies, programs). Relate is embedded, speaks Cypher, and is built for agents (CLI agent mode, MCP endpoint, installable skill). `relate clone` gives an agent a disposable copy for what-if scenarios.
- **What I use:** the Python library to load data and run conflict queries, the CLI to inspect the store, and constraints and indexes to keep identities clean. Every node carries a provenance label: documented, simulated, or hypothesis.

## What works today

- **Schema** with unique IDs and provenance on every node (`schema/schema.cypher`).
- **Generator** for seeded synthetic portfolios of 100 to 11,389 projects with known conflicts planted in them: duplicate visits, crew conflicts, dependency violations, maintenance collisions, and decoys that look mergeable but are not. An independent checker recomputes each one.
- **Loader** that builds a persistent Relate store and finds every conflict class in Cypher.
- **Cost-aware scheduling trial:** a separate four-visit simulated schedule connects tasks, facilities, crews, dependencies, access windows, maintenance, and simulated required skills. Its deterministic Python search checks feasible dates. It now compares four travel cases: local day trips or overnight stays, each with billable or nonbillable travel time. The earlier overnight/billable run modeled $11,963–$13,671 at baseline and $9,664–$11,110 for the selected schedule. The new sensitivity runs have not yet been executed, so those earlier figures are not presented as applying to every case. See the [cost model and assumptions](docs/cost-aware-schedule-prototype.md).
- **Result:** at 1,000 and at 11,389 projects, Cypher finds every planted conflict with nothing missing and nothing extra (114 per class at full scale). This shows the queries are correct. It says nothing about how many conflicts the FAA has.
- **What-if queries** (`queries/thesis_questions.py`): site overlap, slip propagation through dependencies, and a merge test on a temporary copy. On the simulated full-scale portfolio, merging all 114 mergeable duplicate visits without checking crews raised crew conflicts from 114 to 326. A fix made in one schedule can break another.

- **Browser page** (`web/`, live): Relate's WebAssembly build runs in the page and loads 11,389 simulated projects by default (1,000 as an option). It is the portfolio conflict-detection experiment; the four-visit cost-aware schedule trial is a separate command-line experiment documented and linked from the page. The browser page has eight plain-language questions with labeled results, a tour, glossary and help, and a "Show the Cypher" panel. Every question was checked in a browser at both sizes against the Python results.
- **Ask box:** type a question in plain words. Without a key it is a simple matcher that picks the closest built-in question and says which one. It is not an AI.
- **Optional Claude agent:** a visitor can connect their own Anthropic API key, and an AI agent then writes its own Cypher against a scratch copy of the data, with every query shown. The loop, error handling, and the guarantee that the original data is untouched were tested with a simulated API. **It has not been tested against a live key.**

- **Agent test through Relate's own interfaces** ([`docs/agent-test.md`](docs/agent-test.md)): two fresh Claude Code sessions answered the same question over a 1,000-project store, one using the Relate skill and CLI and one using the Relate MCP server. Both found the planted answer (20 close pairs, 10 at restricted sites) on the first full query. It was one run per path, so it shows the interfaces work and makes no claim about efficiency.

**Not built yet:** an authorized portfolio of FAA task-level schedules, validated crew qualifications and availability, contract-specific travel and labor costs, a production optimizer, and a repeated evaluation using real approved data. The public St. Louis overlap is recorded separately as a documented reference pair; it is not enough information to optimize that work.

## Limits

- The cost-aware trial is also simulated. Its BLS/GSA-based rates and per diem are estimation benchmarks, not L3Harris billing rates or FAA-specific costs. Its four-case sensitivity analysis still relies on explicit hypothetical local-versus-overnight and billable-versus-nonbillable assumptions; it does not estimate routing, airfare, mileage, or vehicle charges. Crew skill matching is checked against invented capability lists only, not real qualifications, certifications, availability records, or staffing rules. Team-clock-hour interpretation and contract terms need validation.

- All generated data is simulated. Only program names, scope, and completion dates are real (GAO Table 2, p. 17). The 11,389 size is a scale test, not a reconstruction of the FAA's portfolio.
- 11,389 counts schedules, not conflicts. GAO does not define a "project," and its Table 2 totals add up to 8,918.
- Connecting the data is easy. Keeping thousands of real schedules current is the hard part, and this project does not test it.
- No speed claim. At 11,389 projects, some checks take 2 to 4 seconds in Python and several seconds in the browser, and the "try a fix" question can take around 15 seconds. They are not optimized, and the page cannot respond while one runs.
- The agent's answers are written by an AI and can be wrong. The built-in questions are checked against planted answers; the agent's are not.

## Cost-aware schedule trial

Run the four-visit simulation locally with `python examples/cost_aware_schedule_trial.py`. The output now prints baseline and selected schedules for each of four assumption combinations. All dates, skills, per diem applicability, crew assignments, and trip cases remain illustrative. See [the documented St. Louis reference pair](data/st_louis_documented_anchor.json), which contains only the facts GAO reports and is not fed to the optimizer.

## Try it in your browser

**Live page: https://andwaller.github.io/faa-modernization-project-11389/** (nothing to install).

`web/` is a page that runs Relate by Neo4j inside the browser, using its WebAssembly build. To run it yourself, serve the folder and open it:

```powershell
cd web
python -m http.server 8765
```

Open http://localhost:8765. It loads 11,389 simulated projects by default, and you can choose 1,000 instead. The page has an ask box, eight plain-language questions, a first-visit tour, a glossary, a help panel, and a "Show the Cypher" panel under every answer.

- **Privacy:** everything runs in your browser and nothing is sent anywhere, unless you choose to connect Claude. Then your question and the query results go to `api.anthropic.com` and nowhere else. The key stays in the tab's memory, is never stored, and is forgotten when you close or reload the tab. The page enforces the destination with a content security policy. Use a key with a low spending limit, because usage is billed to your Anthropic account.
- **Speed:** at 11,389 projects, loading takes roughly 5 to 15 seconds, and a few questions take several seconds more.
- **Engine:** the WebAssembly build (`@relate/relate-wasm` 1.0.1, Apache-2.0) is included in `web/vendor/`. In the browser the database is in memory, so each visit loads the data again, and "try a fix" builds its copy by reloading the data rather than with `relate clone`.

## Try it

Requires Python 3.10 or later (tested on 3.14, Windows, `relate-db` 1.0.1).

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt

# generate a portfolio (same seed, same files)
.venv\Scripts\python.exe -I generator\generate_portfolio.py --n 1000 --seed 1 --out data\synthetic

# check the generator against its own oracle
.venv\Scripts\python.exe -I generator\verify_portfolio.py data\synthetic\portfolio_n1000_seed1

# load into a new Relate store and verify every conflict class in Cypher
.venv\Scripts\python.exe -I loader\load_portfolio.py --portfolio data\synthetic\portfolio_n1000_seed1 --store store\my_store.rl --verify

# answer the thesis questions (runs on a temporary copy; the store is not changed)
.venv\Scripts\python.exe -I queries\thesis_questions.py --store store\my_store.rl
```

Inspect the included store with the Relate CLI ([install](https://relatedb.ai/docs/get-started/install)):

```powershell
relate -d store\portfolio_n1000_seed1.rl --read-only --toon "MATCH (n) UNWIND labels(n) AS l RETURN l, count(*) AS n"
```

## More detail

| Path | What it is |
|---|---|
| `web/` | The browser page (also published as the live page) and its data |
| `schema/` | Graph schema: constraints and indexes |
| `generator/` | Seeded portfolio generator and its independent checker |
| `loader/` | Loads a portfolio into a Relate store and verifies it in Cypher |
| `queries/` | The thesis questions as a Python script |
| `store/` | A ready-made 1,000-project Relate store |
| `DESCRIPTION.md` | The story in more detail |
| `PHASE1-REPORT.md` | Historical Phase 1 research snapshot; later implementation and thesis changes are summarized in this README and DESCRIPTION |
| `PREREGISTRATION.md` | Draft evaluation plan for the current schedule-coordination thesis |
| `ARTIFACTS.md` | Current implementation status and known gaps |

## Disclosures

- Built with Claude Code (Claude Sonnet 5.5).
- The page's optional agent uses a Claude model through the visitor's own API key. The built-in questions and the ask box's matcher use no AI.
- The author works at Neo4j, which publishes Relate.
- Sources: GAO-26-107992, FAA Modern Skies (modernskies.faa.gov), FAA statement of November 13, 2026, relatedb.ai, and the Relate repository.

## License

Apache-2.0. See [LICENSE](LICENSE).
