// Same Site, Different Schedules: Relate by Neo4j running entirely in the browser.
// The generated portfolio is SIMULATED except documented program summaries from GAO.
// A dated FAA Modern Skies snapshot supplies the progress counts; the separate public schedule page
// loads a small FAA Delay Reduction Plan activity sample. The sources are kept distinct.
import init, { RelateDb } from "./vendor/relate-wasm/relate.js";

const EPOCH = Date.UTC(2026, 0, 1);
const dayToDate = (d) => new Date(EPOCH + d * 86400000).toISOString().slice(0, 10);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Number(n).toLocaleString("en-US");

const GLOSSARY = {
  project: "One scheduled piece of work, for example installing new radios at one site. Here a project has a start day, an end day, a site, a program and a crew.",
  program: "A large modernization effort made of many projects, such as voice switches or radios. The program names, scope and dates come from the GAO report.",
  site: "A facility where work happens, such as an airport tower. The sites on this page are simulated.",
  crew: "The team that does a project on site. A crew can only be in one place at a time.",
  dependency: "A rule that one project cannot start until another has finished.",
  conflict: "Two pieces of work that cannot both happen as scheduled, such as one crew booked in two places at once.",
  merge: "Doing two separate visits to the same site as one visit.",
  graph: "A way of storing data as things (projects, sites, crews) and the connections between them, so questions about connections are easy to ask.",
  cypher: "The query language used to ask a graph database questions. You can see the Cypher behind every answer.",
  simulated: "Made up by a program with a fixed random seed, not real FAA data. It lets us know the right answers in advance.",
  provenance: "A label on each result saying where it came from: documented, inferred, simulated, or hypothesis.",
  agent: "An AI that decides which queries to run, runs them, and writes the answer. Here it only runs if you connect your own Claude API key, and every query it ran is shown."
};
const TAGHELP = {
  SIMULATED: "Generated data with known answers. Not real FAA data.",
  HYPOTHESIS: "A what-if: it assumes something we have not verified, such as two visits being possible at once.",
  DOCUMENTED: "Taken from a public source (GAO report, FAA Modern Skies, or FAA planning report). FAA progress figures are self-reported.",
  INFERRED: "Simple arithmetic done on documented figures. Not a forecast.",
  AGENT: "Written by an AI agent from the queries shown. Check the Cypher before relying on a number."
};
const term = (k, label) => `<abbr class="term" tabindex="0" title="${esc(GLOSSARY[k])}">${esc(label ?? k)}</abbr>`;

