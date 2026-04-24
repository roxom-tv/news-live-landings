import { basename, dirname, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { LandingContent, LandingRecord, LandingStatus, Source } from "./types";
import { env, finalUrlForSlug } from "./config";

type DatabaseSync = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { lastInsertRowid?: number | bigint; changes?: number };
  };
};

export type TokenUsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type LandingTopicMatch = {
  landing: LandingRecord;
  score: number;
  matchType: "exact" | "similar";
};

let database: DatabaseSync | null = null;

const dbPath = () => {
  const raw = env.databaseUrl.replace(/^file:/, "");
  return raw.startsWith("/") ? raw : join("/tmp", basename(raw));
};

export const getDb = (): DatabaseSync => {
  if (database) return database;
  const file = dbPath();
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Load at runtime so Next/Turbopack does not try to bundle the experimental builtin.
  const sqlite = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.("node:sqlite") as
    | { DatabaseSync: new (path: string) => DatabaseSync }
    | undefined;
  if (!sqlite) throw new Error("node:sqlite is unavailable. Run this app with Node 22+.");
  const { DatabaseSync: NodeDatabaseSync } = sqlite;
  database = new NodeDatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS landings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      topic TEXT NOT NULL,
      status TEXT NOT NULL,
      final_url TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_cycle_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      landing_id INTEGER,
      agent_name TEXT NOT NULL,
      model TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      output_json TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS live_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      landing_id INTEGER NOT NULL,
      materiality TEXT NOT NULL,
      delta_hash TEXT NOT NULL,
      critic_result TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      landing_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      outlet TEXT NOT NULL,
      url TEXT NOT NULL,
      credibility TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telegram_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL,
      chat_id TEXT,
      command TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      direction TEXT NOT NULL,
      room_id TEXT,
      thread_id TEXT,
      actor_id TEXT,
      command TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureColumn("agent_runs", "input_tokens", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("agent_runs", "output_tokens", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("agent_runs", "total_tokens", "INTEGER NOT NULL DEFAULT 0");
  return database;
};

const now = () => new Date().toISOString();

const topicStopWords = new Set([
  "the", "a", "an", "and", "or", "to", "for", "of", "in", "on", "at", "by",
  "with", "from", "vs", "v", "is", "are", "was", "were", "as", "about", "after",
  "before", "this", "that", "these", "those", "latest", "live", "news", "update"
]);

const normalizeTopicText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const topicTokens = (value: string) =>
  normalizeTopicText(value)
    .split(" ")
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !topicStopWords.has(token));

const topicSimilarityScore = (left: string, right: string) => {
  const leftTokens = topicTokens(left);
  const rightTokens = topicTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) overlap += 1;
  }
  if (overlap === 0) return 0;
  const union = new Set([...leftSet, ...rightSet]).size;
  const jaccard = overlap / union;
  const coverage = overlap / Math.min(leftSet.size, rightSet.size);
  return Math.max(jaccard, coverage * 0.92);
};

