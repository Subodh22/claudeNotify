// Called by QStash after the delay. Sends a Web Push notification.
const webpush = require('web-push');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  // Verify secret forwarded by QStash as a header
  if (req.headers['x-notify-secret'] !== process.env.NOTIFY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ error: 'Missing subscription' });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const payload = JSON.stringify({
    title: 'Claude is ready! 🚀',
    body: 'Your usage limit has reset. Go build something.',
    icon: '/icon.svg',
    tag: 'claude-reset',
  });

  try {
    await webpush.sendNotification(subscription, payload);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired — not an error for us
      return res.status(200).json({ ok: true, note: 'subscription gone' });
    }
    console.error('Push error:', err);
    res.status(500).json({ error: 'Failed to send push' });
  }
};