// ---------- data and database ----------
async function fetchText(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Could not load ${u} (HTTP ${r.status})`);
  return r.text();
}
function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const toInts = (r, ...k) => ({ ...r, ...Object.fromEntries(k.map((x) => [x, parseInt(r[x], 10)])) });

function run(d, cypher, params) {
  const env = JSON.parse(d.execute(cypher, params ? JSON.stringify(params) : null));
  if (env.error) throw new Error(env.error);
  return env;
}

let DATA = null;
let truth = null;
let db = null;
let SIZE = 11389;

async function loadFiles(size) {
  const names = ["programs", "facilities", "projects", "dependencies", "maintenance_windows"];
  const [schema, truthText, progressText, ...csvs] = await Promise.all([
    fetchText("data/schema.cypher"),
    fetchText(`data/n${size}/ground_truth.json`),
    fetchText("data/faa_public_snapshot_2026-11-16.json"),
    ...names.map((n) => fetchText(`data/n${size}/${n}.csv`)),
  ]);
  truth = JSON.parse(truthText).classes;
  const publicSnapshot = JSON.parse(progressText);
  PACE_ROWS = publicSnapshot.program_progress.filter((r) => r.pace_comparable).map((r) => ({
    n: r.program === "New Radar Systems" ? "Radars" : r.program,
    d: r.reported_count,
    m: r.september_2026_completed,
  }));
  renderPublicProgress(publicSnapshot);
  const t = Object.fromEntries(names.map((n, i) => [n, parseCsv(csvs[i])]));
  DATA = {
    schema: schema.split("\n").map((s) => s.trim()).filter((s) => s.startsWith("CREATE ")).map((s) => s.replace(/;$/, "")),
    programs: t.programs.map((r) => toInts(r, "planned_scope", "completion_day")),
    facilities: t.facilities,
    projects: t.projects.map((r) => toInts(r, "start_day", "end_day", "deadline_day")),
    deps: t.dependencies,
    mws: t.maintenance_windows.map((r) => toInts(r, "start_day", "end_day")),
  };
}

function renderPublicProgress(snapshot) {
  const rows = snapshot.program_progress.map((r) => `<tr>
    <td>${esc(r.program)}</td>
    <td class="num">${fmt(r.reported_count)} of ${fmt(r.total)}</td>
    <td>${esc(r.measure)}</td>
    <td class="num">${r.reported_percent}%</td>
  </tr>`).join("");
  const target = $("#progress-snapshot");
  if (target) target.innerHTML = `<div class="tablewrap" tabindex="0"><table>
    <caption>FAA Modern Skies snapshot — ${esc(snapshot.snapshot_date)}</caption>
    <thead><tr><th>Program</th><th>Reported count</th><th>Measure</th><th>Progress</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="hint">FAA-reported public figures. “Planned” is preserved as published and is not treated as completed work.</p>`;
}

// Builds a fresh in-memory Relate database with the schema and data loaded.
function buildDb() {
  const d = new RelateDb();
  DATA.schema.forEach((s) => run(d, s));
  const crews = [...new Set(DATA.projects.map((p) => p.crew_id))].map((crewId) => ({ crewId }));
  run(d, "CREATE (:Source {sourceId:'GAO-26-107992', provenance:'DOCUMENTED'})");
  run(d, `UNWIND $rows AS r MATCH (s:Source {sourceId:'GAO-26-107992'})
    CREATE (p:Program {programId:r.program_id, name:r.name, domain:r.domain, plannedScope:r.planned_scope,
      completionDay:r.completion_day, completionDate:r.completion_date, provenance:r.provenance})
    CREATE (p)-[:DOCUMENTED_IN {table:'Table 2', page:17}]->(s)`, { rows: DATA.programs });
  run(d, `UNWIND $rows AS r CREATE (:Facility {facilityId:r.facility_id, name:r.name, type:r.type,
    restriction:CASE WHEN r.restriction = '' THEN null ELSE r.restriction END, provenance:r.provenance})`, { rows: DATA.facilities });
  run(d, "UNWIND $rows AS r CREATE (:Crew {crewId:r.crewId, provenance:'SIMULATED'})", { rows: crews });
  run(d, `UNWIND $rows AS r
    MATCH (pg:Program {programId:r.program_id}), (f:Facility {facilityId:r.facility_id}), (c:Crew {crewId:r.crew_id})
    CREATE (p:Project {projectId:r.project_id, startDay:r.start_day, endDay:r.end_day, deadlineDay:r.deadline_day, provenance:r.provenance})
    CREATE (p)-[:IN_PROGRAM]->(pg) CREATE (p)-[:SCHEDULED_AT]->(f) CREATE (p)-[:ASSIGNED_TO]->(c)`, { rows: DATA.projects });
  run(d, `UNWIND $rows AS r MATCH (pre:Project {projectId:r.pre_project_id}), (post:Project {projectId:r.post_project_id})
    CREATE (post)-[:DEPENDS_ON]->(pre)`, { rows: DATA.deps });
  run(d, `UNWIND $rows AS r MATCH (f:Facility {facilityId:r.facility_id})
    CREATE (f)-[:HAS_MAINTENANCE]->(:MaintenanceWindow {startDay:r.start_day, endDay:r.end_day, provenance:r.provenance})`, { rows: DATA.mws });
  return d;
}

// ---------- queries ----------
const PAIRS = `MATCH (a:Project)-[:SCHEDULED_AT]->(f:Facility)<-[:SCHEDULED_AT]-(b:Project)
WHERE a.projectId < b.projectId AND abs(a.startDay - b.startDay) <= 365
  AND NOT EXISTS { (a)-[:IN_PROGRAM]->(:Program)<-[:IN_PROGRAM]-(b) }
  AND NOT EXISTS { (a)-[:DEPENDS_ON]-(b) }`;

const Q = {
  siteList: `MATCH (f:Facility)<-[:SCHEDULED_AT]-(p:Project)-[:IN_PROGRAM]->(g:Program)
WITH f, count(DISTINCT g) AS n WHERE n >= 2 RETURN f.facilityId AS id, n ORDER BY n DESC, id LIMIT 300`,
  site: `MATCH (f:Facility {facilityId: $id})<-[:SCHEDULED_AT]-(p:Project)-[:IN_PROGRAM]->(g:Program)
RETURN p.projectId AS project, g.name AS program, p.startDay AS startDay, p.endDay AS endDay, f.restriction AS restriction
ORDER BY p.startDay`,
  crowded: `MATCH (f:Facility)<-[:SCHEDULED_AT]-(p:Project)-[:IN_PROGRAM]->(g:Program)
WITH f, count(DISTINCT g) AS programs, count(p) AS projects
RETURN programs, count(f) AS sites, sum(projects) AS projects ORDER BY programs`,
  pairs: PAIRS + `
MATCH (a)-[:IN_PROGRAM]->(ga:Program), (b)-[:IN_PROGRAM]->(gb:Program)
RETURN f.facilityId AS site, f.restriction AS restriction, a.projectId AS a, ga.name AS programA, a.startDay AS aStart,
       b.projectId AS b, gb.name AS programB, b.startDay AS bStart, abs(a.startDay - b.startDay) AS gap
ORDER BY gap, site`,
  savings: PAIRS + `
  AND f.restriction IS NULL
WITH a.endDay - a.startDay AS da, b.endDay - b.startDay AS db, abs(a.startDay - b.startDay) AS gap
RETURN count(*) AS pairs, round(avg(gap)) AS avgGapDays, sum(da + db) AS separateSiteDays,
       sum(CASE WHEN da > db THEN da ELSE db END) AS concurrentSiteDays`,
  crossDeps: `MATCH (d:Project)-[:DEPENDS_ON]->(p:Project)
MATCH (d)-[:IN_PROGRAM]->(gd:Program), (p)-[:IN_PROGRAM]->(gp:Program)
RETURN gd <> gp AS crossProgram, count(*) AS dependencies`,
  slip: `MATCH (h:Project)
WHERE EXISTS { (:Project)-[:DEPENDS_ON]->(h) } AND NOT EXISTS { (h)-[:DEPENDS_ON]->() }
MATCH path = (h)<-[:DEPENDS_ON*1..]-(d:Project)
WITH d, nodes(path) AS ns
WITH d, reduce(s = $delay, i IN range(1, size(ns) - 1) |
       CASE WHEN s <= 0 THEN 0
            WHEN ns[i-1].endDay + s - ns[i].startDay > 0 THEN ns[i-1].endDay + s - ns[i].startDay
            ELSE 0 END) AS shift
WHERE shift > 0
RETURN count(*) AS projectsPushed, sum(shift) AS totalSlipDays,
       sum(CASE WHEN d.endDay + shift > d.deadlineDay THEN 1 ELSE 0 END) AS pushedPastDeadline`,
  crew: `MATCH (a:Project)-[:ASSIGNED_TO]->(:Crew)<-[:ASSIGNED_TO]-(b:Project)
WHERE a.projectId < b.projectId AND a.startDay < b.endDay AND b.startDay < a.endDay
  AND NOT EXISTS { (a)-[:SCHEDULED_AT]->(:Facility)<-[:SCHEDULED_AT]-(b) }
RETURN count(*) AS crewConflicts`,
  merge: PAIRS + `
  AND f.restriction IS NULL
WITH CASE WHEN a.startDay < b.startDay THEN a ELSE b END AS early,
     CASE WHEN a.startDay < b.startDay THEN b ELSE a END AS late
WITH early, late, late.startDay - early.startDay AS shift
SET late.endDay = late.endDay - shift, late.startDay = early.startDay,
    late.provenance = 'HYPOTHESIS', late.mergedWith = early.projectId
RETURN count(*) AS visitsMerged`,
  pace: `UNWIND $rows AS r MATCH (g:Program {name: r.n})
RETURN g.name AS program, g.plannedScope AS scope, r.d AS done, g.completionDate AS due, r.m AS recent,
       round(10.0 * (g.plannedScope - r.d) / ((g.completionDay - 287) / 30.44)) / 10 AS neededPerMonth
ORDER BY neededPerMonth DESC`,
};

// FAA Modern Skies figures are loaded from a dated, source-linked public snapshot.
let PACE_ROWS = [];

// ---------- rendering helpers ----------
function table(caption, cols, rows) {
  const head = cols.map((c) => `<th scope="col"${c.num ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("");
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td${c.num ? ' class="num"' : ""}>${esc(c.fmt ? c.fmt(r[c.key], r) : r[c.key])}</td>`).join("")}</tr>`).join("");
  return `<div class="tablewrap" tabindex="0"><table><caption>${esc(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
const pairKey = (a, b) => [a, b].sort().join("|");
function checkSets(found, planted, what) {
  const missing = [...planted].filter((x) => !found.has(x)).length;
  const extra = [...found].filter((x) => !planted.has(x)).length;
  const ok = !missing && !extra;
  return { ok, text: ok
    ? `<strong>Checked against the answers planted in the data:</strong> all ${planted.size} ${esc(what)} found, none missing, none extra.`
    : `<strong>Check failed:</strong> ${missing} missing and ${extra} extra compared with the planted ${esc(what)}.` };
}

// ---------- the questions ----------
const state = { site: null, delay: 60 };

const QUESTIONS = [
  {
    id: "site", title: "What is at one site?", sub: "Start here: look at a single site",
    why: `Pick a ${term("site")} and see every ${term("project")} scheduled there, from every ${term("program")}. This is the connected view that a single schedule cannot give you.`,
    run() {
      const sites = run(db, Q.siteList).rows;
      const known = state.site && (sites.some((s) => s.id === state.site) || DATA.facilities.some((f) => f.facility_id === state.site));
      if (!known) state.site = sites[0].id;
      const rows = run(db, Q.site, { id: state.site }).rows;
      const gaps = []; for (let i = 1; i < rows.length; i++) gaps.push(rows[i].startDay - rows[i - 1].startDay);
      const closest = gaps.length ? Math.min(...gaps) : null;
      const programs = new Set(rows.map((r) => r.program)).size;
      const shown = sites.some((s) => s.id === state.site) ? sites : [{ id: state.site, n: programs }, ...sites];
      const opts = shown.map((s) => `<option value="${esc(s.id)}"${s.id === state.site ? " selected" : ""}>${esc(s.id)} (${s.n} programs)</option>`).join("");
      return {
        tags: ["SIMULATED"],
        controls: `<div class="controls"><label for="site-pick">Site</label><select id="site-pick">${opts}</select></div>`,
        wire(el) { el.querySelector("#site-pick").addEventListener("change", (e) => { state.site = e.target.value; showQuestion(this_q("site")); }); },
        summary: `${esc(state.site)} has ${rows.length} projects from ${programs} program${programs === 1 ? "" : "s"}${closest !== null ? `. The two closest start ${closest} days apart.` : "."}`,
        body: table(`Projects at ${state.site}`, [
          { key: "project", label: "Project" }, { key: "program", label: "Program" },
          { key: "startDay", label: "Starts", fmt: dayToDate }, { key: "endDay", label: "Ends", fmt: dayToDate },
          { key: "restriction", label: "Site restriction", fmt: (v) => v ?? "none" },
        ], rows),
        meaning: `<p>Each row is a ${term("project")} at this ${term("site")}. If two programs show up months apart, the site may be visited twice for work that could have been planned together. A restriction means visits at that site cannot be combined.</p>`,
        cypher: Q.site,
      };
    },
  },
  {
    id: "crowded", title: "Which sites are crowded?", sub: "How many programs share a site",
    why: `Counts how many different ${term("program", "programs")} schedule work at each ${term("site")}.`,
    run() {
      const rows = run(db, Q.crowded).rows;
      const total = rows.reduce((s, r) => s + r.sites, 0), multi = rows.filter((r) => r.programs >= 2).reduce((s, r) => s + r.sites, 0);
      return {
        tags: ["SIMULATED"],
        summary: `${fmt(multi)} of ${fmt(total)} sites have work from more than one program.`,
        body: table("Sites by number of programs", [
          { key: "programs", label: "Programs at the site", num: true }, { key: "sites", label: "Sites", num: true }, { key: "projects", label: "Projects", num: true },
        ], rows),
        meaning: `<p>Sites with two or more programs are where overlap can happen. In real life the number of programs per site is unknown from public data: the FAA's own lookup lists seven programs for St. Louis Lambert, for example, but this page only uses simulated sites.</p>`,
        cypher: Q.crowded,
      };
    },
  },
  {
    id: "dupes", title: "Which visits could be combined?", sub: "Duplicate visits within 12 months",
    why: `Finds pairs of ${term("project", "projects")} from different ${term("program", "programs")} at the same ${term("site")}, starting within a year of each other, with no ${term("dependency")} between them.`,
    run() {
      const rows = run(db, Q.pairs).rows;
      const ok = rows.filter((r) => r.restriction === null), no = rows.filter((r) => r.restriction !== null);
      const c1 = checkSets(new Set(ok.map((r) => pairKey(r.a, r.b))), new Set(truth.C1.map((x) => pairKey(...x.projects))), "combinable pairs");
      const c5 = checkSets(new Set(no.map((r) => pairKey(r.a, r.b))), new Set(truth.C5.map((x) => pairKey(...x.projects))), "restricted pairs");
      const cols = [
        { key: "site", label: "Site" }, { key: "programA", label: "First program" }, { key: "aStart", label: "Starts", fmt: dayToDate },
        { key: "programB", label: "Second program" }, { key: "bStart", label: "Starts", fmt: dayToDate },
        { key: "gap", label: "Days apart", num: true },
      ];
      const withGap = (r) => ({ ...r, gap: Math.abs(r.aStart - r.bStart) });
      return {
        tags: ["SIMULATED"],
        summary: `${rows.length} pairs of visits are close together. ${ok.length} could be combined, and ${no.length} are at sites with a restriction that prevents it.`,
        body: table(`Combinable pairs (closest first, showing ${Math.min(20, ok.length)} of ${ok.length})`, cols, ok.slice(0, 20).map(withGap))
          + `<details><summary>Show the ${no.length} pairs that cannot be combined</summary>${table("Pairs at restricted sites", cols, no.slice(0, 20).map(withGap))}</details>`,
        check: { ok: c1.ok && c5.ok, text: c1.text + "<br>" + c5.text },
        meaning: `<p>Flagging every close pair would raise ${no.length} false alarms, because those sites do not allow combined visits. Reading the site restriction from the connected data is what separates a real opportunity from a false one. This is a screening result: it says where to look, not what to do.</p>`,
        cypher: Q.pairs,
      };
    },
  },
  {
    id: "savings", title: "How much site time would combining save?", sub: "A what-if, labeled as a hypothesis",
    why: `For the combinable pairs, compares doing the two visits separately with doing them as one ${term("merge", "combined visit")}.`,
    run() {
      const r = run(db, Q.savings).rows[0];
      const pct = Math.round(100 * (1 - r.concurrentSiteDays / r.separateSiteDays));
      return {
        tags: ["SIMULATED", "HYPOTHESIS"],
        summary: `Combining the ${r.pairs} pairs would use ${fmt(r.concurrentSiteDays)} site-days instead of ${fmt(r.separateSiteDays)}, about ${pct}% fewer.`,
        body: `<div class="compare"><div class="stat"><div class="big">${fmt(r.separateSiteDays)}</div><div class="lbl">site-days as separate visits</div></div><div class="stat"><div class="big">${fmt(r.concurrentSiteDays)}</div><div class="lbl">site-days if combined</div></div></div>`,
        meaning: `<p>This assumes two visits can be done at once and ignores whether a ${term("crew")} is free. The next question shows why that assumption matters. These are simulated numbers and say nothing about real FAA savings.</p>`,
        cypher: Q.savings,
      };
    },
  },
  {
    id: "fix", title: "Try a fix: combine the visits", sub: "Test it on a copy, then see what breaks",
    why: `Combines every combinable pair on a <em>copy</em> of the data, then checks whether any ${term("crew")} is now booked in two places at once. The original is not touched.`,
    run() {
      const before = run(db, Q.crew).rows[0].crewConflicts;
      const copy = buildDb();
      const merged = run(copy, Q.merge).rows[0].visitsMerged;
      const after = run(copy, Q.crew).rows[0].crewConflicts;
      const original = run(db, Q.crew).rows[0].crewConflicts;
      return {
        tags: ["SIMULATED", "HYPOTHESIS"],
        summary: `Combining ${merged} visits raised crew ${term("conflict", "conflicts")} from ${before} to ${after}.`,
        body: `<div class="compare"><div class="stat"><div class="big">${before}</div><div class="lbl">crew conflicts before</div></div><div class="stat after"><div class="big">${after}</div><div class="lbl">crew conflicts after combining</div></div></div>
               <p>The original data still shows <strong>${original}</strong> crew conflicts, so the test changed nothing real.</p>`,
        meaning: `<p>Fixing one schedule can break another. Each combined visit moved work onto a ${term("crew")} that was already busy elsewhere. Seeing this needs the connections between projects, sites and crews in one place. Relate here runs in your browser's memory, so the copy is made by loading the data a second time; the desktop version can use <code>relate clone</code> instead.</p>`,
        cypher: Q.merge + "\n\n// then, to count crew conflicts:\n" + Q.crew,
      };
    },
  },
  {
    id: "slip", title: "What slips if something slips?", sub: "Follow dependencies through the plan",
    why: `If the first project in each chain of ${term("dependency", "dependencies")} starts late, which later projects get pushed, using each project's spare time first?`,
    run() {
      const r = run(db, Q.slip, { delay: state.delay }).rows[0] ?? { projectsPushed: 0, totalSlipDays: 0, pushedPastDeadline: 0 };
      const opts = [30, 60, 180].map((d) => `<option value="${d}"${d === state.delay ? " selected" : ""}>${d} days</option>`).join("");
      return {
        tags: ["SIMULATED", "HYPOTHESIS"],
        controls: `<div class="controls"><label for="delay-pick">If the first project in each chain slips by</label><select id="delay-pick">${opts}</select></div>`,
        wire(el) { el.querySelector("#delay-pick").addEventListener("change", (e) => { state.delay = parseInt(e.target.value, 10); showQuestion(this_q("slip")); }); },
        summary: `A ${state.delay}-day slip pushes ${r.projectsPushed} projects, adds up to ${fmt(r.totalSlipDays)} days of slip, and leaves ${r.pushedPastDeadline} projects ending past their deadline.`,
        meaning: `<p>This follows chains of ${term("dependency", "dependencies")} several steps deep. A schedule that only sees its own projects cannot see how a delay elsewhere reaches it. Spare time between projects absorbs some of the slip, which is why the numbers do not grow in a straight line.</p>`,
        cypher: Q.slip,
      };
    },
  },
  {
    id: "cross", title: "Do dependencies cross programs?", sub: "Links a single program cannot see",
    why: `Counts ${term("dependency", "dependencies")} between projects in different ${term("program", "programs")} versus the same program.`,
    run() {
      const rows = run(db, Q.crossDeps).rows;
      const cross = rows.find((r) => r.crossProgram === true)?.dependencies ?? 0, same = rows.find((r) => r.crossProgram === false)?.dependencies ?? 0;
      return {
        tags: ["SIMULATED"],
        summary: `${cross} of ${cross + same} dependencies connect projects in different programs.`,
        body: `<div class="compare"><div class="stat"><div class="big">${cross}</div><div class="lbl">cross-program dependencies</div></div><div class="stat"><div class="big">${same}</div><div class="lbl">within one program</div></div></div>`,
        meaning: `<p>A program-level schedule shows the second number but not the first. The department that oversees the FAA says each program has an integrated schedule; the audit says the schedules are not integrated <em>across</em> programs. This question shows where that difference would matter. The mix here is simulated.</p>`,
        cypher: Q.crossDeps,
      };
    },
  },
  {
    id: "pace", title: "Are real programs on pace?", sub: "Uses the FAA's own public figures",
    why: `Uses real program totals and due dates from the GAO report and the FAA's self-reported progress to work out how many installs per month each ${term("program")} needs.`,
    run() {
      const rows = run(db, Q.pace, { rows: PACE_ROWS }).rows.map((r) => ({
        ...r, verdict: r.neededPerMonth > r.recent ? "needs more than September's pace" : "within September's pace",
      }));
      const behind = rows.filter((r) => r.neededPerMonth > r.recent).map((r) => r.program);
      return {
        tags: ["DOCUMENTED", "INFERRED"],
        summary: `${behind.length} of ${rows.length} programs shown need a faster pace than they managed in September 2026: ${behind.join(" and ") || "none"}.`,
        body: table("Required pace to meet GAO's Table 2 dates", [
          { key: "program", label: "Program" }, { key: "done", label: "Count (Nov 16)", num: true }, { key: "scope", label: "Total", num: true },
          { key: "due", label: "Due" }, { key: "neededPerMonth", label: "Needed per month", num: true },
          { key: "recent", label: "September pace", num: true }, { key: "verdict", label: "Compared" },
        ], rows),
        meaning: `<p>Totals and due dates come from the GAO report (Table 2). Progress counts come from the FAA's Modern Skies page, snapshot dated November 16, 2026, and are the FAA's own reporting; GAO has said it could not verify the data behind the FAA's internal status dashboard. The needed pace is simple arithmetic on those figures. It is not a forecast, because a program's monthly plan can ramp up later, and it ignores how hard each install is.</p>`,
        cypher: Q.pace,
      };
    },
  },
];
const this_q = (id) => QUESTIONS.find((q) => q.id === id);

