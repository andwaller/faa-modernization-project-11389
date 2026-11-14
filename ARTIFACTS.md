# Artifacts to keep in view

Work comes first. This list only tracks what will be needed. Nothing here is started unless marked.

## Hackathon submission (deadline Dec 11, 2026, 6:00 PM PST; rules: relate.devpost.com/rules)
| Artifact | Needed | Status |
|---|---|---|
| Public GitHub repo, topic `relate`, kept public through Dec 17 | Yes | Created and public; `relate` topic is set |
| Open-source license (MIT or Apache-2.0 recommended) | Recommended | Not chosen |
| README: setup, how a judge runs it, "how are you using Relate, and why?", storage mode | Yes | Drafted (setup, how to run, Relate usage, storage mode all present) |
| Persistent Relate store (directory or `.rl` file) in the repo | Yes | Created (`store/portfolio_n1000_seed1.rl`) |
| Demo video, up to 2 minutes, viewable without login | Yes | Not started |
| Project description: use case and what connects to what | Yes | Not started |
| Statement of Relate capabilities, third-party tools, and AI tools used (AI disclosure) | Yes | In the README Disclosures section |
| Reused code disclosure | If any | None so far |

## Project working files
| Artifact | Status |
|---|---|
| Graph schema (`schema/schema.cypher`) | Drafted, being tested in Relate |
| Synthetic data generator and checker (`generator/`) | Built, verified on dev seed 1 |
| Loader into Relate (`loader/load_portfolio.py`) | Built; verified at 1,000 and 11,389 projects |
| Persistent Relate store (`store/portfolio_n1000_seed1.rl`, 0.8 MB) | Created in the project folder; reopens with 14 constraints |
| Thesis question queries (`queries/thesis_questions.py`) | Built; run at 1,000 and 11,389 projects |
| Agent that answers questions through Relate | Not started |
| Incident-scenario network model (all hypothetical) | Not started |
| Research report and pre-registration (`PHASE1-REPORT.md`, `PREREGISTRATION.md`) | Drafted; heavier than the lean demo needs |

## Blog
Not started. Write alongside the build. Keep claims at the level of the evidence; disclose the Neo4j affiliation; no claim about the cause of the 2026-11-13 ground stop.
