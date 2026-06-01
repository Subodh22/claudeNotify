const { recordUsageSession, getUsageStats } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-usage-secret');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    try {
      const stats = await getUsageStats();
      return res.json(stats);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const secret = process.env.USAGE_SECRET;
    if (secret && req.headers['x-usage-secret'] !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sessionId, project, inputTokens, outputTokens,
            cacheReadTokens, cacheCreateTokens, costUsd, model } = req.body;

    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    try {
      await recordUsageSession({
        sessionId, project: project || 'unknown',
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        cacheReadTokens: cacheReadTokens || 0,
        cacheCreateTokens: cacheCreateTokens || 0,
        costUsd: costUsd || 0,
        model: model || 'unknown',
      });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
};
