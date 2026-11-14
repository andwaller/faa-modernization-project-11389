# Project 11,389 — Phase 1 Report
**Research and verification, with a feasibility assessment and implementation plan.**
Prepared 2026-11-14. This is a working document for a follow-up blog post. No application code has been written yet.

Sources are linked inline. **[V]** means verified against a primary source in this session. **[S]** means secondary or summarized only; re-check before publishing. **[U]** means unverified.

---

## Premise (revised after the full-report check)

> GAO reports that FAA's project schedules aren't integrated across programs, but it does not measure the cost, and public data cannot size the problem. This project tests one narrower question: **is detecting cross-project scheduling conflicts cheaper or more efficient for an AI agent with Relate than with existing tools?**

- **"Cheaper or more efficient"** is measured as cost per correct detection: tokens and dollars, tool calls, wall-clock time, retries, and integration effort, set against detection accuracy on seeded ground truth.
- **"Existing tools"** means the alternatives an agent could use today: (1) an agent with code execution over flat files (CSV with pandas), (2) SQLite/SQL, and optionally (3) the Neo4j server. (LadybugDB was dropped and DuckDB replaced by SQLite on 2026-11-14.) The flat-file agent is the most honest baseline and must be included. If it matches Relate, a database isn't what makes the difference.
- **Out of scope:** FAA's actual scheduling tool (GAO doesn't name it), FAA's real savings, and whether FAA or GAO is right.
- **Controls:** same data, model, prompts, task list and shared OR-Tools validator across all arms. Accuracy is scored against planted conflicts, so a cheaper arm that misses conflicts does not count as more efficient.
- **A tie or a loss for Relate is a valid result.**

---

## Direction updates (2026-11-14)

0. **SQLite replaces DuckDB** as the relational baseline. Measured on the 11,389-project portfolio (5 runs after warm-up): both found all 114 planted duplicate-visit conflicts. SQLite took about 16–29 ms and DuckDB about 6–14 ms, so speed is irrelevant at this scale. SQLite ships with Python, so there is nothing to install. DuckDB's CSV loader turned empty fields into NULL and returned 0 conflicts on a first attempt, which is a trap for agents. Both are relational, non-graph databases.
1. **LadybugDB is dropped** by the author's decision. The only graph-database control is the Neo4j server, and only if one is needed. Earlier sections that discuss LadybugDB are kept as research record, not as plan.
2. **The most recent FAA incident is now in scope.** The author asked to focus on Relate and Neo4j technology and to test theories about the 2026-11-13 ground stop. This supersedes the earlier instruction to treat the outage as an aside. The incident's cause is not established in any source I have read, so the project can test the *method* on a hypothetical model, not the cause. See PREREGISTRATION.md section 12.
3. **Generator built.** `generator/` produces seeded synthetic portfolios at 100, 1,000, 5,000 and 11,389 projects, with an independent oracle that recomputes every planted conflict class. Development seed 1 verified at all four scales with zero missing and zero extra items, and output is byte-identical on regeneration. Test seeds (101–105) have not been generated.

---

## Thesis and abstract

**Thesis (falsifiable).** For detecting cross-program scheduling conflicts in structured schedule data, an AI agent using Relate reaches detection accuracy no worse than the same agent using flat files or SQLite, at lower cost per correct detection.

*Proposed pre-registered thresholds (to be confirmed before any run):* Relate wins only if its median tokens or tool calls are at least 25% below the best alternative, the difference exceeds run-to-run spread over at least 5 runs, and recall is within 5 percentage points of the best arm. Anything else is reported as a tie or a loss.

**Abstract (draft for the blog).** GAO-26-107992 reports that the FAA's 11,389 modernization project schedules were not integrated across programs, and gives one example: two site-preparation visits to the same St. Louis facility about eight months apart. GAO does not measure what such conflicts cost, and public data cannot size the problem. This project asks a narrower, testable question: when schedule data exists, is it cheaper or more efficient for an AI agent to detect cross-program conflicts with Neo4j's embedded graph database Relate than with existing tools? We compare agents using Relate, SQLite, and plain files on one documented case and seeded synthetic portfolios up to 11,389 projects, with planted ground-truth conflicts and a shared constraint validator. We report accuracy, tokens, tool calls, time, and setup effort, including any result where Relate offers no advantage. We make no claim about FAA's actual savings.

---

## Testability with Relate (smoke test run 2026-11-14)

Environment: `relate-db` **1.0.1** from PyPI (the repo and limitations doc say 1.0.2), Python 3.14, Windows 11. One run each unless stated. Script: scratchpad `relate_smoke.py`.