async function showQuestion(q, note) {
  const el = $("#answer");
  el.innerHTML = `<h2>${esc(q.title)}</h2><p class="status" role="status">Working... larger portfolios can take a few seconds.</p>`;
  await new Promise((res) => setTimeout(res, 30)); // let the browser paint the message first
  let r;
  try { r = q.run(); }
  catch (e) { el.innerHTML = `<h2>${esc(q.title)}</h2><p class="status bad">Something went wrong running this question: ${esc(e.message)}</p><p>Try another question, or reload the page.</p>`; return; }
  el.innerHTML = `
    ${note ? `<p class="matchnote">${note}</p>` : ""}
    <h2>${esc(q.title)}</h2>
    <div class="tags">${r.tags.map((t) => `<span class="tag ${t}" title="${esc(TAGHELP[t])}">${t}</span>`).join("")}</div>
    <p class="why">${q.why}</p>
    ${r.controls ?? ""}
    <p class="summary">${r.summary}</p>
    ${r.body ?? ""}
    ${r.check ? `<div class="check ${r.check.ok ? "" : "bad"}" role="note">${r.check.text}</div>` : ""}
    <details open><summary>What this means</summary>${r.meaning}</details>
    <details><summary>Show the Cypher behind this answer</summary>
      <pre><code>${esc(r.cypher)}</code></pre>
      <p>${term("cypher", "Cypher")} is the query language Relate understands. This exact text ran inside your browser.</p>
    </details>`;
  r.wire?.call(r, el);
  document.querySelectorAll(".qbtn").forEach((b) => b.setAttribute("aria-current", String(b.dataset.q === q.id)));
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// ---------- help ----------
const TOUR = [
  ["Welcome", "<p>This page lets you explore what happens when project schedules are connected in a graph. A government audit found the FAA runs thousands of separate schedules, and this shows what connecting simulated ones can reveal.</p><p>It takes about two minutes. You can reopen this tour any time with <strong>Quick tour</strong>.</p>"],
  ["Pick a question", "<p>The list on the left holds the questions. Start with <strong>What is at one site?</strong>. Each one has a short subtitle so you know what it does.</p>"],
  ["Read the answer", "<p>Every answer starts with <strong>one plain sentence</strong>. Below it are a table or numbers, a <strong>What this means</strong> panel, and a <strong>Show the Cypher</strong> panel with the exact query that ran.</p>"],
  ["Look at the labels", "<p>Colored tags say where each result comes from: <strong>SIMULATED</strong> (made up with known answers), <strong>HYPOTHESIS</strong> (a what-if), <strong>DOCUMENTED</strong> (public figures), and <strong>INFERRED</strong> (arithmetic on public figures). Hover a tag for its meaning.</p>"],
  ["Try a fix", "<p>The <strong>Try a fix</strong> question combines duplicate visits on a copy and then checks what breaks. It is the clearest example of why connected data matters: a fix in one schedule can break another.</p>"],
  ["Ask in your own words", "<p>The <strong>Ask a question</strong> box takes plain sentences. Without a key it is a simple matcher that picks the closest built-in question and tells you which one it chose. It is not an AI.</p><p>For open-ended questions you can optionally <strong>connect Claude</strong> with your own API key. An AI agent then writes its own queries on a scratch copy of the data, and you can see every query it ran.</p>"],
  ["Where Relate fits", "<p>The database is <strong>Relate by Neo4j</strong>, running entirely inside this page. There is no server, and nothing you do here is sent anywhere. Hover underlined words for definitions, or open the <strong>Glossary</strong> and <strong>Help</strong> buttons at the top.</p>"],
];
const FAQ = [
  ["Is this real FAA data?", "No. The projects, sites and crews are simulated so the right answers are known. Only the program names, scope and due dates (GAO report) and the progress counts in the last question (FAA Modern Skies, self-reported) are real."],
  ["Does this show how much the FAA could save?", "No. It shows a method. No public source gives real schedules, crews or costs, so it cannot say what overlaps cost, and it makes no claim about what caused the November 13, 2026 ground stop."],
  ["Why 12 months?", "It is a screening rule chosen for this demo: two visits to the same site within a year are worth a second look. The audit's example had two visits about eight months apart."],
  ["What is a crew conflict?", "One crew booked for two overlapping projects at different sites. A crew cannot be in two places at once."],
  ["How do I know the answers are right?", "The data was made with known conflicts planted in it. Where a question can be checked, a green note under the result confirms the answer matches the planted one."],
  ["What does Relate do here?", "It stores the projects, sites, crews and links as a graph, in your browser's memory, and answers each question with a Cypher query. Open <strong>Show the Cypher</strong> to see them."],
  ["Does anything leave my browser?", "Not unless you connect Claude. The page loads its own files and runs everything locally, and it does not collect or send what you click. If you connect Claude, your question and the query results are sent to api.anthropic.com, and nowhere else."],
  ["What is the Ask box?", "Without a key it is a simple matcher: it looks for key words in your sentence and runs the closest built-in question, telling you which one it chose. It is not an AI and cannot answer anything outside the list. With a key connected, your sentence goes to an AI agent instead."],
  ["Is it safe to paste my API key?", "The key stays in this tab's memory, is never stored by the page, and is forgotten when you close or reload the tab. The page can only send it to api.anthropic.com (the page enforces that with a content security policy), and its code is open source. Still, use a key with a low spending limit, and disconnect when you are done. Usage is billed to your Anthropic account."],
  ["Can the agent be wrong?", "Yes. It writes its own queries and its own summary. That is why every query it ran is shown, and why its answers are labeled AI AGENT. The built-in questions are checked against planted answers; the agent's are not."],
  ["The page says it could not start.", "Browsers block some features when a page is opened by double-clicking the file. Serve the <code>web</code> folder instead, for example with <code>python -m http.server</code>, and open the address it prints."],
];

function setupDialogs() {
  const tour = $("#dlg-tour"); let step = 0;
  const drawTour = () => {
    $("#tour-h").textContent = TOUR[step][0]; $("#tour-body").innerHTML = TOUR[step][1];
    $("#tour-count").textContent = `Step ${step + 1} of ${TOUR.length}`;
    $("#tour-back").disabled = step === 0; $("#tour-next").textContent = step === TOUR.length - 1 ? "Done" : "Next";
  };
  const openTour = () => { step = 0; drawTour(); tour.showModal(); };
  $("#btn-tour").addEventListener("click", openTour);
  $("#tour-back").addEventListener("click", () => { if (step > 0) { step--; drawTour(); } });
  $("#tour-next").addEventListener("click", () => { if (step < TOUR.length - 1) { step++; drawTour(); } else tour.close(); });
  $("#tour-close").addEventListener("click", () => tour.close());
  $("#help-body").innerHTML = `<div class="faq">${FAQ.map(([q, a]) => `<h3>${esc(q)}</h3><p>${a}</p>`).join("")}</div>`;
  $("#gl-body").innerHTML = Object.entries(GLOSSARY).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  $("#btn-help").addEventListener("click", () => $("#dlg-help").showModal());
  $("#btn-glossary").addEventListener("click", () => $("#dlg-glossary").showModal());
  document.querySelectorAll(".close-dlg").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  let seen = false; try { seen = localStorage.getItem("tourSeen") === "1"; } catch { /* storage may be blocked */ }
  return () => { if (!seen) { openTour(); try { localStorage.setItem("tourSeen", "1"); } catch { /* ignore */ } } };
}

// ---------- ask box: simple matcher (no AI) ----------
const tick = () => new Promise((res) => setTimeout(res, 30));
function setAskEnabled(on) { $("#ask-input").disabled = !on; $("#ask-go").disabled = !on; }

// [phrase, weight]: phrases match at the start of a word, so "late" does not match "relate".
const INTENTS = [
  { id: "dupes", words: [["combine", 2], ["duplicate", 3], ["twice", 2], ["two visits", 3], ["close together", 3], ["overlap", 2], ["revisit", 2], ["same site", 2], ["12 months", 2], ["within a year", 3]] },
  { id: "crowded", words: [["crowded", 3], ["busiest", 3], ["how many programs", 3], ["share a site", 3], ["sites have", 2], ["most programs", 3]] },
  { id: "savings", words: [["save", 2], ["saving", 2], ["site-days", 3], ["site days", 3], ["how much time", 3], ["fewer visits", 2]] },
  { id: "fix", words: [["fix", 2], ["merge", 2], ["what breaks", 3], ["break", 2], ["crew conflict", 3], ["try a", 2], ["scenario", 2], ["what happens if we combine", 4]] },
  { id: "slip", words: [["slip", 3], ["delay", 3], ["late", 1], ["pushed", 2], ["propagat", 3], ["knock-on", 3], ["ripple", 3]] },
  { id: "cross", words: [["cross", 2], ["dependenc", 2], ["between programs", 3], ["across programs", 3], ["depend on", 2]] },
  { id: "pace", words: [["pace", 3], ["on track", 3], ["behind", 2], ["faster", 2], ["real program", 3], ["radar", 2], ["telecom", 2], ["gao", 2], ["modern skies", 3], ["on schedule", 3]] },
  { id: "site", words: [["site", 1], ["facility", 2], ["airport", 2], ["what is at", 3], ["what's at", 3], ["located", 1]] },
];
const EXAMPLES = ["Which visits could be combined?", "What happens if we combine them?", "What slips if a project is 60 days late?", "Do dependencies cross programs?", "Which real programs need a faster pace?", "What is at site F00017?"];

function matchQuestion(text) {
  const t = text.toLowerCase();
  let best = null, top = 0;
  for (const it of INTENTS) {
    const score = it.words.reduce((s, [w, wt]) => s + (new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(t) ? wt : 0), 0);
    if (score > top) { best = it.id; top = score; }
  }
  return best;
}

function showNoMatch(text) {
  const el = $("#answer");
  el.innerHTML = `<h2>I could not match that</h2>
    <p class="matchnote">You asked: "${esc(text)}"</p>
    <p>This box is a simple matcher, not an AI, so it only understands the questions in the list. Try one of these:</p>
    <ul>${QUESTIONS.map((q) => `<li><button type="button" class="linklike" data-q="${q.id}">${esc(q.title)}</button></li>`).join("")}</ul>
    <p>For open-ended questions, <button type="button" class="linklike" id="nm-key">connect Claude with your own API key</button>.</p>`;
  el.querySelectorAll("button[data-q]").forEach((b) => b.addEventListener("click", () => showQuestion(this_q(b.dataset.q))));
  el.querySelector("#nm-key").addEventListener("click", openKeyDialog);
  el.focus({ preventScroll: true });
}

async function handleAsk(raw) {
  const text = raw.trim();
  if (!text) return;
  if (agent.key) return runAgent(text);
  let id = matchQuestion(text);
  const site = text.match(/\bF\d{5}\b/i)?.[0].toUpperCase();
  if (site && DATA.facilities.some((f) => f.facility_id === site)) { state.site = site; id = "site"; }
  const days = text.match(/\b(30|60|180)\b/);
  if (days && id === "slip") state.delay = parseInt(days[1], 10);
  if (!id) return showNoMatch(text);
  await showQuestion(this_q(id), `You asked: "${esc(text)}". This simple matcher chose the question below. It is not an AI, so check that it is what you meant.`);
}

// ---------- optional agent: Claude, with the visitor's own API key ----------
const MODELS = [["claude-sonnet-5-5", "Claude Sonnet 5.5 (recommended)"], ["claude-haiku-5-5", "Claude Haiku 5.5 (faster, cheaper)"]];
const agent = { key: null, workspaceId: null, model: MODELS[0][0], db: null };
const MAX_STEPS = 8, ROW_CAP = 40;

const TOOLS = [{
  name: "run_cypher",
  description: "Run one Cypher statement against the in-browser Relate graph. It is a scratch copy of the simulated data, so what-if changes with SET never touch the original. Returns rows as JSON, capped at 40 rows with the total count.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "One Cypher statement." },
      params: { type: "object", description: "Optional parameters, referenced in the query as $name." },
    },
    required: ["query"],
  },
}];

