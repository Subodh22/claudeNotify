// Run once: node generate-keys.js
// Copy the output into your Vercel environment variables.
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('\nAdd these to Vercel Environment Variables:\n');
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('\nAlso add:');
console.log('VAPID_SUBJECT=mailto:you@example.com');
console.log('NOTIFY_SECRET=' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
console.log('QSTASH_TOKEN=<from upstash.com/qstash>');
console.log('APP_URL=https://your-app.vercel.app\n');