| Statement the experiment needs | Result | Evidence |
|---|---|---|
| Embedded in-process use, nothing to deploy | **Verified** | In-memory connect plus query took 5.5 ms (first call in the process). |
| St. Louis case as a graph with provenance | **Verified** | Shared-facility query returned the voice-switch and information-display pair. Provenance stored as node and relationship properties. |
| Identity rules (no duplicate projects) | **Verified** | A unique constraint rejected a duplicate with `IntegrityError`. |
| Cypher needed for dependency analysis | **Verified (basic)** | Quantified path pattern `((x)-[:PRECEDES]->(y)){1,5}` returned the right chain. |
| 11,389-project scale | **Runs, not yet compared** | Bulk load through `UNWIND`/`MERGE` took about 4.9 s. A same-facility pair query over 11,389 projects (30,534 pairs) had a median of 699 ms over 5 runs. No comparator yet, so no conclusion. |
| Disposable per-scenario workspaces | **Partly verified** | In-memory databases work. Copying a file store (3.1 ms for a 32 KB store) gave an independent clone: a write to the clone did not appear in the source. Native `relate clone` and clone cost at scale were not tested. |
| One agent per store | **Verified, with a limit** | A second connection to the same file failed with `storage locked`. Parallel agents each need their own store. |
| Read-only inspection | **Verified** | `read_only=True` refused a write. |
| Vector search | **Basic only** | Vector property and cosine similarity worked. Vector indexes and `SEARCH` were not tested and are not needed for the MVP. |
| Agent mode, compact output, row caps | **Verified (CLI v1.0.1)** | Agent mode switched on by itself in this Claude Code session (environment variables `AI_AGENT` and `CLAUDECODE` are set). A plain query returning 11,389 rows was truncated to **100 rows** with a stderr warning and a `rowCap {kept:100,total:11389}` field. `--max-rows N` overrides it. 200 rows measured **3,962 bytes as JSON, 3,835 as JSONL, 2,169 as TOON, 1,708 as CSV**. TOON is about 45% smaller than JSON, but **CSV was smaller still**, so "compact" is relative to JSON. Agent-mode output also appends a timings block unless `--timings` rules change that. |
| MCP server | **Verified (CLI v1.0.1)** | `relate serve -d store --mcp 7475` served streamable HTTP with basic auth (a generated token is printed and saved next to the store). `initialize` and `tools/list` worked. Tools: `write_cypher`, `read_cypher`, `get_schema`. I did not complete a tool call. My one attempt used the wrong tool name. |
| `relate clone` | **Verified** | Cloned a 3.8 MB store in about 260 ms. The clone was 332 KB (the source carried an unflushed WAL segment). A write to the clone did not appear in the source. |
| Store locking | **Verified** | While `serve` held a store, a second CLI open failed with exit code 5 (`storage locked`), as documented. |
| Skill install | **Not tested, deliberately** | `relate skill install` writes into the coding agent's configuration. I left it alone. Its file locations are undocumented on the install page. |
| "Millisecond startup, submillisecond queries" (launch post) | **Partly consistent, not confirmed** | Open and trivial queries took about 1–7 ms in a single un-warmed run. The overlap query took about 700 ms. Needs a proper warmed, repeated benchmark. |

**Status of the agent-facing features.** Agent mode, TOON output, row caps and MCP now exist and work as documented (see the table). Two cautions for the thesis. First, automatic agent mode and the 100-row cap change what an agent sees by default, so the benchmark must record the agent-mode setting for every arm. Second, "compact" output is a modest advantage over JSON and not over CSV, so it may not move token counts much. That is exactly what the experiment should measure.

**Install notes.** The Windows installer was read before running. It verifies an ed25519 signature on `SHA256SUMS` against a key pinned in the script, checks the signed version line, and checks the binary's SHA-256. It installs to `%LOCALAPPDATA%\Programs\relate` and adds that folder to the user PATH. It does not change agent configuration. The binary prints "relate collects anonymous usage metrics; disable anytime: relate telemetry off". Telemetry has been left on; the benchmark should turn it off and say so.

**Design consequence: split Relate into two arms.**
- **R1, Relate via its agent interface** (CLI agent mode or MCP, as the project intends).
- **R2, Relate via the Python API**, driven the same way as the SQLite arm.

R1 vs R2 isolates the value of the agent interface. R2 vs the other databases isolates the value of the database. Without this split, any win cannot be attributed.

