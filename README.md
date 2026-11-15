## Inspiration

I love the history of computing. Just back from IBM TechExchange, where I gave a talk, I had been watching videos about modernizing stable, critical systems. Banks still run core systems on mainframes descended from the IBM System/370: decades old and rock solid.

Then, on November 13, 2026, the FAA ordered a nationwide ground stop, citing communication issues at multiple air traffic control centers. News coverage pointed to aging telecommunications equipment: outdated technology.

I wondered: **the technology may be outdated, but could the project management approach have an impact too?**

# FAA modernization - Project 11,389

**Thousands of infrastructure projects, each on its own schedule. What happens when you connect them?**

An experiment using [Relate by Neo4j](https://relatedb.ai), the embedded graph database, to connect project schedules so an AI agent can find problems no single schedule shows. *Work in progress.*

**[Try the live page](https://andwaller.github.io/faa-modernization-project-11389/)**: nothing to install. Relate runs inside your browser, and you can ask questions in your own words.

## Where the 11,389 comes from

GAO's report on FAA modernization ([GAO-26-107992](https://www.gao.gov/products/gao-26-107992), September 2026) gave me the number:

> "FAA has not developed an integrated master schedule for phase 1. Instead, FAA has 11,389 individual project schedules that are not integrated."

GAO reports that FAA officials said integrating that many projects in their scheduling tool "would not be useful or helpful" (p. 29). The Department of Transportation disputes GAO's finding (pp. 33 to 34).

## Thesis

> The number of schedules is not the obstacle. Once the schedules are connected in a graph, an AI agent can surface the overlaps and dependencies that no single schedule shows, and can test a fix before anyone acts on it.

**It does not claim** that integration would save the FAA money or time, that the FAA is wrong, or that scheduling caused the ground stop. GAO documents one overlap (St. Louis) and measures nothing else, and no source I have found establishes the cause.

## How I'm using Relate, and why

- **Storage mode:** a single `.rl` file (`store/portfolio_n1000_seed1.rl`, 0.8 MB). No server. In-memory stores for tests.
- **Why it fits:** schedules are a graph (projects, facilities, crews, dependencies, programs). Relate is embedded, speaks Cypher, and is built for agents (CLI agent mode, MCP endpoint, installable skill). `relate clone` gives an agent a disposable copy for what-if scenarios.
- **What I use:** the Python library to load data and run conflict queries, the CLI to inspect the store, and constraints and indexes to keep identities clean. Every node carries a provenance label: documented, simulated, or hypothesis.

## What works today

- **Schema** with unique IDs and provenance on every node (`schema/schema.cypher`).
- **Generator** for seeded synthetic portfolios of 100 to 11,389 projects with known conflicts planted in them: duplicate visits, crew conflicts, dependency violations, maintenance collisions, and decoys that look mergeable but are not. An independent checker recomputes each one.
- **Loader** that builds a persistent Relate store and finds every conflict class in Cypher.
- **Result:** at 1,000 and at 11,389 projects, Cypher finds every planted conflict with nothing missing and nothing extra (114 per class at full scale). This shows the queries are correct. It says nothing about how many conflicts the FAA has.
- **What-if queries** (`queries/thesis_questions.py`): site overlap, slip propagation through dependencies, and a merge test on a temporary copy. On the simulated full-scale portfolio, merging all 114 mergeable duplicate visits without checking crews raised crew conflicts from 114 to 326. A fix made in one schedule can break another.

- **Browser page** (`web/`, live): Relate's WebAssembly build runs in the page and loads 11,389 simulated projects by default (1,000 as an option). It has eight plain-language questions with labeled results, a tour, glossary and help, and a "Show the Cypher" panel. Every question was checked in a browser at both sizes against the Python results.
- **Ask box:** type a question in plain words. Without a key it is a simple matcher that picks the closest built-in question and says which one. It is not an AI.
- **Optional Claude agent:** a visitor can connect their own Anthropic API key, and an AI agent then writes its own Cypher against a scratch copy of the data, with every query shown. The loop, error handling, and the guarantee that the original data is untouched were tested with a simulated API. **It has not been tested against a live key.**

- **Agent test through Relate's own interfaces** ([`docs/agent-test.md`](docs/agent-test.md)): two fresh Claude Code sessions answered the same question over a 1,000-project store, one using the Relate skill and CLI and one using the Relate MCP server. Both found the planted answer (20 close pairs, 10 at restricted sites) on the first full query. It was one run per path, so it shows the interfaces work and makes no claim about efficiency.

**Not built yet:** a repeated, pre-registered benchmark of agents using Relate against SQLite and a flat-file agent, a graph of the documented programs and sites, and the hypothetical incident-scenario model.

## Limits

- All generated data is simulated. Only program names, scope, and completion dates are real (GAO Table 2, p. 17). The 11,389 size is a scale test, not a reconstruction of the FAA's portfolio.
- 11,389 counts schedules, not conflicts. GAO does not define a "project," and its Table 2 totals add up to 8,918.
- Connecting the data is easy. Keeping thousands of real schedules current is the hard part, and this project does not test it.
- No speed claim. At 11,389 projects, some checks take 2 to 4 seconds in Python and several seconds in the browser, and the "try a fix" question can take around 15 seconds. They are not optimized, and the page cannot respond while one runs.
- The agent's answers are written by an AI and can be wrong. The built-in questions are checked against planted answers; the agent's are not.

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
| `PHASE1-REPORT.md` | Sources, the GAO and DOT positions, and what the 11,389 does and does not mean |
| `PREREGISTRATION.md` | The planned test design |
| `ARTIFACTS.md` | What is built, what is not |

## Disclosures

- Built with Claude Code (Claude Sonnet 5.5).
- The page's optional agent uses a Claude model through the visitor's own API key. The built-in questions and the ask box's matcher use no AI.
- The author works at Neo4j, which publishes Relate.
- Sources: GAO-26-107992, FAA Modern Skies (modernskies.faa.gov), FAA statement of November 13, 2026, relatedb.ai, and the Relate repository.

## License

Apache-2.0. See [LICENSE](LICENSE).
