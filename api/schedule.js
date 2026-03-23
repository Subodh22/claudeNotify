module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { subscription, delaySeconds } = req.body;
  if (!subscription || !delaySeconds) return res.status(400).json({ error: 'Missing fields' });

  let appUrl = process.env.APP_URL || process.env.VERCEL_URL || '';
  if (appUrl && !appUrl.startsWith('http')) appUrl = 'https://' + appUrl;
  appUrl = appUrl.replace(/\/$/, '');

  if (!appUrl) return res.status(500).json({ error: 'APP_URL not set' });

  // Destination URL passed directly (not encoded) — QStash requirement
  // Secret passed as a forwarded header instead of query param
  const callbackUrl = `${appUrl}/api/notify`;
  const qstashUrl   = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '');

  console.log('Scheduling:', callbackUrl, 'delay:', delaySeconds, 'via', qstashUrl);

  try {
    const response = await fetch(`${qstashUrl}/v2/publish/${callbackUrl}`, {
      method: 'POST',
      headers: {
        Authorization:                    `Bearer ${process.env.QSTASH_TOKEN}`,
        'Content-Type':                   'application/json',
        'Upstash-Delay':                  `${Math.ceil(delaySeconds)}s`,
        'Upstash-Forward-X-Notify-Secret': process.env.NOTIFY_SECRET,
      },
      body: JSON.stringify({ subscription }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('QStash error:', response.status, text);
      return res.status(502).json({ error: `QStash ${response.status}: ${text}`, callbackUrl });
    }

    const data = await response.json();
    res.json({ messageId: data.messageId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