**What cannot be tested with Relate, or at all:** real FAA conflict frequency or savings; comparison against FAA's or Peraton's tools; anything that needs non-public schedule data.

**Next verification steps (before pre-registration):**
1. Complete one MCP `read_cypher` call and one `get_schema` call end to end.
2. Decide the version to pin (v1.0.1 is the latest release) and record the binary and wheel hashes.
3. Re-run the load and query timings with warm-up and at least 5 repetitions, alongside SQLite.

---

## Hackathon alignment: Relate by Neo4j Hackathon 2026

Sources: https://relate.devpost.com/ and https://relate.devpost.com/rules. Both were read through page-summarization, and the two pages disagree in places (below). **Read the official rules directly before submitting.**

### Blocking question: eligibility
- The rules page says **Neo4j employees and affiliates are excluded** from eligibility (Sec. 2). The main Devpost page says employees "may participate but can't win the three prizes."
- This session's account email is a neo4j.com address. If that means you are a Neo4j employee, you may not be able to win or perhaps even enter. **Confirm with hackathons@neo4j.com before investing in the submission.** I have not assumed an answer.
- Independently of the prize, a Neo4j employee benchmarking a Neo4j product against competitors should disclose that affiliation prominently in the blog.

### Requirements (official rules, Sec. 1–5, 7)
| Item | Requirement |
|---|---|
| Dates | Contest period Nov 11 – **Dec 11, 2026, 6:00 PM PST**. Judging Dec 12–16. Winners Dec 17. |
| New work only | Project must start on or after Nov 11, 2026. Pre-existing projects are not accepted. Reused own code or libraries must be disclosed. Project 11,389 started Nov 14, so it qualifies on timing. |
| Team | 1 to 4 people. One team per person. |
| Relate use | "Meaningful use of Relate" that actually runs. Prompt-only entries are not considered. |
| Repo | Public GitHub repo with the topic `relate`, kept public through Dec 17. Open-source license recommended (MIT or Apache-2.0). |
| Submission | Title and description, repo link, setup instructions a judge can run, a demo video of up to 2 minutes or a working demo link, and a statement of Relate capabilities, third-party tools and **AI tools used**. |
| Devpost page extras | A persistent Relate store (directory or `.rl` file) judges can inspect, and a README answering "how are you using Relate, and why?" including the storage mode. |
| AI-assisted code | Allowed, but significant AI use must be described in the submission. |
| Blog | **Not required and not forbidden.** The rules do not mention one. |
| Branding | Do not imply Neo4j endorses the project (Sec. 8). |

### Judging criteria disagree between the two pages
- Devpost page: Relate and connected context 30, functionality 25, usefulness 20, creativity 10, documentation and reproducibility 15.
- Official rules: five criteria, "weighted equally": creativity, usefulness, completeness, clarity, effective use of connected context.
- Both reward a working, reproducible, clearly explained project that uses Relate meaningfully. Plan for both.

### How the project maps onto the hackathon
- **Theme "Context, connected":** schedules, programs, and facilities connected so conflicts across programs become visible. This fits.
- **Honest-benchmark framing is compatible.** Nothing in the rules requires Relate to win. A clear negative or mixed result still shows meaningful use. Do not let judging incentives bend the pre-registration.
- **Scope has to shrink.** The 15-deliverable plan will not fit in the 27 days left. A submittable core:
  1. The St. Louis case plus a seeded synthetic portfolio, stored in a persistent `.rl` file with provenance on every record.
  2. One agent workflow over Relate (CLI agent mode or MCP) that finds cross-program conflicts and has a deterministic checker validate its proposals.
  3. A small benchmark against SQLite and a flat-file agent, reported honestly.
  4. A README that answers "how are you using Relate, and why?", plus a demo video of up to 2 minutes.
  5. An AI-use disclosure covering this Claude Code session.
- **Blog:** write it alongside the build from the pre-registration onward. Keep the blog's claims at the level of the evidence, per section 9.

---

## 0. Bottom line