function systemPrompt() {
  return `You answer questions about a SIMULATED portfolio of ${fmt(DATA.projects.length)} infrastructure projects stored in a Relate by Neo4j graph running in the user's browser. Use the run_cypher tool to look things up. Never guess a number you could query.

Graph schema:
(:Program {programId, name, domain, plannedScope, completionDay, completionDate, provenance})
(:Facility {facilityId, name, type, restriction, provenance})   // a site. restriction is null, or 'NO_MERGE_VISITS' meaning visits there cannot be combined
(:Project {projectId, startDay, endDay, deadlineDay, provenance})   // days are integers, day 0 = 2026-01-01, window is [startDay, endDay)
(:Crew {crewId}), (:MaintenanceWindow {startDay, endDay}), (:Source {sourceId})
(:Project)-[:IN_PROGRAM]->(:Program)
(:Project)-[:SCHEDULED_AT]->(:Facility)
(:Project)-[:ASSIGNED_TO]->(:Crew)
(:Project)-[:DEPENDS_ON]->(:Project)   // dependent -> prerequisite
(:Facility)-[:HAS_MAINTENANCE]->(:MaintenanceWindow)

Definitions used elsewhere on this page:
- "Close together": two projects at the same site, in different programs, starting within 365 days, with no DEPENDS_ON between them in either direction. "Combinable" means the site has restriction IS NULL.
- "Crew conflict": two projects with the same crew, overlapping windows, at different sites.
- Dependency slip: a project that starts late pushes a dependent project only if it overruns that project's start.

Rules:
- Answer in plain language for a non-technical reader, in a few short paragraphs. Give the numbers you found.
- Say the data is simulated. Only the program names, scope and completion dates come from GAO-26-107992 Table 2.
- Make no claim about real FAA conflicts, costs, savings, or the cause of the November 13, 2026 ground stop. If asked, say this data cannot show that.
- Queries run on a scratch copy and you may test what-if changes with SET or CREATE. Keep queries efficient: anchor variable-length paths on a known node, and aggregate instead of returning thousands of rows.
- If a query errors, read the message and try a corrected version. Stop after a few attempts and say what you could not do.`;
}

