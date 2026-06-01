const { neon } = require('@neondatabase/serverless');

let _sql;
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

async function ensureTable() {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS active_timer (
      id            INTEGER PRIMARY KEY DEFAULT 1,
      message_id    TEXT,
      subscription  JSONB,
      delay_seconds INTEGER,
      fires_at      TIMESTAMPTZ
    )
  `;
  await db`ALTER TABLE active_timer ADD COLUMN IF NOT EXISTS fires_at TIMESTAMPTZ`;
}

async function getTimer() {
  const db = sql();
  await ensureTable();
  const rows = await db`SELECT * FROM active_timer WHERE id = 1`;
  return rows[0] || null;
}

async function setTimer(messageId, subscription, delaySeconds) {
  const db = sql();
  await ensureTable();
  const firesAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  await db`
    INSERT INTO active_timer (id, message_id, subscription, delay_seconds, fires_at)
    VALUES (1, ${messageId}, ${JSON.stringify(subscription)}, ${delaySeconds}, ${firesAt})
    ON CONFLICT (id) DO UPDATE SET
      message_id    = ${messageId},
      subscription  = ${JSON.stringify(subscription)},
      delay_seconds = ${delaySeconds},
      fires_at      = ${firesAt}
  `;
}

async function clearTimer() {
  const db = sql();
  await ensureTable();
  await db`DELETE FROM active_timer WHERE id = 1`;
}

// ── Usage tracking ──────────────────────────────────────────────────────────

async function ensureUsageTable() {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS usage_sessions (
      id                  SERIAL PRIMARY KEY,
      session_id          TEXT UNIQUE,
      project             TEXT,
      input_tokens        BIGINT DEFAULT 0,
      output_tokens       BIGINT DEFAULT 0,
      cache_read_tokens   BIGINT DEFAULT 0,
      cache_create_tokens BIGINT DEFAULT 0,
      cost_usd            NUMERIC(10,6) DEFAULT 0,
      model               TEXT,
      recorded_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

async function recordUsageSession({ sessionId, project, inputTokens, outputTokens, cacheReadTokens, cacheCreateTokens, costUsd, model }) {
  const db = sql();
  await ensureUsageTable();
  await db`
    INSERT INTO usage_sessions
      (session_id, project, input_tokens, output_tokens, cache_read_tokens, cache_create_tokens, cost_usd, model)
    VALUES
      (${sessionId}, ${project}, ${inputTokens}, ${outputTokens}, ${cacheReadTokens}, ${cacheCreateTokens}, ${costUsd}, ${model})
    ON CONFLICT (session_id) DO UPDATE SET
      input_tokens        = ${inputTokens},
      output_tokens       = ${outputTokens},
      cache_read_tokens   = ${cacheReadTokens},
      cache_create_tokens = ${cacheCreateTokens},
      cost_usd            = ${costUsd},
      model               = ${model}
  `;
}

async function getUsageStats() {
  const db = sql();
  await ensureUsageTable();

  const [today]   = await db`
    SELECT COALESCE(SUM(cost_usd),0)::float AS cost,
           COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_create_tokens),0)::bigint AS total_tokens,
           COUNT(*)::int AS sessions
    FROM usage_sessions
    WHERE recorded_at >= CURRENT_DATE`;

  const [week]    = await db`
    SELECT COALESCE(SUM(cost_usd),0)::float AS cost,
           COUNT(*)::int AS sessions
    FROM usage_sessions
    WHERE recorded_at >= CURRENT_DATE - INTERVAL '7 days'`;

  const [allTime] = await db`
    SELECT COALESCE(SUM(cost_usd),0)::float AS cost,
           COUNT(*)::int AS sessions
    FROM usage_sessions`;

  const recent    = await db`
    SELECT project, cost_usd::float AS cost_usd,
           (input_tokens + output_tokens)::bigint AS tokens,
           model, recorded_at
    FROM usage_sessions
    ORDER BY recorded_at DESC
    LIMIT 5`;

  return { today, week, allTime, recent };
}

module.exports = { getTimer, setTimer, clearTimer, recordUsageSession, getUsageStats };
