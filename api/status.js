const { getTimer } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const timer = await getTimer();
    if (!timer) return res.json({ active: false });
    res.json({
      active:       true,
      firesAt:      timer.fires_at,
      delaySeconds: timer.delay_seconds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