function agentRun(input) {
  try {
    const env = JSON.parse(agent.db.execute(String(input.query ?? ""), input.params ? JSON.stringify(input.params) : null));
    if (env.error) return { ok: false, rows: 0, text: "Error: " + env.error };
    const total = env.rows.length;
    return { ok: true, rows: total, text: JSON.stringify({ columns: env.columns, rows: env.rows.slice(0, ROW_CAP), total, truncated: total > ROW_CAP }) };
  } catch (e) {
    return { ok: false, rows: 0, text: "Error: " + e.message };
  }
}

function friendlyHttp(status, detail) {
  if (status === 400 && /not scoped to a workspace|anthropic-workspace-id|workspace id/i.test(detail)) return "Anthropic requires a workspace ID for this API key. Enter the workspace ID from your Anthropic workspace, then reconnect.";
  if (status === 401) return "Claude rejected the API key. Check it and connect again.";
  if (status === 403) return "This API key is not allowed to use that model.";
  if (status === 404) return "Claude could not find that model. Pick a different model when you connect.";
  if (status === 429) return "Claude says the rate limit or spending limit was reached. Wait a moment or check your limits.";
  if (status >= 500) return "Claude is temporarily unavailable. Try again shortly.";
  return `Claude returned an error (${status})${detail ? ": " + detail : ""}.`;
}

