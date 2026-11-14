// Project 11,389 graph schema (v0.1). Labels PascalCase, relationship types SCREAMING_SNAKE_CASE,
// properties camelCase. Relationship direction: dependent -> referenced.
// Every node carries `provenance` in {DOCUMENTED, INFERRED, SIMULATED, HYPOTHESIS}.
// Days are integers: day 0 = 2026-01-01; windows are half-open [startDay, endDay).

// ---------- Schedule track ----------
// (:Project)-[:IN_PROGRAM]->(:Program)
// (:Project)-[:SCHEDULED_AT]->(:Facility)
// (:Project)-[:ASSIGNED_TO]->(:Crew)
// (:Project)-[:DEPENDS_ON]->(:Project)          // dependent -> prerequisite
// (:Facility)-[:HAS_MAINTENANCE]->(:MaintenanceWindow)
// (:Program)-[:DOCUMENTED_IN]->(:Source)         // GAO-26-107992 Table 2, p. 17

CREATE CONSTRAINT program_id_unique IF NOT EXISTS FOR (n:Program) REQUIRE n.programId IS UNIQUE;
CREATE CONSTRAINT facility_id_unique IF NOT EXISTS FOR (n:Facility) REQUIRE n.facilityId IS UNIQUE;
CREATE CONSTRAINT project_id_unique IF NOT EXISTS FOR (n:Project) REQUIRE n.projectId IS UNIQUE;
CREATE CONSTRAINT crew_id_unique IF NOT EXISTS FOR (n:Crew) REQUIRE n.crewId IS UNIQUE;
CREATE CONSTRAINT source_id_unique IF NOT EXISTS FOR (n:Source) REQUIRE n.sourceId IS UNIQUE;

CREATE CONSTRAINT project_start_exists IF NOT EXISTS FOR (n:Project) REQUIRE n.startDay IS NOT NULL;
CREATE CONSTRAINT project_provenance_exists IF NOT EXISTS FOR (n:Project) REQUIRE n.provenance IS NOT NULL;
CREATE CONSTRAINT project_start_integer IF NOT EXISTS FOR (n:Project) REQUIRE n.startDay IS :: INTEGER;

CREATE INDEX project_start_idx IF NOT EXISTS FOR (n:Project) ON (n.startDay);

// ---------- Incident-scenario track (all HYPOTHESIS or SIMULATED) ----------
// (:Facility)-[:HOSTS]->(:Equipment)
// (:Circuit)-[:ENDS_AT]->(:Equipment)            // two ends per circuit
// (:Service)-[:RIDES_ON {role}]->(:Circuit)      // role: PRIMARY | BACKUP
// (:Cutover)-[:MIGRATES]->(:Circuit)
// (:Hypothesis)-[:TESTED_BY]->(:Scenario)

CREATE CONSTRAINT equipment_id_unique IF NOT EXISTS FOR (n:Equipment) REQUIRE n.equipmentId IS UNIQUE;
CREATE CONSTRAINT circuit_id_unique IF NOT EXISTS FOR (n:Circuit) REQUIRE n.circuitId IS UNIQUE;
CREATE CONSTRAINT service_id_unique IF NOT EXISTS FOR (n:Service) REQUIRE n.serviceId IS UNIQUE;
CREATE CONSTRAINT cutover_id_unique IF NOT EXISTS FOR (n:Cutover) REQUIRE n.cutoverId IS UNIQUE;
CREATE CONSTRAINT hypothesis_id_unique IF NOT EXISTS FOR (n:Hypothesis) REQUIRE n.hypothesisId IS UNIQUE;
CREATE CONSTRAINT scenario_id_unique IF NOT EXISTS FOR (n:Scenario) REQUIRE n.scenarioId IS UNIQUE;

CREATE INDEX rides_on_role_idx IF NOT EXISTS FOR ()-[r:RIDES_ON]-() ON (r.role);
