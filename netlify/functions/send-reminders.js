// netlify/functions/send-reminders.js
// Scheduled function — runs daily at 5:00 AM SAST (3:00 AM UTC)
// Netlify schedule: "0 3 * * *"
 
const webpush = require('web-push');
 
webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
 
async function sendReminders(sessionType) {
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
 
  // Get today's date in SAST (UTC+2)
  const now   = new Date();
  const sast  = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const today = sast.toISOString().split('T')[0];
 
  // Filter by session type: morning = before 12:00, afternoon = 12:00 and after
  const bookings = await supabase('GET',
    `bookings?class_date=eq.${today}&status=eq.confirmed&select=user_id,classes(name,start_time)`
  );
 
  if (!Array.isArray(bookings) || bookings.length === 0) {
    console.log(`No bookings today (${sessionType}):`, today);
    return { sent: 0, failed: 0 };
  }
 
  // Filter to the right session type
  const filtered = bookings.filter(b => {
    const hour = parseInt(b.classes.start_time.split(':')[0]);
    return sessionType === 'morning' ? hour < 12 : hour >= 12;
  });
 
  if (filtered.length === 0) {
    console.log(`No ${sessionType} bookings today`);
    return { sent: 0, failed: 0 };
  }
 
  const userIds = [...new Set(filtered.map(b => b.user_id))];
  const subs    = await supabase('GET',
    `push_subscriptions?user_id=in.(${userIds.join(',')})&select=*`
  );
 
  if (!Array.isArray(subs) || subs.length === 0) {
    console.log('No push subscriptions found');
    return { sent: 0, failed: 0 };
  }
 
  let sent = 0, failed = 0;
 
  for (const sub of subs) {
    const userBookings = filtered.filter(b => b.user_id === sub.user_id);
    if (!userBookings.length) continue;
 
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
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, payload);
      sent++;
    } catch (err) {
      console.error('Push failed for user:', sub.user_id, err.statusCode);
      if (err.statusCode === 410) {
        await supabase('DELETE', `push_subscriptions?id=eq.${sub.id}`);
      }
      failed++;
    }
  }
 
  return { sent, failed };
}
 
// Morning reminder — 5:00 AM SAST (3:00 AM UTC)
exports.handler = async (event) => {
  try {
    // Determine which session to remind based on schedule
    const now      = new Date();
    const utcHour  = now.getUTCHours();
    // 3 AM UTC = morning reminders, 14:30 UTC = afternoon reminders
    const session  = utcHour < 12 ? 'morning' : 'afternoon';
    const result   = await sendReminders(session);
    console.log(`${session} reminders — sent: ${result.sent}, failed: ${result.failed}`);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('send-reminders error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
 
// Two schedules: 5 AM SAST (3 AM UTC) for morning, 4:30 PM SAST (2:30 PM UTC) for afternoon
module.exports.config = {
  schedule: '0 3 * * *'   // Morning: 5:00 AM SAST
};