async function callClaude(messages) {
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": agent.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        ...(agent.workspaceId ? { "anthropic-workspace-id": agent.workspaceId } : {}),
      },
      body: JSON.stringify({ model: agent.model, max_tokens: 1500, system: systemPrompt(), tools: TOOLS, messages }),
    });
  } catch {
    throw new Error("Could not reach api.anthropic.com. Check your connection, or whether a browser extension is blocking it.");
  }
  if (!r.ok) {
    let detail = ""; try { detail = (await r.json()).error?.message ?? ""; } catch { /* no body */ }
    throw new Error(friendlyHttp(r.status, detail));
  }
  return r.json();
}

const plain = (text) => esc(text).split(/\n{2,}/).map((p) => `<p>${p.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`).join("");

function renderAgent(question, finalText, log, note) {
  const steps = log.map((s, i) => `<div class="agent-step"><div class="meta">Query ${i + 1}: ${s.ok ? `${fmt(s.rows)} row${s.rows === 1 ? "" : "s"}` : "error"}</div>
    <pre><code>${esc(s.query)}</code></pre>${s.params ? `<div class="meta">Parameters: ${esc(JSON.stringify(s.params)).slice(0, 300)}</div>` : ""}${s.ok ? "" : `<div class="meta">${esc(s.text)}</div>`}</div>`).join("");
  $("#answer").innerHTML = `
    <h2>Your question</h2>
    <p class="summary">${esc(question)}</p>
    <div class="tags"><span class="tag AGENT" title="${esc(TAGHELP.AGENT)}">AI AGENT</span><span class="tag SIMULATED" title="${esc(TAGHELP.SIMULATED)}">SIMULATED</span></div>
    ${note ? `<p class="matchnote">${esc(note)}</p>` : ""}
    <div class="agent-final">${plain(finalText)}</div>
    <div class="check" role="note"><strong>Written by Claude (${esc(agent.model)}) from the queries below.</strong> It can make mistakes, so check the Cypher before relying on a number. The queries ran on a scratch copy; your data was not changed.</div>
    <details open><summary>What the agent did (${log.length} ${log.length === 1 ? "query" : "queries"})</summary>${steps || "<p>It answered without running a query.</p>"}</details>`;
  $("#answer").focus({ preventScroll: true });
}