const ensureColumn = (table: string, column: string, definition: string) => {
  const db = getDb();
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some(existing => existing.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

const rowToLanding = (row: any): LandingRecord => ({
  id: Number(row.id),
  slug: row.slug,
  topic: row.topic,
  status: row.status,
  finalUrl: row.final_url,
  content: JSON.parse(row.content_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastCycleAt: row.last_cycle_at ?? undefined
});

export const createLanding = (content: LandingContent): LandingRecord => {
  const db = getDb();
  const timestamp = now();
  const finalUrl = finalUrlForSlug(content.slug);
  const result = db.prepare(`
    INSERT INTO landings (slug, topic, status, final_url, content_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(content.slug, content.topic, content.status, finalUrl, JSON.stringify(content), timestamp, timestamp);
  const landing = getLandingById(Number(result.lastInsertRowid));
  if (!landing) throw new Error("Landing insert failed");
  upsertSources(landing.id, content.sources);
  return landing;
};

export const updateLandingContent = (id: number, content: LandingContent, status: LandingStatus = content.status) => {
  const db = getDb();
  const timestamp = now();
  db.prepare(`
    UPDATE landings SET status = ?, content_json = ?, updated_at = ? WHERE id = ?
  `).run(status, JSON.stringify({ ...content, status }), timestamp, id);
  upsertSources(id, content.sources);
  const landing = getLandingById(id);
  if (!landing) throw new Error("Landing update failed");
  return landing;
};

export const updateLandingStatus = (id: number, status: LandingStatus) => {
  const db = getDb();
  db.prepare("UPDATE landings SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), id);
};

export const markLandingCycle = (id: number) => {
  getDb().prepare("UPDATE landings SET last_cycle_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), id);
};

export const getLandingById = (id: number) => {
  const row = getDb().prepare("SELECT * FROM landings WHERE id = ?").get(id);
  return row ? rowToLanding(row) : null;
};

export const getLandingBySlug = (slug: string) => {
  const row = getDb().prepare("SELECT * FROM landings WHERE slug = ?").get(slug);
  return row ? rowToLanding(row) : null;
};

export const listLandings = (limit = 50) =>
  getDb()
    .prepare("SELECT * FROM landings ORDER BY updated_at DESC LIMIT ?")
    .all(limit)
    .map(rowToLanding);

export const findLandingByTopic = (
  topic: string,
  options?: {
    statuses?: LandingStatus[];
    limit?: number;
    minimumScore?: number;
  }
): LandingTopicMatch | null => {
  const normalizedTopic = normalizeTopicText(topic);
  if (!normalizedTopic) return null;

  const statuses = options?.statuses;
  const candidates = listLandings(options?.limit ?? 200)
    .filter(landing => !statuses || statuses.includes(landing.status));

  const exact = candidates.find(landing => normalizeTopicText(landing.topic) === normalizedTopic);
  if (exact) return { landing: exact, score: 1, matchType: "exact" };

  let best: LandingTopicMatch | null = null;
  for (const landing of candidates) {
    const score = topicSimilarityScore(topic, landing.topic);
    if (!best || score > best.score) {
      best = {
        landing,
        score,
        matchType: "similar"
      };
    }
  }

  if (!best) return null;
  const threshold = options?.minimumScore ?? 0.74;
  if (best.score < threshold) return null;
  return best;
};

export const listActiveLandings = () =>
  getDb()
    .prepare("SELECT * FROM landings WHERE status = 'live' ORDER BY updated_at DESC")
    .all()
    .map(rowToLanding);

export const recordAgentRun = (input: {
  landingId?: number;
  agentName: string;
  model: string;
  inputHash: string;
  output: unknown;
  status: "ok" | "error";
  error?: string;
  tokenUsage?: Partial<TokenUsageSummary>;
}) => {
  getDb().prepare(`
    INSERT INTO agent_runs (landing_id, agent_name, model, input_hash, output_json, status, error, input_tokens, output_tokens, total_tokens, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.landingId ?? null,
    input.agentName,
    input.model,
    input.inputHash,
    JSON.stringify(input.output),
    input.status,
    input.error ?? null,
    input.tokenUsage?.inputTokens ?? 0,
    input.tokenUsage?.outputTokens ?? 0,
    input.tokenUsage?.totalTokens ?? 0,
    now()
  );
};

export const summarizeTokenUsageSince = (createdAtIso: string): TokenUsageSummary => {
  const row = getDb()
    .prepare(
      "SELECT COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens, COALESCE(SUM(total_tokens), 0) AS totalTokens FROM agent_runs WHERE created_at >= ?"
    )
    .get(createdAtIso) as TokenUsageSummary;

  return {
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    totalTokens: Number(row.totalTokens)
  };
};

export const summarizeAllTokenUsage = (): TokenUsageSummary & { runs: number } => {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS runs, COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens, COALESCE(SUM(total_tokens), 0) AS totalTokens FROM agent_runs"
    )
    .get() as TokenUsageSummary & { runs: number };

  return {
    runs: Number(row.runs),
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    totalTokens: Number(row.totalTokens)
  };
};

export const recordLiveCycle = (landingId: number, materiality: string, deltaHash: string, criticResult: unknown) => {
  getDb().prepare(`
    INSERT INTO live_cycles (landing_id, materiality, delta_hash, critic_result, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(landingId, materiality, deltaHash, JSON.stringify(criticResult), now());
};

export const recordChatEvent = (input: {
  platform: "telegram" | "slack";
  direction: "in" | "out";
  payload: unknown;
  roomId?: string;
  threadId?: string;
  actorId?: string;
  command?: string;
}) => {
  getDb().prepare(`
    INSERT INTO chat_events (platform, direction, room_id, thread_id, actor_id, command, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.platform,
    input.direction,
    input.roomId ?? null,
    input.threadId ?? null,
    input.actorId ?? null,
    input.command ?? null,
    JSON.stringify(input.payload),
    now()
  );
};

export const recordTelegramEvent = (direction: "in" | "out", payload: unknown, chatId?: string, command?: string) => {
  getDb().prepare(`
    INSERT INTO telegram_events (direction, chat_id, command, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(direction, chatId ?? null, command ?? null, JSON.stringify(payload), now());
  recordChatEvent({ platform: "telegram", direction, payload, roomId: chatId, command });
};

export const findLandingBySourceUrl = (sourceUrl: string) => {
  const row = getDb().prepare(`
    SELECT landings.* FROM landings
    INNER JOIN sources ON sources.landing_id = landings.id
    WHERE sources.url = ?
    ORDER BY landings.updated_at DESC
    LIMIT 1
  `).get(sourceUrl);
  return row ? rowToLanding(row) : null;
};

export const getAppSetting = (key: string, fallback: string) => {
  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value?: string } | undefined;
  return row?.value ?? fallback;
};

export const setAppSetting = (key: string, value: string) => {
  getDb().prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now());
};

export const isAutoRefreshEnabled = () => getAppSetting("auto_refresh_enabled", "true") !== "false";

export const setAutoRefreshEnabled = (enabled: boolean) => setAppSetting("auto_refresh_enabled", enabled ? "true" : "false");

const upsertSources = (landingId: number, sources: Source[]) => {
  const db = getDb();
  db.prepare("DELETE FROM sources WHERE landing_id = ?").run(landingId);
  for (const source of sources) {
    db.prepare(`
      INSERT INTO sources (landing_id, title, outlet, url, credibility, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(landingId, source.title, source.outlet, source.url, source.credibility, now());
  }
};