1. **The GAO quote is real and accurate [V].** It appears on p. 29 and again on p. 34 of the report. It is GAO's account of what "FAA officials stated," not a verbatim FAA quote.
2. **The framing needs one important correction.** FAA and its integrator are already building the AI scheduling-conflict tool this project proposes. The question is therefore "can an independent, open, graph-based approach reproduce or beat that?", not "what if AI could do this?"
3. **DOT disputes GAO's characterization [V].** Its written comments say an integrated detailed master schedule exists for each Phase 1 program. GAO disagrees. The blog should present both positions.
4. **There is no public project-level schedule data [V for GAO, U for other sources].** The only documented cross-project conflict is the St. Louis example. It has two dates and no facility identity. Any larger test has to be synthetic and labeled that way.
5. **Relate is real and usable [V].** It is v1.0.2 and Apache-2.0. It is also explicitly single-process, single-graph, and RAM-only. That is a good fit for disposable agent workspaces and a poor fit for any claim about scale or multi-tenancy.
6. **At 11,389 projects, performance will not separate the engines.** The graph is tiny. The honest comparison for Hypothesis 2 is agent ergonomics (tool calls, tokens, setup effort), not query speed.
7. **Recommendation: proceed.** Run a narrow experiment, described in section 8.

---

## 1. The GAO report

**Report:** GAO-26-107992, *Air Traffic Control Systems: Ambitious New Modernization Effort Needs to Improve Cost and Schedule Planning*. Published 2026-09-14.
Landing page: https://www.gao.gov/products/gao-26-107992 [V]
PDF: https://www.gao.gov/assets/gao-26-107992.pdf [V]. Note that gao.gov returned "Access Denied" to plain `curl` but served the PDF through the fetch tool. Text was extracted locally from the 52-page PDF.

### 1.1 The statement, verbatim

> "FAA officials stated that due to the high number of projects, attempting to integrate all the projects in their scheduling tool would not be useful or helpful."

- **Where it appears:** the "FAA Developed Thousands of Project Schedules, but Not an Integrated Schedule" section on **p. 29** (PDF page 33). GAO repeats it in the agency-comments section on **p. 34** (PDF page 38).
- **Exact match with the project brief:** yes. The brief's quote is word-for-word.
- **Attribution:** it is GAO relaying what unnamed FAA officials said, not a quote from an identified person. Write "GAO reports that FAA officials stated…" in the blog.

### 1.2 Full context (all [V], p. 29–30 unless noted)

- **The count:** "FAA has 11,389 individual project schedules that are not integrated" (highlights page). The body says "11,389 schedules of its 11,389 projects that support the 13 BNATCS programs," as of May 2026.
- **Who builds the integrated schedule:** under the BNATCS contract the integrator, **Peraton Inc.** (awarded 2025-12-05), is responsible for an integrated master schedule for Phase 1. Peraton delivered a *preliminary* integrated master schedule in April 2026.
- **Consequence GAO draws:** "individual projects are scheduled to conduct different installations at the same installation sites repeatedly, generally without addressing potential conflicts, optimizing the schedules, or reducing disruptions to air traffic control operations."
- **Manual workaround:** "in limited cases, project officials manually identify conflicts associated with their project, but this is not occurring on a wide scale."
- **FAA's planned fix:** in May 2026 officials said they plan to implement "an artificial intelligence tool to automatically identify schedule conflicts and opportunities to better coordinate installations among the projects at each site." The tool was "undergoing testing," and "the business rules for using the tool and the new process have not been established." GAO adds that it is unclear when the tool will be implemented or how effective it will be.
- **DOT/FAA's formal response (p. 33–34):** DOT partially concurred with both recommendations. It said FAA "developed and maintains an integrated detailed master schedule for each BNATCS phase 1 program, covering the next three years," with "over 11,000 unique project tasks, averaging 30 activities in each task." It said Peraton has an "advanced scheduling tool using AI" that is "in the process of being fully optimized."
- **GAO's rebuttal (p. 34):** "We disagree that FAA has established an integrated detailed master schedule for each BNATCS program that logically sequences activities and manages interdependencies."
- **Recommendation 2:** prioritize "a detailed integrated master schedule" for Phase 1 per GAO's Schedule Assessment Guide (GAO-16-89G). Status: open.
- **Not verified:** which scheduling tool FAA uses. The report says GAO observed "a live demonstration of FAA's use of its scheduling tool" but, in the text I searched, does not name the product.

### 1.3 The St. Louis example (p. 30) [V]

> "in April 2027, technicians are scheduled to visit a facility in St. Louis, Missouri to conduct site preparation for the installation of a voice switch, and then approximately 8 months later in January 2028, the information displays program is planning to conduct site preparation for installation at the same site. Multiple visits are not optimal and will cause unnecessary disruption to the ATC facilities."

Corrections to the brief:
- The highlights page and landing page do **not** mention St. Louis. It is only in the body at p. 30.
- The facility is not identified beyond "a facility in St. Louis, Missouri." We cannot say whether it is a tower, TRACON, or other facility.
- There are exactly two documented data points: voice-switch site prep in April 2027 and information-display site prep in January 2028.
- No durations, crew sizes, access windows, or cost figures are given. Any alternative schedule must therefore be a labeled conditional scenario.

