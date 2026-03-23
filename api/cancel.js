// Cancels a scheduled QStash message (called when user stops the timer).
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Missing messageId' });

  try {
    await fetch(`https://qstash.upstash.io/v2/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` },
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    // If cancel fails (message already delivered), that's fine
    res.status(200).json({ ok: true, note: 'cancel attempted' });
  }
};
