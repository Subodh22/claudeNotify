// Schedules a push notification via Upstash QStash after delaySeconds.
// QStash will POST to /api/notify with the push subscription in the body.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { subscription, delaySeconds } = req.body;
  if (!subscription || !delaySeconds) return res.status(400).json({ error: 'Missing fields' });

  const appUrl = (process.env.APP_URL || `https://${process.env.VERCEL_URL}`).replace(/\/$/, '');
  const callbackUrl = `${appUrl}/api/notify?secret=${process.env.NOTIFY_SECRET}`;

  try {
    const qstashUrl = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '');
    const response = await fetch(
      `${qstashUrl}/v2/publish/${encodeURIComponent(callbackUrl)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
          'Content-Type': 'application/json',
          'Upstash-Delay': `${Math.ceil(delaySeconds)}s`,
        },
        body: JSON.stringify({ subscription }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('QStash error:', response.status, text);
      return res.status(502).json({ error: `QStash ${response.status}: ${text}` });
    }

    const data = await response.json();
    res.json({ messageId: data.messageId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
};
