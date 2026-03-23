const { getTimer, clearTimer } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const active = await getTimer();

    if (active?.message_id) {
      const qstashUrl = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '');
      await fetch(`${qstashUrl}/v2/messages/${active.message_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` },
      });
    }

    await clearTimer();
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