### 1.4 Other quantitative facts usable as documented nodes [V]

Table 2 (p. 17), Phase 1 plan as of May 2026, lists 13 programs:

| Domain | Program | Planned scope | BNATCS completion |
|---|---|---|---|
| Automation | Information displays | 435 locations | 9/30/2028 |
| Automation | Terminal Flight Data Manager | 89 airports | 11/30/2028 |
| Communications | Telecommunications | 5,170 copper lines to fiber; ~30,000 services to IP | 12/31/2028 |
| Communications | Voice switches | 450 | 11/30/2028 |
| Communications | Radios | 1,581 sites | 12/31/2028 |
| Surveillance | Radars | 612 | 12/31/2028 |
| Surveillance | Surface Awareness Initiative | 220 airports total | 8/31/2027 |
| Surveillance | Surface Movement Radar | 53 | 12/31/2028 |
| Weather | Weather cameras | 64 sites | 9/30/2028 |
| Weather | Automated Weather Observation System | 50 locations | 12/31/2028 |
| Weather | Visual Weather Observation System | 60 locations | 9/30/2028 |
| Weather | Alaska Automation Capability | 17 locations | 12/31/2028 |
| Other | Tower Simulation System | 117 towers | 5/31/2028 |

Remaining installations as of the report (p. 30): 2,610 fiber optic cable installations, 435 Enterprise Information Display Systems, 72 Terminal Flight Data Manager systems, 398 voice switch installations, 1,311 radio site installations, 166 Surface Awareness Initiative installations.

The report also says nine of the 13 programs have work underway. Phase 1 is stated as $10.6 billion over 3 years, with a further $10.2 billion expected for Phase 2.

**Reconciliation to do:** Table 2 scope numbers (for example 450 voice switches, 1,581 radio sites) and the p. 30 remaining counts (398, 1,311) are different measures. Do not mix them in one chart without labeling.

---

## 2. Public project-level data inventory

| Source | Status | Notes |
|---|---|---|
| GAO-26-107992 | [V] | The only source with a documented cross-project facility conflict. Program-level counts and dates, no project-level schedule. |
| FAA Modern Skies, https://modernskies.faa.gov/ | [U] | The automated fetch returned only the page title. It is likely client-rendered. I could not confirm any dataset, API, or terms of use, and I could not read robots.txt. Check manually in a browser. Do not scrape. |
| FAA NASR, https://www.faa.gov/air_traffic/flight_info/aeronav/Aero_Data/NASR_Subscription/ | [U] | The FAA page returned HTTP 403 to the automated fetch. Check manually. It is expected to give airport and navaid identifiers useful for facility identity, but I did not verify the contents or license. It will not give telecom dependencies. |
| Other GAO, DOT OIG, and FAA reports | Not yet searched | Phase 1 follow-up. |

**Conclusion:** the "integrated project data" in this experiment will be about 95% synthetic. The blog must say so up front.

---

## 3. Neo4j Relate, what is documented

Primary sources:
- Repo: https://github.com/relatedb/relate
- Limitations doc: https://github.com/relatedb/relate/blob/main/docs/limitations.md
- Launch post: https://neo4j.com/blog/news/meet-relate-by-neo4j-an-embedded-database-for-ai-agents/
- Docs: relatedb.ai (named by the README; not fetched)

Caveat: the facts below come from page-summarization passes. The repo, limitations doc and launch post should be re-read in full before any claim is quoted in the blog. The README and the limitations doc also disagree in places on what is covered.

### 3.1 Capabilities [S]