async function runAgent(question) {
  const el = $("#answer");
  const setStatus = (t) => { const s = $("#agent-status"); if (s) s.textContent = t; };
  el.innerHTML = `<h2>Your question</h2><p class="summary">${esc(question)}</p><p class="status" id="agent-status" role="status">Preparing a scratch copy of the data...</p>`;
  await tick();
  const log = [];
  try {
    if (!agent.db) agent.db = buildDb();
    const messages = [{ role: "user", content: question }];
    for (let step = 1; step <= MAX_STEPS; step++) {
      setStatus(`Asking Claude (step ${step} of up to ${MAX_STEPS})...`);
      const res = await callClaude(messages);
      messages.push({ role: "assistant", content: res.content });
      const calls = res.content.filter((b) => b.type === "tool_use");
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n\n").trim();
      if (res.stop_reason !== "tool_use" || !calls.length) return renderAgent(question, text || "(Claude gave no answer.)", log);
      const results = [];
      for (const c of calls) {
        setStatus(`Running a query (${log.length + 1})...`);
        await tick();
        const out = agentRun(c.input ?? {});
        log.push({ query: String(c.input?.query ?? ""), params: c.input?.params, ok: out.ok, rows: out.rows, text: out.text });
        results.push({ type: "tool_result", tool_use_id: c.id, content: out.text, is_error: !out.ok });
      }
      messages.push({ role: "user", content: results });
    }
    renderAgent(question, "The agent reached its step limit before finishing. The queries it ran are listed below.", log);
  } catch (e) {
    el.innerHTML = `<h2>Your question</h2><p class="summary">${esc(question)}</p><p class="status bad">${esc(e.message)}</p>
      <p>You can still use the questions in the list, or <button type="button" class="linklike" id="ag-retry">try again</button>.</p>`;
    el.querySelector("#ag-retry").addEventListener("click", () => runAgent(question));
  }
}

