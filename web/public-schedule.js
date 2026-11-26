// Public FAA schedule sample: the source snapshot is static, public, and processed locally.
import init, { RelateDb } from "./vendor/relate-wasm/relate.js";

const SOURCE_URL = "./data/faa_public_schedule_aug2026.json";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel) => document.querySelector(sel);
const CYpher = `UNWIND $rows AS r
MERGE (f:Facility {facilityId: r.facility_id})
  ON CREATE SET f.name = r.facility_name, f.provenance = r.provenance
MERGE (p:Project {projectId: r.project_id})
  ON CREATE SET p.name = r.project_name, p.provenance = r.provenance
MERGE (src:Source {sourceId: r.source_id})
  ON CREATE SET src.url = r.source_url, src.reportDate = r.snapshot_date, src.provenance = r.provenance
CREATE (a:Activity {
  activityId: r.activity_id, activity: r.activity, program: r.program,
  startDate: r.start_date, finishDate: r.finish_date, status: r.status,
  sourcePage: r.source_page, provenance: r.provenance
})
CREATE (a)-[:AT_FACILITY]->(f)
CREATE (a)-[:PART_OF]->(p)
CREATE (a)-[:DOCUMENTED_IN]->(src)`;
const OVERLAP_CYPHER = `MATCH (a:Activity)-[:AT_FACILITY]->(f:Facility)<-[:AT_FACILITY]-(b:Activity)
WHERE a.activityId < b.activityId
  AND a.startDate <= b.finishDate AND b.startDate <= a.finishDate
RETURN f.facilityId AS facility,
       a.activityId AS activityA, a.program AS programA, a.activity AS taskA,
       a.startDate AS startA, a.finishDate AS finishA,
       b.activityId AS activityB, b.program AS programB, b.activity AS taskB,
       b.startDate AS startB, b.finishDate AS finishB
ORDER BY startA, startB`;

function run(db, query, params) {
  const result = JSON.parse(db.execute(query, params ? JSON.stringify(params) : null));
  if (result.error) throw new Error(result.error);
  return result.rows ?? [];
}
function overlapDays(startA, finishA, startB, finishB) {
  const start = Math.max(Date.parse(startA + "T00:00:00Z"), Date.parse(startB + "T00:00:00Z"));
  const end = Math.min(Date.parse(finishA + "T00:00:00Z"), Date.parse(finishB + "T00:00:00Z"));
  return Math.max(0, Math.floor((end - start) / 86400000) + 1);
}
function renderRecords(data) {
  const rows = data.activities.map((r) => `<tr>
    <td>${esc(r.program)}</td><td>${esc(r.project)}</td><td>${esc(r.activity)}</td>
    <td>${esc(r.start)}</td><td>${esc(r.finish)}</td><td>${esc(r.status || "No status note in source row")}</td>
    <td><a href="${esc(data.source.url)}" target="_blank" rel="noopener">p. ${esc(r.source_page)}</a></td>
  </tr>`).join("");
  $("#records").innerHTML = `<table><caption>${esc(data.title)} — ${esc(data.source.report_date)}</caption>
    <thead><tr><th>Program label</th><th>Project heading</th><th>Activity</th><th>Start</th><th>Finish</th><th>Published note</th><th>Source</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  $("#missing").innerHTML = data.unavailable_fields.map((x) => `<li>${esc(x)}</li>`).join("");
  $("#cypher").textContent = OVERLAP_CYPHER;
}
async function loadAndAnalyze() {
  const button = $("#rerun");
  button.disabled = true;
  $("#status").textContent = "Loading the public planning snapshot…";
  try {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`Could not load source data (HTTP ${response.status})`);
    const data = await response.json();
    renderRecords(data);
    await init();
    const db = new RelateDb();
    const rows = data.activities.map((r) => ({
      activity_id: r.id, activity: r.activity, program: r.program,
      project_id: r.project_id, project_name: r.project,
      facility_id: data.facility.id, facility_name: data.facility.name,
      start_date: r.start, finish_date: r.finish, status: r.status,
      source_page: r.source_page, provenance: r.provenance,
      source_id: data.dataset_id, source_url: data.source.url, snapshot_date: data.source.report_date,
    }));
    run(db, CYpher, { rows });
    const overlaps = run(db, OVERLAP_CYPHER);
    const results = overlaps.map((r) => ({
      ...r,
      days: overlapDays(r.startA, r.finishA, r.startB, r.finishB),
    }));
    if (!results.length) {
      $("#overlaps").innerHTML = "<p>No overlapping date ranges were found in this sample.</p>";
    } else {
      $("#overlaps").innerHTML = `<p class="summary">Found ${results.length} same-facility date overlap${results.length === 1 ? "" : "s"} among the published activities.</p>
        <div class="tablewrap" tabindex="0"><table><caption>Reported date ranges that overlap</caption>
        <thead><tr><th>Facility</th><th>First activity</th><th>Dates</th><th>Second activity</th><th>Dates</th><th>Overlap</th></tr></thead>
        <tbody>${results.map((r) => `<tr>
          <td>${esc(r.facility)}</td>
          <td>${esc(r.programA)} — ${esc(r.taskA)}</td><td>${esc(r.startA)} to ${esc(r.finishA)}</td>
          <td>${esc(r.programB)} — ${esc(r.taskB)}</td><td>${esc(r.startB)} to ${esc(r.finishB)}</td>
          <td>${r.days} calendar days</td>
        </tr>`).join("")}</tbody></table></div>
        <p><strong>Interpretation:</strong> these are date overlaps in the report. The public fields do not establish a crew conflict, shared work scope, an avoidable trip, or an opportunity to combine tasks.</p>`;
    }
    db.free();
    $("#status").textContent = "Loaded and analyzed in this browser.";
    $("#status").classList.add("ok");
  } catch (error) {
    $("#status").textContent = error.message || "Could not load the public schedule sample.";
    $("#status").classList.add("bad");
  } finally {
    button.disabled = false;
  }
}
$("#rerun").addEventListener("click", loadAndAnalyze);
loadAndAnalyze();
