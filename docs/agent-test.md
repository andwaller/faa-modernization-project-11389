# Agent test: Relate's own CLI and MCP (2026-11-14)

This is a demonstration, not the pre-registered benchmark. One run per path, on one simple question.

## What was tested

Two fresh Claude Code sessions (model `claude-sonnet-5-5`, started in headless mode with `claude -p`) each answered the same question over a scratch copy of the 1,000-project store (`store/portfolio_n1000_seed1.rl`, copied with `relate clone`).

> Find pairs of projects at the same facility that are in different programs, start within 365 days of each other, and have no dependency between them. Tell me how many pairs there are and how many are at facilities that have a restriction. Show me the Cypher you ran.

The planted answer for this store is **20 pairs, 10 of them at restricted facilities** (see `generator/` and the ground truth).

| | Path 1: Relate skill and CLI | Path 2: Relate MCP server |
|---|---|---|
| What the session could use | `relate` shell commands only | `get_schema` and `read_cypher` only |
| How it was prompted | "Use the relate skill. Open the store read-only with the Relate CLI..." | "Use the Relate MCP server tools..." |
| Answer | 20 pairs, 10 restricted | 20 pairs, 10 restricted |
| Correct? | Yes | Yes |
| Turns | 10 | 5 |
| Tool calls | 7 (2 blocked by my permission rules) | 4 |
| Wall time | about 22 s of agent time | about 13 s |
| Cost reported by the CLI | about $0.21 | about $0.10 |

## What the agents did

- **CLI path:** loaded the Relate skill, checked the version, read `relate query --help`, looked up the schema with `CALL db.schema.visualization()` and `CALL db.schema.nodeTypeProperties()`, then ran one counting query with `--read-only`. It also ran a variant to check for blank restriction values (none).
- **MCP path:** looked up the two tools, called `get_schema`, ran a small query to see which restriction values exist, then ran the counting query.
- **Both** opened the data read-only, wrote their own Cypher, and stated their assumptions: a dependency is only checked as a direct link, not a chain, and a "restricted" facility is one whose `restriction` is not null.

## Observations

1. Relate's interfaces were enough for an agent to find the right answer on the first full query, with no help beyond the question.
2. The MCP path took fewer steps and cost about half as much here. With one run each that is a hint, not a finding. One likely reason: MCP gave it the schema in one call, while the CLI session explored `--help` and schema procedures, and two of its calls were blocked by my allowlist (a command with two parts joined by a semicolon, and a file read outside the allowed tools).
3. MCP results carry the query plan and timings, about 1,000 to 1,400 characters for a one-row answer. That adds tokens an agent has to read.
4. Neither session used `relate clone`, `relate agent-context`, or agent-mode flags by name. The CLI session received compact output on its own for one query and asked for JSON on another.

## Limits

- One run per path. No repeats, so no variance and no claim that either path is cheaper or better.
- A simple question with a known answer, on simulated data.
- The prompts named the skill and the MCP server, which helps the agent.
- Costs are the Claude Code CLI's own estimates for these runs.
- The sessions ran on the author's account, with an allowlist restricting them to Relate tools.

## To repeat it

```powershell
# a scratch copy, so the repo's store file is never opened
relate clone store\portfolio_n1000_seed1.rl scratch\agent-test.rl

# Path 1: skill and CLI (relate must be on PATH)
claude -p "Use the relate skill. Open the Relate store at scratch\agent-test.rl read-only ... (the question above)" --allowedTools "Bash(relate:*)"

# Path 2: MCP (a read-only server on your own machine, then a config file pointing at it)
relate serve -d scratch\agent-test.rl --read-only --mcp 7476 --auth none
# mcp.json: {"mcpServers":{"relate":{"type":"http","url":"http://127.0.0.1:7476/mcp"}}}
claude -p "Use the Relate MCP server tools to answer this. ... (the question above)" --mcp-config mcp.json --strict-mcp-config --allowedTools "mcp__relate__get_schema" "mcp__relate__read_cypher"
```

`--auth none` is only allowed on your own machine. Stop the server when you are done.
