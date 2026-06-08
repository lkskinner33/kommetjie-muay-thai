// netlify/functions/send_reminders_afternoon.js
// Scheduled function — runs at 4:30 PM SAST (2:30 PM UTC)
// Sends reminders 1 hour before afternoon classes (5:30 PM)
// Testing Deploy
 
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
    const now   = new Date();
    const sast  = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const today = sast.toISOString().split('T')[0];
 
    // Only afternoon classes (start_time >= 12:00)
    const bookings = await supabase('GET',
      `bookings?class_date=eq.${today}&status=eq.confirmed&select=user_id,classes(name,start_time)`
    );
 
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return { statusCode: 200, body: 'No bookings today' };
    }
 
    const filtered = bookings.filter(b => parseInt(b.classes.start_time.split(':')[0]) >= 12);
 
    if (filtered.length === 0) {
      return { statusCode: 200, body: 'No afternoon bookings today' };
    }
 
    const userIds = [...new Set(filtered.map(b => b.user_id))];
    const subs    = await supabase('GET',
      `push_subscriptions?user_id=in.(${userIds.join(',')})&select=*`
    );
 
    if (!Array.isArray(subs) || subs.length === 0) {
      return { statusCode: 200, body: 'No subscriptions' };
    }
 
    let sent = 0, failed = 0;
 
    for (const sub of subs) {
      const userBookings = filtered.filter(b => b.user_id === sub.user_id);
      if (!userBookings.length) continue;
 
      const classes = userBookings.map(b => {
        const h  = parseInt(b.classes.start_time.split(':')[0]);
        const m  = b.classes.start_time.split(':')[1];
        const hr = h > 12 ? h - 12 : h || 12;
        return `${b.classes.name} at ${hr}:${m} PM`;
      }).join(' & ');
 
      const payload = JSON.stringify({
        title: 'Class in 1 Hour 🥊',
        body:  `Get ready! You're booked for ${classes} today.`,
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
        if (err.statusCode === 410) {
          await supabase('DELETE', `push_subscriptions?id=eq.${sub.id}`);
        }
        failed++;
      }
    }
 
    console.log(`Afternoon reminders — sent: ${sent}, failed: ${failed}`);
    return { statusCode: 200, body: `Sent: ${sent}, Failed: ${failed}` };
 
  } catch (err) {
    console.error('send-reminders-afternoon error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
 
// 4:30 PM SAST = 2:30 PM UTC
module.exports.config = {
  schedule: '30 14 * * *'
};