| Item | Finding |
|---|---|
| Version and license | Latest release is **v1.0.1** (relatedb.ai/releases.json, published 2026-11-12). The README sample session and limitations doc say 1.0.2, so main may be ahead of the release. Apache-2.0. Rust. Accepts issue reports only, no pull requests. |
| Interfaces | CLI (macOS, Linux, Windows). Python (`pip install relate-db`). Node.js and browser WebAssembly. Rust crate. C ABI with Java, Go, Swift wrappers. Optional server over Bolt, HTTP, and MCP (`relate serve --mcp 7475`). |
| Storage | In-memory, directory (WAL plus Parquet shards, or JSON snapshot), or a single `.rl` file. Durability `full` by default. `everysecond` and `snapshot` modes accept data loss. |
| Cloning | `relate clone SOURCE DEST` copies a store and can convert between directory and `.rl` layouts. Whether it is cheap (copy-on-write) is **not documented**; measure it. |
| Agent features | `relate skill install` for Claude Code, Cursor and Codex. Automatic "agent mode" with compact TOON output and row caps. `relate agent-context` command reference. Documented exit codes (5 = write conflict or locked store). |
| Cypher | "One dialect: current Cypher." Quantified path patterns, path selectors, 80+ functions, schema DDL. |
| Vector | README documents `vector()` properties, `CREATE VECTOR INDEX`, `SEARCH` with pre-filtering, and hybrid with full text. The limitations doc is silent on vector. This is not needed for the MVP. |
| Neo4j interop | Drivers connect over Bolt or HTTP to the server. Subgraphs can move between Aura and Relate (launch post claim; the exact mechanism is [U]). |

### 3.2 Limits that matter for this experiment [S]

- **Single user or agent per process.** A directory-backed store must be used from one process. Overlapping writers get a write-write conflict with no silent retry.
- **One graph per store**, and no cross-graph queries. This actually helps agent isolation: one store per agent.
- **Whole graph in RAM**, no paging or spill. That is fine for 11,389 projects.
- **A concurrent workspace pool exists but is opt-in and off by default.** Its semantics are undocumented in what I read. Check before relying on it.
- **Single-level transactions only.** No nested transactions.
- **Variable-length path bounds above 500 hops are refused by default.** Not a problem for scheduling DAGs.
- **No RBAC or authentication. No clustering.** Not multi-tenant.
- **Conformance is shifting.** The limitations doc says the openCypher TCK pin "previously reported as 3892 of 3892 passing" was **retired as of 2026-11-05**. A CIP-derived suite is reporting-only at **4,942 passed, 924 failed, 51 skipped of 5,917** (about 83.5% passing). Do not repeat the launch post's "30k test scenarios" claim without checking what it counts.
- **Performance claims have no methodology.** The launch post claims "millisecond startup and submillisecond queries" and publishes no benchmark. We will measure instead.

---

## 4. Competing technologies

| Technology | Status | Notes |
|---|---|---|
| **LadybugDB** | [S] | MIT license. The README says it was formerly known as Kuzu. Bindings for Python, Node.js (`@ladybugdb/core`), Rust (`lbug`), Go, Swift, Java, C/C++, and WebAssembly. Cypher plus native full-text and vector indexes. About 6,961 commits and an active repo. **Conflicting version numbers** appeared in secondary sources (0.17.1, 0.19.0), so pin and record the version at install time. The "fork after Apple acquired Kuzu" story rests on maintainer and secondary posts, so **do not publish it** without a primary source. Whether it offers a pure in-memory mode was not confirmed. |
| **Standard Neo4j** | [U] | The control for "graph generally vs Relate specifically." Not yet researched here. Likely run via Docker or Neo4j Desktop. Docker was not found on this machine. The Neo4j CLI is installed (`neo4j-cli` on PATH). |
| **DuckDB or SQLite** | Known | The relational baseline. DuckDB recommended for recursive CTEs and analytics. Neither is installed here yet. |
| **Kuzu (original)** | [U] | Treat as historical context only until its maintenance status is verified from a primary source. |
| **OR-Tools CP-SAT** | Known | The shared deterministic validator and optimizer for every engine. |

---

## 5. What Relate uniquely provides vs. merely simplifies

This is the hypothesis section. Each row is a hypothesis to test, not a conclusion.

| Capability | Previously available? | Initial assessment |
|---|---|---|
| Embedded, in-process Cypher | Yes. LadybugDB and Kuzu are embedded Cypher engines. | Not new. |
| In-memory disposable graph | Probably yes for several engines. | Not new; measure the ergonomics. |
| Single-file portable store | Partly. SQLite and DuckDB do this relationally. | Possibly new for a Cypher engine. [U] |
| Cypher 25 features (quantified paths, path selectors) | Neo4j server. | New in an embedded engine, if LadybugDB lacks them. [U] |
| Agent mode: TOON output, row caps, skill install, exit codes | Not found elsewhere in this research. | **Most plausible real differentiator.** Testable by counting tool calls and tokens. |
| MCP server built in | Neo4j has a separate MCP server. | A packaging difference, to be checked against the other engines. |
| Neo4j wire-protocol compatibility | Neo4j only. | Interop convenience, not a capability gain. |

The most defensible hypothesis: **Relate reduces agent friction, not graph capability.**

---

## 6. Feasibility assessment

