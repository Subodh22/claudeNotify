const webpush          = require('web-push');
const { getTimer, setTimer, clearTimer } = require('./_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  if (req.headers['x-notify-secret'] !== process.env.NOTIFY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { subscription, delaySeconds } = req.body;
  if (!subscription) return res.status(400).json({ error: 'Missing subscription' });

  // If timer was stopped (row deleted), do nothing
  const active = await getTimer();
  if (!active) {
    console.log('Timer stopped — skipping');
    return res.status(200).json({ ok: true, note: 'stopped' });
  }

  // Send push notification
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  try {
    await webpush.sendNotification(subscription, JSON.stringify({
      title: 'Claude is ready! 🚀',
      body:  'Usage limit reset. Go build something.',
      icon:  '/icon.svg',
      tag:   'claude-reset',
    }));
  } catch (err) {
    if (err.statusCode !== 410 && err.statusCode !== 404) {
      console.error('Push failed:', err);
      return res.status(500).json({ error: 'Push failed' });
    }
  }

  // Re-schedule next cycle
  let appUrl = process.env.APP_URL || process.env.VERCEL_URL || '';
  if (appUrl && !appUrl.startsWith('http')) appUrl = 'https://' + appUrl;
  appUrl = appUrl.replace(/\/$/, '');

  const qstashUrl = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '');

  try {
    const response = await fetch(`${qstashUrl}/v2/publish/${appUrl}/api/notify`, {
      method: 'POST',
      headers: {
        Authorization:                    `Bearer ${process.env.QSTASH_TOKEN}`,
        'Content-Type':                   'application/json',
        'Upstash-Delay':                  `${Math.ceil(delaySeconds)}s`,
        'Upstash-Forward-X-Notify-Secret': process.env.NOTIFY_SECRET,
      },
      body: JSON.stringify({ subscription, delaySeconds }),
    });

    if (response.ok) {
      const data = await response.json();
      await setTimer(data.messageId, subscription, delaySeconds);
      console.log('Next cycle scheduled:', data.messageId);
    }
  } catch (err) {
    console.error('Re-schedule failed:', err);
  }

  res.status(200).json({ ok: true });
};
