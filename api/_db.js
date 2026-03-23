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
      delay_seconds INTEGER
    )
  `;
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
  await db`
    INSERT INTO active_timer (id, message_id, subscription, delay_seconds)
    VALUES (1, ${messageId}, ${JSON.stringify(subscription)}, ${delaySeconds})
    ON CONFLICT (id) DO UPDATE SET
      message_id    = ${messageId},
      subscription  = ${JSON.stringify(subscription)},
      delay_seconds = ${delaySeconds}
  `;
}

async function clearTimer() {
  const db = sql();
  await ensureTable();
  await db`DELETE FROM active_timer WHERE id = 1`;
}

module.exports = { getTimer, setTimer, clearTimer };
