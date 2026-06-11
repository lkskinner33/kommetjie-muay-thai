// netlify/functions/test-notification.js
// ONE-OFF test function — delete after confirming push notifications work
// Trigger: https://your-site/.netlify/functions/test-notification?user_id=YOUR_USER_ID

const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

exports.handler = async (event) => {
  const userId = event.queryStringParameters?.user_id;

  if (!userId) {
    return { statusCode: 400, body: 'Missing user_id query parameter' };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  async function supabase(method, path) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type':  'application/json'
      }
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  const subs = await supabase('GET',
    `push_subscriptions?user_id=eq.${userId}&select=*`
  );

  if (!Array.isArray(subs) || subs.length === 0) {
    return { statusCode: 404, body: 'No subscriptions found for this user' };
  }

  let sent = 0, failed = 0;

  for (const sub of subs) {
    const payload = JSON.stringify({
      title: 'Test Notification 🥊',
      body:  'Push notifications are working!',
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      url:   '/dashboard.html'
    });

    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, payload);
      sent++;
    } catch (err) {
      const status = err.statusCode || err.status;
      console.error('Push failed:', status, err.message);
      failed++;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ sent, failed })
  };
};