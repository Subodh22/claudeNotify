const webpush = require('web-push');
const { kv }  = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  if (req.headers['x-notify-secret'] !== process.env.NOTIFY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { subscription, delaySeconds } = req.body;
  if (!subscription) return res.status(400).json({ error: 'Missing subscription' });

  // Check if the timer was stopped while we were waiting
  const active = await kv.get('active-timer');
  if (!active) {
    console.log('Timer was stopped — skipping notification');
    return res.status(200).json({ ok: true, note: 'stopped' });
  }

  // Send the push notification
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

  // Re-schedule the next cycle automatically
  if (delaySeconds) {
    let appUrl = process.env.APP_URL || process.env.VERCEL_URL || '';
    if (appUrl && !appUrl.startsWith('http')) appUrl = 'https://' + appUrl;
    appUrl = appUrl.replace(/\/$/, '');

    const callbackUrl = `${appUrl}/api/notify`;
    const qstashUrl   = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '');

    try {
      const response = await fetch(`${qstashUrl}/v2/publish/${callbackUrl}`, {
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
        // Update KV with new messageId for the next cycle
        await kv.set('active-timer', { messageId: data.messageId, subscription, delaySeconds });
        console.log('Re-scheduled next cycle, messageId:', data.messageId);
      }
    } catch (err) {
      console.error('Re-schedule failed:', err);
    }
  }

  res.status(200).json({ ok: true });
};
