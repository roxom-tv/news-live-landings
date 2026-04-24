import { getDb, getLandingById, getLandingBySlug, listLandings } from "./db";
import type { AgentName } from "./types";

export type PipelineRunKind = "create" | "live";
export type PipelineRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type PipelineStepStatus = "pending" | "leased" | "running" | "succeeded" | "failed" | "cancelled";
export type PipelineEventLevel = "info" | "warning" | "error";

export type PipelineRequestContext = {
  platform: "telegram" | "slack";
  roomId: string;
  threadId?: string;
  actorId?: string;
};

export type PipelineRunContext = Record<string, unknown>;

export type PipelineRunRecord = {
  id: number;
  kind: PipelineRunKind;
  status: PipelineRunStatus;
  topic?: string;
  slug?: string;
  landingId?: number;
  context: PipelineRunContext;
  requestedBy?: PipelineRequestContext;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  errorDetail?: string;
  createdAt: string;
  updatedAt: string;
};

export type PipelineStepRecord = {
  id: number;
  runId: number;
  sequence: number;
  agentName: AgentName;
  status: PipelineStepStatus;
  payload: PipelineRunContext;
  output?: unknown;
  attemptCount: number;
  maxAttempts: number;
  workerId?: string;
  leaseToken?: string;
  leasedAt?: string;
  heartbeatAt?: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  errorDetail?: string;
  advancedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PipelineHealthSummary = {
  runsQueued: number;
  runsRunning: number;
  stepsPending: number;
  stepsRunning: number;
  staleLeases: number;
};

const now = () => new Date().toISOString();

const ensureSchema = () => {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      topic TEXT,
      slug TEXT,
      landing_id INTEGER,
      requested_by_json TEXT,
      context_json TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      error_code TEXT,
      error_detail TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      agent_name TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      output_json TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 2,
      worker_id TEXT,
      lease_token TEXT,
      leased_at TEXT,
      heartbeat_at TEXT,
      started_at TEXT,
      finished_at TEXT,
      error_code TEXT,
      error_detail TEXT,
      advanced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      step_id INTEGER,
      level TEXT NOT NULL,
      event_name TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
};

const parseJson = <T>(value: unknown, fallback: T) => {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const rowToRun = (row: any): PipelineRunRecord => ({
  id: Number(row.id),
  kind: row.kind,
  status: row.status,
  topic: row.topic ?? undefined,
  slug: row.slug ?? undefined,
  landingId: row.landing_id == null ? undefined : Number(row.landing_id),
  requestedBy: parseJson(row.requested_by_json, undefined),
  context: parseJson<PipelineRunContext>(row.context_json, {}),
  startedAt: row.started_at ?? undefined,
  finishedAt: row.finished_at ?? undefined,
  errorCode: row.error_code ?? undefined,
  errorDetail: row.error_detail ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const rowToStep = (row: any): PipelineStepRecord => ({
  id: Number(row.id),
  runId: Number(row.run_id),
  sequence: Number(row.sequence),
  agentName: row.agent_name,
  status: row.status,
  payload: parseJson<PipelineRunContext>(row.payload_json, {}),
  output: parseJson(row.output_json, undefined),
  attemptCount: Number(row.attempt_count),
  maxAttempts: Number(row.max_attempts),
  workerId: row.worker_id ?? undefined,
  leaseToken: row.lease_token ?? undefined,
  leasedAt: row.leased_at ?? undefined,
  heartbeatAt: row.heartbeat_at ?? undefined,
  startedAt: row.started_at ?? undefined,
  finishedAt: row.finished_at ?? undefined,
  errorCode: row.error_code ?? undefined,
  errorDetail: row.error_detail ?? undefined,
  advancedAt: row.advanced_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const createPipelineRun = (input: {
  kind: PipelineRunKind;
  topic?: string;
  slug?: string;
  landingId?: number;
  context?: PipelineRunContext;
  requestedBy?: PipelineRequestContext;
}) => {
  ensureSchema();
  const timestamp = now();
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO pipeline_runs (kind, status, topic, slug, landing_id, requested_by_json, context_json, created_at, updated_at)
    VALUES (?, 'queued', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.kind,
    input.topic ?? null,
    input.slug ?? null,
    input.landingId ?? null,
    input.requestedBy ? JSON.stringify(input.requestedBy) : null,
    JSON.stringify(input.context ?? {}),
    timestamp,
    timestamp
  );
  const run = getPipelineRun(Number(result.lastInsertRowid));
  if (!run) throw new Error("Failed to create pipeline run.");
  return run;
};

export const getPipelineRun = (id: number) => {
  ensureSchema();
  const row = getDb().prepare("SELECT * FROM pipeline_runs WHERE id = ?").get(id);
  return row ? rowToRun(row) : null;
};

export const updatePipelineRun = (id: number, input: {
  status?: PipelineRunStatus;
  landingId?: number | null;
  context?: PipelineRunContext;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
}) => {
  ensureSchema();
  const current = getPipelineRun(id);
  if (!current) throw new Error(`Pipeline run not found: ${id}`);
  const nextContext = input.context ?? current.context;
  getDb().prepare(`
    UPDATE pipeline_runs
    SET status = ?, landing_id = ?, context_json = ?, started_at = ?, finished_at = ?, error_code = ?, error_detail = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.status ?? current.status,
    input.landingId === undefined ? (current.landingId ?? null) : input.landingId,
    JSON.stringify(nextContext),
    input.startedAt === undefined ? (current.startedAt ?? null) : input.startedAt,
    input.finishedAt === undefined ? (current.finishedAt ?? null) : input.finishedAt,
    input.errorCode === undefined ? (current.errorCode ?? null) : input.errorCode,
    input.errorDetail === undefined ? (current.errorDetail ?? null) : input.errorDetail,
    now(),
    id
  );
  const run = getPipelineRun(id);
  if (!run) throw new Error(`Pipeline run not found after update: ${id}`);
  return run;
};

export const listPipelineSteps = (runId: number) => {
  ensureSchema();
  return getDb()
    .prepare("SELECT * FROM pipeline_steps WHERE run_id = ? ORDER BY sequence ASC, id ASC")
    .all(runId)
    .map(rowToStep);
};

export const getPipelineStep = (id: number) => {
  ensureSchema();
  const row = getDb().prepare("SELECT * FROM pipeline_steps WHERE id = ?").get(id);
  return row ? rowToStep(row) : null;
};

export const getLatestPipelineStep = (runId: number) => {
  ensureSchema();
  const row = getDb().prepare("SELECT * FROM pipeline_steps WHERE run_id = ? ORDER BY sequence DESC, id DESC LIMIT 1").get(runId);
  return row ? rowToStep(row) : null;
};

export const createPipelineStep = (input: {
  runId: number;
  sequence: number;
  agentName: AgentName;
  payload: PipelineRunContext;
  maxAttempts?: number;
}) => {
  ensureSchema();
  const timestamp = now();
  const result = getDb().prepare(`
    INSERT INTO pipeline_steps (run_id, sequence, agent_name, status, payload_json, max_attempts, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(input.runId, input.sequence, input.agentName, JSON.stringify(input.payload), input.maxAttempts ?? 2, timestamp, timestamp);
  const step = getPipelineStep(Number(result.lastInsertRowid));
  if (!step) throw new Error("Failed to create pipeline step.");
  return step;
};

export const leasePipelineStep = (workerId: string, allowedAgents?: AgentName[]) => {
  ensureSchema();
  const db = getDb();
  const candidateRows = (allowedAgents?.length
    ? db.prepare(`
        SELECT * FROM pipeline_steps
        WHERE status = 'pending' AND agent_name IN (${allowedAgents.map(() => "?").join(", ")})
        ORDER BY created_at ASC
        LIMIT 5
      `).all(...allowedAgents)
    : db.prepare(`
        SELECT * FROM pipeline_steps
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `).all()) as Array<{ id: number }>;

  for (const row of candidateRows) {
    const leaseToken = `${workerId}:${Math.random().toString(36).slice(2)}`;
    const timestamp = now();
    const result = db.prepare(`
      UPDATE pipeline_steps
      SET status = 'leased', worker_id = ?, lease_token = ?, leased_at = ?, heartbeat_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(workerId, leaseToken, timestamp, timestamp, timestamp, row.id);
    if (Number(result.changes ?? 0) === 1) {
      const step = getPipelineStep(Number(row.id));
      if (step) return step;
    }
  }

  return null;
};

export const markPipelineStepRunning = (stepId: number) => {
  ensureSchema();
  const timestamp = now();
  getDb().prepare(`
    UPDATE pipeline_steps
    SET status = 'running', started_at = COALESCE(started_at, ?), heartbeat_at = ?, updated_at = ?
    WHERE id = ?
  `).run(timestamp, timestamp, timestamp, stepId);
  return getPipelineStep(stepId);
};

export const heartbeatPipelineStep = (stepId: number) => {
  ensureSchema();
  getDb().prepare("UPDATE pipeline_steps SET heartbeat_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), stepId);
};

export const succeedPipelineStep = (stepId: number, output: unknown) => {
  ensureSchema();
  const timestamp = now();
  getDb().prepare(`
    UPDATE pipeline_steps
    SET status = 'succeeded', output_json = ?, finished_at = ?, heartbeat_at = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(output), timestamp, timestamp, timestamp, stepId);
  return getPipelineStep(stepId);
};

export const failPipelineStep = (stepId: number, input: { errorCode?: string; errorDetail: string }) => {
  ensureSchema();
  const step = getPipelineStep(stepId);
  if (!step) throw new Error(`Pipeline step not found: ${stepId}`);
  const timestamp = now();
  const nextAttemptCount = step.attemptCount + 1;
  const shouldRetry = nextAttemptCount < step.maxAttempts;
  getDb().prepare(`
    UPDATE pipeline_steps
    SET status = ?, attempt_count = ?, error_code = ?, error_detail = ?, finished_at = ?, heartbeat_at = ?, updated_at = ?
    WHERE id = ?
  `).run(shouldRetry ? "pending" : "failed", nextAttemptCount, input.errorCode ?? null, input.errorDetail, timestamp, timestamp, timestamp, stepId);
  return getPipelineStep(stepId);
};

export const markPipelineStepAdvanced = (stepId: number) => {
  ensureSchema();
  getDb().prepare("UPDATE pipeline_steps SET advanced_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), stepId);
};

export const reclaimStalePipelineLeases = (staleBeforeIso: string) => {
  ensureSchema();
  const db = getDb();
  const stale = db.prepare(`
    SELECT * FROM pipeline_steps
    WHERE status IN ('leased', 'running') AND COALESCE(heartbeat_at, leased_at, created_at) < ?
  `).all(staleBeforeIso).map(rowToStep);

  for (const step of stale) {
    db.prepare(`
      UPDATE pipeline_steps
      SET status = CASE WHEN attempt_count + 1 < max_attempts THEN 'pending' ELSE 'failed' END,
          attempt_count = attempt_count + 1,
          error_code = 'lease_expired',
          error_detail = ?,
          worker_id = NULL,
          lease_token = NULL,
          leased_at = NULL,
          heartbeat_at = NULL,
          finished_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(`Step lease expired before completion for worker ${step.workerId ?? "unknown"}.`, now(), now(), step.id);
  }

  return stale.length;
};

export const recordPipelineEvent = (input: {
  runId: number;
  stepId?: number;
  level?: PipelineEventLevel;
  eventName: string;
  message: string;
  payload?: unknown;
}) => {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO pipeline_events (run_id, step_id, level, event_name, message, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.runId,
    input.stepId ?? null,
    input.level ?? "info",
    input.eventName,
    input.message,
    input.payload == null ? null : JSON.stringify(input.payload),
    now()
  );
};

export const listPipelineEvents = (runId: number, limit = 30) => {
  ensureSchema();
  return getDb().prepare(`
    SELECT * FROM pipeline_events
    WHERE run_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(runId, limit);
};

export const listPipelineRuns = (limit = 50) => {
  ensureSchema();
  return getDb()
    .prepare("SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map(rowToRun);
};

export const findLatestPipelineRun = (input: { slugOrTopic?: string; landingId?: number }): PipelineRunRecord | null => {
  ensureSchema();
  if (input.landingId) {
    const row = getDb().prepare(`
      SELECT * FROM pipeline_runs
      WHERE landing_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(input.landingId);
    return row ? rowToRun(row) : null;
  }

  if (!input.slugOrTopic) return null;
  const value = input.slugOrTopic.trim().toLowerCase();
  const row = getDb().prepare(`
    SELECT * FROM pipeline_runs
    WHERE lower(COALESCE(slug, '')) = ? OR lower(COALESCE(topic, '')) = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(value, value);
  if (row) return rowToRun(row);

  const landing = getLandingBySlug(input.slugOrTopic) ?? listLandings(200).find(item => item.topic.toLowerCase() === value) ?? null;
  if (!landing) return null;
  return findLatestPipelineRun({ landingId: landing.id });
};

export const getPipelineRunHealth = (staleBeforeIso: string): PipelineHealthSummary => {
  ensureSchema();
  const runsQueued = getDb().prepare("SELECT COUNT(*) AS count FROM pipeline_runs WHERE status = 'queued'").get() as { count: number };
  const runsRunning = getDb().prepare("SELECT COUNT(*) AS count FROM pipeline_runs WHERE status = 'running'").get() as { count: number };
  const stepsPending = getDb().prepare("SELECT COUNT(*) AS count FROM pipeline_steps WHERE status = 'pending'").get() as { count: number };
  const stepsRunning = getDb().prepare("SELECT COUNT(*) AS count FROM pipeline_steps WHERE status IN ('leased', 'running')").get() as { count: number };
  const staleLeases = getDb().prepare(`
    SELECT COUNT(*) AS count
    FROM pipeline_steps
    WHERE status IN ('leased', 'running') AND COALESCE(heartbeat_at, leased_at, created_at) < ?
  `).get(staleBeforeIso) as { count: number };

  return {
    runsQueued: Number(runsQueued.count),
    runsRunning: Number(runsRunning.count),
    stepsPending: Number(stepsPending.count),
    stepsRunning: Number(stepsRunning.count),
    staleLeases: Number(staleLeases.count)
  };
};

export const resolveRunLanding = (run: PipelineRunRecord) => {
  if (run.landingId) return getLandingById(run.landingId);
  if (run.slug) return getLandingBySlug(run.slug);
  return null;
};