**Feasible:** a credible MVP for the St. Louis case plus a synthetic expansion, with all three engines and a shared optimizer.

**Hypothesis 1 (integration value):**
- Same-facility overlap detection is a single `GROUP BY facility` in SQL. Expect the relational baseline to find St. Louis-type overlaps as easily as a graph does.
- A graph should earn its keep on multi-hop questions: dependency chains across programs, delay-propagation reach, and critical-path exposure.
- Detection accuracy against planted synthetic ground truth is partly circular. Report it as a mechanism check, not as evidence about FAA.
- **No real savings can be measured.** Only hypothetical savings under labeled assumptions.

**Hypothesis 2 (Relate value):**
- 11,389 nodes is trivially small. Load and query times will all be milliseconds. Differences are likely to be noise.
- Meaningful metrics: setup steps, integration lines of code, agent tool calls per task, tokens per task, failure and retry rate, isolation and teardown behavior, and the cost of cloning a scenario workspace.

**Risks**
1. The model-driven agent results will vary between runs. Use multiple seeds and report medians and spread.
2. The relational baseline can be made to look worse than it is. A reviewer should audit the SQL.
3. The synthetic dataset can encode the answer. Publish the generator and the seeds.
4. Relate is days-to-weeks old in its 1.0 form. Version-pin and expect behavior to shift.
5. Reading too much into outages. The brief rightly forbids it.

---

## 7. Predefined success criteria (draft, to freeze before any benchmark runs)

- **H1 supported** if the integrated approaches detect at least one cross-program conflict class the independent baseline cannot, **and** the optimizer validates an alternative that reduces facility visits without violating modeled constraints. **H1 not supported** if Baseline B (relational) matches the graph on all planted conflict classes. That outcome is still a valid finding.
- **H2 supported** if Relate beats LadybugDB on at least one pre-registered ergonomics metric (tool calls, tokens, integration LOC, setup steps) by a margin larger than run-to-run variance, with no worse task completion.
- **Reporting rules:** median plus spread over at least 5 runs, same model, prompts, data, hardware and optimizer across engines, failures and false positives included.

---

## 8. Recommended smallest experiment

1. **Case A (documented):** the St. Louis pair as a two-project, one-facility graph. Provenance to GAO-26-107992 p. 30. Conditional scenarios: merge the two site-prep visits, with assumptions explicitly labeled. No FAA savings claimed.
2. **Case B (synthetic):** a seeded 1,000-project dataset built from the 13 programs in Table 2, with planted ground truth: duplicate visits, a hidden resource conflict, a cross-program dependency, a decoy where coordination makes things worse, and a no-opportunity control. Scale later to 5,000 and 11,389.
3. **Engines:** Relate and SQLite, plus the flat-file agent. Add the Neo4j server only if a graph-database control is needed.
4. **Shared:** one OR-Tools CP-SAT validator, one agent harness, one prompt set, one model.
5. **Output:** a comparison table plus an honest list of what could not be measured.

### Proposed repository structure

```
project-11389/
  docs/            # this report, source log, experiment pre-registration
  data/
    sources/       # GAO extracts with page refs and retrieval dates
    synthetic/     # generator, seeds, ground-truth manifests
  schema/          # graph model, provenance model (DOCUMENTED / INFERRED / SIMULATED)
  engines/         # one adapter per engine: relate, ladybug, duckdb
  optimizer/       # shared CP-SAT validator
  agents/          # harness and tool definitions
  bench/           # runner, metrics, result files
  app/             # web UI (later phase)
  tests/
```

### First milestone
Load the St. Louis pair and the 13 Table 2 programs into all three engines with full provenance. Run the same three queries on each (projects at a facility, programs sharing a facility, delay reach). Record setup effort and timing. No agents yet.

---

## 9. Blog guardrails

**Safe to say**
- GAO reported 11,389 non-integrated project schedules and quoted FAA officials as saying integration in their scheduling tool "would not be useful or helpful."
- GAO gave a specific St. Louis example of two site-prep visits about 8 months apart.
- FAA and its integrator say an AI tool to find conflicts is in development.

**Do not say**
- That GAO or this project proves FAA is wrong. DOT disputes GAO's characterization and GAO disputes DOT's.
- That any outage was caused by scheduling.
- That the 11,389-project dataset reflects FAA's real portfolio.
- That Relate is faster, until measured.
- Anything about LadybugDB's origin that rests only on secondary sources.

---

## 10. Open items before Phase 2

