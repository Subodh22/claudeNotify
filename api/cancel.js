const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // Get the current active timer from KV (always up to date even after re-schedules)
    const active = await kv.get('active-timer');

    if (active?.messageId) {
      const qstashUrl = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '');
      await fetch(`${qstashUrl}/v2/messages/${active.messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` },
      });
    }

    // Clear KV — this also signals /api/notify to stop if it fires before cancel lands
    await kv.del('active-timer');

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