function updateAgentState() {
  const box = $("#agent-state"), input = $("#ask-input");
  if (agent.key) {
    box.innerHTML = `Agent connected (${esc(agent.model)}). Questions you type now go to Claude, which writes its own queries on a scratch copy of the data. <button type="button" class="linklike" id="agent-off">Disconnect</button>`;
    box.querySelector("#agent-off").addEventListener("click", disconnectAgent);
    input.placeholder = "Ask anything about the data...";
  } else {
    box.textContent = "";
    input.placeholder = "For example: which visits could be combined?";
  }
}
function disconnectAgent() { agent.key = null; agent.workspaceId = null; agent.db = null; updateAgentState(); }
function openKeyDialog() { $("#key-msg").textContent = ""; $("#key-msg").className = "status"; $("#key-input").value = ""; $("#workspace-input").value = ""; $("#dlg-key").showModal(); }

function setupAsk() {
  const chips = $("#ask-chips");
  chips.innerHTML = EXAMPLES.map((e) => `<button type="button" class="chip">${esc(e)}</button>`).join("");
  chips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (b && !$("#ask-input").disabled) { $("#ask-input").value = b.textContent; handleAsk(b.textContent); }
  });
  $("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); handleAsk($("#ask-input").value); });
  const dlg = $("#dlg-key");
  $("#key-model").innerHTML = MODELS.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join("");
  $("#btn-key").addEventListener("click", openKeyDialog);
  $("#key-cancel").addEventListener("click", () => dlg.close());
  $("#key-disconnect").addEventListener("click", () => { disconnectAgent(); $("#key-input").value = ""; $("#workspace-input").value = ""; dlg.close(); });
  $("#key-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const k = $("#key-input").value.trim(), msg = $("#key-msg");
    if (!/^sk-ant-/.test(k)) { msg.className = "status bad"; msg.textContent = "That does not look like an Anthropic API key. They start with sk-ant-."; return; }
    agent.key = k; agent.workspaceId = $("#workspace-input").value.trim() || null; agent.model = $("#key-model").value; agent.db = null;
    $("#key-input").value = "";
    $("#workspace-input").value = "";
    updateAgentState();
    dlg.close();
  });
  updateAgentState();
}

// ---------- boot ----------
let inited = false;
const PLACEHOLDER = `<p class="placeholder">Ask a question above, or pick one on the left. If you are not sure where to start, try <strong>What is at one site?</strong></p>`;

// Loads (or reloads) a portfolio of the given size into a fresh in-memory Relate database.
async function loadPortfolio(size) {
  const status = $("#status"), pick = $("#size-pick");
  document.querySelectorAll(".qbtn").forEach((b) => (b.disabled = true));
  setAskEnabled(false);
  pick.disabled = true;
  status.className = "status";
  status.textContent = size === 11389
    ? "Loading 11,389 projects into Relate. This can take a while and the page may pause. Please wait..."
    : "Loading Relate in your browser...";
  await new Promise((res) => setTimeout(res, 50)); // let the browser paint the message first
  try {
    const t0 = performance.now();
    if (!inited) { await init(); inited = true; }
    await loadFiles(size);
    SIZE = size;
    agent.db = null; // the agent's scratch copy belongs to the previous portfolio
    if (db) { try { db.free(); } catch { /* already released */ } db = null; }
    db = buildDb();
    const n = run(db, "MATCH (p:Project) RETURN count(p) AS n").rows[0].n;
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    status.className = "status ok";
    status.textContent = `Ready: ${fmt(n)} simulated projects loaded into Relate, running in this page (${secs} s).`;
    state.site = null;
    $("#answer").innerHTML = PLACEHOLDER;
    document.querySelectorAll(".qbtn").forEach((b) => (b.disabled = false));
    setAskEnabled(true);
    return true;
  } catch (e) {
    status.className = "status bad";
    status.textContent = `Could not start Relate in this page: ${e.message}. If you opened this file by double-clicking it, serve the web folder over http instead (see Help).`;
    return false;
  } finally {
    pick.disabled = false;
  }
}

async function boot() {
  const list = $("#qlist");
  list.innerHTML = QUESTIONS.map((q) => `<li><button type="button" class="qbtn" data-q="${q.id}" disabled>${esc(q.title)}<small>${esc(q.sub)}</small></button></li>`).join("");
  list.addEventListener("click", (e) => { const b = e.target.closest(".qbtn"); if (b && !b.disabled) showQuestion(this_q(b.dataset.q)); });
  const maybeTour = setupDialogs();
  $("#size-pick").addEventListener("change", (e) => loadPortfolio(parseInt(e.target.value, 10)));
  setupAsk();
  if (await loadPortfolio(11389)) maybeTour();
}
boot();