1. Open Modern Skies in a browser. Check for data, API, terms of use, and robots.txt.
2. Open the NASR page in a browser. Check contents, cost, format and license.
3. Read relatedb.ai docs and the full Relate README and limitations doc directly. Confirm vector status, workspace pool, and clone behavior.
4. Verify LadybugDB's current release, in-memory mode, and Cypher feature coverage from its docs.
5. Research standard Neo4j setup on this machine. Docker was not found.
6. Search for other GAO, DOT OIG and FAA reports with schedule or facility data.
7. Identify the scheduling tool GAO observed.
8. Decide the pre-registration location (this repo, committed before any benchmark run).

---

## 11. Full-report check: does GAO quantify the scheduling problem?

I read the text of GAO-26-107992 end to end (pp. 1–43 and 47). Appendix III, DOT's own letter (pp. 44–46), is a scanned image with no extractable text, so DOT's position is known **only through GAO's summary** of it (pp. 32–34). Read those three pages in the PDF before quoting DOT directly.

**Result: GAO does not quantify the cross-project scheduling problem anywhere.**
- There is exactly one concrete conflict, St. Louis (p. 30), with two dates and no facility name.
- Everything else is qualitative: "countless possible overlaps" (p. 30), followed by the remaining installation counts (2,610 fiber, 435 displays, 72 TFDM, 398 voice switches, 1,311 radio sites, 166 SAI). Those are scope counts, not conflict counts.
- No conflict count, no site-visit count, no cost, delay, or controller-disruption measurement appears for scheduling. The only dollar figures are cost-estimate and appropriation figures.
- GAO's conclusion is framed as risk: FAA "risks having an inefficient schedule" (pp. 31–32). It is a finding against GAO's Schedule Assessment Guide (GAO-16-89G), a best-practice standard, not a measured loss.

**Other points that affect how much weight the claim can bear**
1. **Limited visibility.** GAO says it "could not ascertain the complete reliability" of FAA's status dashboard data because of "lack of visibility into the systems that feed into the dashboard" (p. 3, p. 36). It judged the data acceptable for describing program status. Footnote 9 (p. 4) also cites "significant delays in FAA providing documentation."
2. **How 11,389 was derived is not stated.** The body reports it as fact. The only stated basis is that GAO reviewed schedule documentation and "observed a live demonstration of FAA's use of its scheduling tool" (p. 4). The report elsewhere says "over 11,000 individual project schedules" (p. 26). DOT's comments say "over 11,000 unique project tasks, averaging 30 activities." These may describe the same population in different words. That is my inference, not something the report says.
3. **The speed trade-off is explicit.** GAO acknowledges the Administrator waived most Acquisition Management System requirements to accelerate delivery (pp. 22, 28) and says FAA is "buying delivery speed at the risk of cost uncertainty and potential disruptions" (p. 32). GAO also notes FAA has made real progress, such as replacing 50 percent of copper wires (p. 31).
4. **Existing coordination role.** Peraton is "responsible for overseeing the integration and coordination among the 13 systems modernization programs" and has authority to manage program contractors on FAA's behalf (p. 23). The cross-program coordination function exists on paper. GAO's complaint is that the schedules do not show it.
5. **Not tied to outages.** The 2025 incidents (Newark, Dallas, and others, pp. 1–2, 8) are attributed to aging infrastructure and a facility relocation. GAO does not link them to scheduling.

**What the public record supports**
- Supported: GAO found that, as of May 2026, project schedules were not integrated across programs, and that this contradicts GAO's scheduling best practice.
- Supported: one documented example of two site-prep visits about 8 months apart at the same St. Louis site.
- **Not supported:** any claim about how much inefficiency exists, what it costs, or how much integration would save.

This strengthens the case for the experiment's design. The project cannot measure real savings, so it should test whether the detection mechanism works and what assumptions a real answer would need.

---

## Source list

- GAO-26-107992 landing page: https://www.gao.gov/products/gao-26-107992
- GAO-26-107992 PDF: https://www.gao.gov/assets/gao-26-107992.pdf
- Relate repo: https://github.com/relatedb/relate
- Relate limitations: https://github.com/relatedb/relate/blob/main/docs/limitations.md
- Relate launch post: https://neo4j.com/blog/news/meet-relate-by-neo4j-an-embedded-database-for-ai-agents/
- Relate search results (hackathon, GraphAcademy, Collabnix): https://graphacademy.neo4j.com/blog/three-ways-to-run-relate
- LadybugDB repo: https://github.com/LadybugDB/ladybug
- LadybugDB secondary: https://dbdb.io/db/ladybugdb
