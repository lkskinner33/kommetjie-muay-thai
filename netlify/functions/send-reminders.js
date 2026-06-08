// netlify/functions/send-reminders.js
// Scheduled function — runs daily at 5:00 AM SAST (3:00 AM UTC)
// Netlify schedule: "0 3 * * *"
 
const webpush = require('web-push');
 
webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
 
exports.handler = async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
 
  async function supabase(method, path, body) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }
 
  try {
    // Get today's date in SAST (UTC+2)
    const now   = new Date();
    const sast  = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const today = sast.toISOString().split('T')[0];
 
    // Get all confirmed bookings for today with class and user details
    const bookings = await supabase('GET',
      `bookings?class_date=eq.${today}&status=eq.confirmed&select=user_id,classes(name,start_time)`
    );
 
    if (!Array.isArray(bookings) || bookings.length === 0) {
      console.log('No bookings today:', today);
      return { statusCode: 200, body: 'No bookings today' };
    }
 
    // Get unique user IDs
    const userIds = [...new Set(bookings.map(b => b.user_id))];
 
    // Get push subscriptions for these users
    const subs = await supabase('GET',
      `push_subscriptions?user_id=in.(${userIds.join(',')})&select=*`
    );
 
    if (!Array.isArray(subs) || subs.length === 0) {
      console.log('No push subscriptions found');
      return { statusCode: 200, body: 'No subscriptions' };
    }
 
    let sent = 0;
    let failed = 0;
 
    for (const sub of subs) {
      // Find bookings for this user
      const userBookings = bookings.filter(b => b.user_id === sub.user_id);
      if (!userBookings.length) continue;
 
      // Build notification message
      const classes = userBookings.map(b => {
        const h  = parseInt(b.classes.start_time.split(':')[0]);
        const m  = b.classes.start_time.split(':')[1];
        const ap = h < 12 ? 'AM' : 'PM';
        const hr = h > 12 ? h - 12 : h || 12;
        return `${b.classes.name} at ${hr}:${m} ${ap}`;
      }).join(' & ');
 
      const payload = JSON.stringify({
        title: 'Class Reminder 🥊',
        body:  `You're booked for ${classes} today. See you on the mats!`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        url:   '/dashboard.html'
      });
 
      try {
        const subscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth:   sub.auth
          }
        };
        await webpush.sendNotification(subscription, payload);
        sent++;
      } catch (err) {
        console.error('Push failed for user:', sub.user_id, err.statusCode);
        // Remove invalid subscriptions (410 = subscription expired)
        if (err.statusCode === 410) {
          await supabase('DELETE', `push_subscriptions?id=eq.${sub.id}`);
        }
        failed++;
      }
    }
 
    console.log(`Reminders sent: ${sent}, failed: ${failed}`);
    return { statusCode: 200, body: `Sent: ${sent}, Failed: ${failed}` };
 
  } catch (err) {
    console.error('send-reminders error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
 
// Netlify scheduled function config
module.exports.config = {
  schedule: '0 3 * * *' // 5:00 AM SAST daily
};