module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};
