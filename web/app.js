// Same Site, Different Schedules: Relate by Neo4j running entirely in the browser.
// All data is simulated except the program names, scope and dates (GAO-26-107992, Table 2)
// and the progress counts marked DOCUMENTED (FAA Modern Skies, self-reported).
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
  provenance: "A label on each result saying where it came from: documented, inferred, simulated, or hypothesis."
};
const TAGHELP = {
  SIMULATED: "Generated data with known answers. Not real FAA data.",
  HYPOTHESIS: "A what-if: it assumes something we have not verified, such as two visits being possible at once.",
  DOCUMENTED: "Taken from a public source (GAO report or FAA Modern Skies). The FAA's own figures are self-reported.",
  INFERRED: "Simple arithmetic done on documented figures. Not a forecast."
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

async function loadFiles(size) {
  const names = ["programs", "facilities", "projects", "dependencies", "maintenance_windows"];
  const [schema, truthText, ...csvs] = await Promise.all([
    fetchText("data/schema.cypher"), fetchText(`data/n${size}/ground_truth.json`), ...names.map((n) => fetchText(`data/n${size}/${n}.csv`)),
  ]);
  truth = JSON.parse(truthText).classes;
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

// FAA Modern Skies, self-reported. Totals as of 2026-10-15; recent monthly pace is September 2026.
const PACE_ROWS = [
  { n: "Telecommunications", d: 3508, m: 143 }, { n: "Radios", d: 457, m: 45 }, { n: "Voice switches", d: 220, m: 28 },
  { n: "Radars", d: 15, m: 5 }, { n: "Information displays", d: 0, m: 0 },
];

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
      if (!state.site || !sites.some((s) => s.id === state.site)) state.site = sites[0].id;
      const rows = run(db, Q.site, { id: state.site }).rows;
      const gaps = []; for (let i = 1; i < rows.length; i++) gaps.push(rows[i].startDay - rows[i - 1].startDay);
      const closest = gaps.length ? Math.min(...gaps) : null;
      const programs = new Set(rows.map((r) => r.program)).size;
      const opts = sites.map((s) => `<option value="${esc(s.id)}"${s.id === state.site ? " selected" : ""}>${esc(s.id)} (${s.n} programs)</option>`).join("");
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
          { key: "program", label: "Program" }, { key: "done", label: "Done (Oct 15)", num: true }, { key: "scope", label: "Total", num: true },
          { key: "due", label: "Due" }, { key: "neededPerMonth", label: "Needed per month", num: true },
          { key: "recent", label: "September pace", num: true }, { key: "verdict", label: "Compared" },
        ], rows),
        meaning: `<p>Totals and due dates come from the GAO report (Table 2). Progress counts come from the FAA's Modern Skies page and are the FAA's own reporting; GAO has said it could not verify the data behind the FAA's internal status dashboard. The needed pace is simple arithmetic on those figures. It is not a forecast, because a program's monthly plan can ramp up later, and it ignores how hard each install is.</p>`,
        cypher: Q.pace,
      };
    },
  },
];
const this_q = (id) => QUESTIONS.find((q) => q.id === id);

async function showQuestion(q) {
  const el = $("#answer");
  el.innerHTML = `<h2>${esc(q.title)}</h2><p class="status" role="status">Working... larger portfolios can take a few seconds.</p>`;
  await new Promise((res) => setTimeout(res, 30)); // let the browser paint the message first
  let r;
  try { r = q.run(); }
  catch (e) { el.innerHTML = `<h2>${esc(q.title)}</h2><p class="status bad">Something went wrong running this question: ${esc(e.message)}</p><p>Try another question, or reload the page.</p>`; return; }
  el.innerHTML = `
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
  ["Where Relate fits", "<p>The database is <strong>Relate by Neo4j</strong>, running entirely inside this page. There is no server, and nothing you do here is sent anywhere. Hover underlined words for definitions, or open the <strong>Glossary</strong> and <strong>Help</strong> buttons at the top.</p>"],
];
const FAQ = [
  ["Is this real FAA data?", "No. The projects, sites and crews are simulated so the right answers are known. Only the program names, scope and due dates (GAO report) and the progress counts in the last question (FAA Modern Skies, self-reported) are real."],
  ["Does this show how much the FAA could save?", "No. It shows a method. No public source gives real schedules, crews or costs, so it cannot say what overlaps cost, and it makes no claim about what caused the November 13, 2026 ground stop."],
  ["Why 12 months?", "It is a screening rule chosen for this demo: two visits to the same site within a year are worth a second look. The audit's example had two visits about eight months apart."],
  ["What is a crew conflict?", "One crew booked for two overlapping projects at different sites. A crew cannot be in two places at once."],
  ["How do I know the answers are right?", "The data was made with known conflicts planted in it. Where a question can be checked, a green note under the result confirms the answer matches the planted one."],
  ["What does Relate do here?", "It stores the projects, sites, crews and links as a graph, in your browser's memory, and answers each question with a Cypher query. Open <strong>Show the Cypher</strong> to see them."],
  ["Does anything leave my browser?", "No. The page loads its own files and runs everything locally. It does not collect or send what you click."],
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

// ---------- boot ----------
let inited = false;
const PLACEHOLDER = `<p class="placeholder">Pick a question on the left to begin. If you are not sure where to start, try <strong>What is at one site?</strong></p>`;

// Loads (or reloads) a portfolio of the given size into a fresh in-memory Relate database.
async function loadPortfolio(size) {
  const status = $("#status"), pick = $("#size-pick");
  document.querySelectorAll(".qbtn").forEach((b) => (b.disabled = true));
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
    if (db) { try { db.free(); } catch { /* already released */ } db = null; }
    db = buildDb();
    const n = run(db, "MATCH (p:Project) RETURN count(p) AS n").rows[0].n;
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    status.className = "status ok";
    status.textContent = `Ready: ${fmt(n)} simulated projects loaded into Relate, running in this page (${secs} s).`;
    state.site = null;
    $("#answer").innerHTML = PLACEHOLDER;
    document.querySelectorAll(".qbtn").forEach((b) => (b.disabled = false));
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
  if (await loadPortfolio(1000)) maybeTour();
}
boot();
