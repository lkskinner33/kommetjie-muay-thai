// netlify/functions/send-reminders.js
// Two scheduled exports — Netlify runs each independently:
//   Morning:   5:00 AM SAST (03:00 UTC)
//   Afternoon: 4:30 PM SAST (14:30 UTC)

const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function supabaseRequest(method, path, body) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function sendReminders(sessionType) {
  // Today's date in SAST (UTC+2)
  const sast  = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const today = sast.toISOString().split('T')[0];

  // Fetch today's confirmed bookings with class details
  const bookings = await supabaseRequest('GET',
    `bookings?class_date=eq.${today}&status=eq.confirmed&select=user_id,classes(name,start_time)`
  );

  if (!Array.isArray(bookings) || bookings.length === 0) {
    console.log(`No bookings found for ${today}`);
    return { sent: 0, failed: 0 };
  }

  // Filter to morning (before 12:00) or afternoon (12:00+)
  const filtered = bookings.filter(b => {
    if (!b.classes?.start_time) return false;
    const hour = parseInt(b.classes.start_time.split(':')[0], 10);
    return sessionType === 'morning' ? hour < 12 : hour >= 12;
  });

  if (filtered.length === 0) {
    console.log(`No ${sessionType} bookings for ${today}`);
    return { sent: 0, failed: 0 };
  }

  // Fetch push subscriptions for all relevant users in one query
  const userIds = [...new Set(filtered.map(b => b.user_id))];
  const subs    = await supabaseRequest('GET',
    `push_subscriptions?user_id=in.(${userIds.join(',')})&select=*`
  );

  if (!Array.isArray(subs) || subs.length === 0) {
    console.log('No push subscriptions found for these users');
    return { sent: 0, failed: 0 };
  }

  let sent = 0, failed = 0;

  for (const sub of subs) {
    // Skip if subscription is missing required fields
    if (!sub.endpoint || !sub.p256dh || !sub.auth) {
      console.warn('Skipping incomplete subscription for user:', sub.user_id);
      failed++;
      continue;
    }

    const userBookings = filtered.filter(b => b.user_id === sub.user_id);
    if (!userBookings.length) continue;

    const classes = userBookings.map(b => {
      const parts = b.classes.start_time.split(':');
      const h     = parseInt(parts[0], 10);
      const m     = parts[1];
      const ap    = h < 12 ? 'AM' : 'PM';
      const hr    = h > 12 ? h - 12 : (h === 0 ? 12 : h);
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
      const status = err.statusCode || err.status;
      console.error(`Push failed for user ${sub.user_id}:`, status, err.message);
      // 404/410 = endpoint dead — delete ALL subscriptions for this endpoint
      if (status === 410 || status === 404) {
        const encoded = encodeURIComponent(sub.endpoint);
        await supabaseRequest('DELETE', `push_subscriptions?endpoint=eq.${encoded}`);
        console.log('Removed stale subscriptions for endpoint:', sub.endpoint);
      }
      failed++;
    }
  }

  console.log(`${sessionType} reminders — sent: ${sent}, failed: ${failed}`);
  return { sent, failed };
}

// ── Morning handler: 5:00 AM SAST (03:00 UTC) ────────────────────────────────
const morningHandler = async () => {
  try {
    const result = await sendReminders('morning');
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('send-reminders morning error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};

// ── Afternoon handler: 4:30 PM SAST (14:30 UTC) ──────────────────────────────
const afternoonHandler = async () => {
  try {
    const result = await sendReminders('afternoon');
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error('send-reminders afternoon error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};

morningHandler.config   = { schedule: '0 3 * * *'  };  // 05:00 SAST
afternoonHandler.config = { schedule: '30 14 * * *' };  // 16:30 SAST

module.exports          = morningHandler;
module.exports.afternoon = afternoonHandler;