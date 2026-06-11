// netlify/functions/send-reminders-afternoon.js
// Scheduled function — runs at 4:30 PM SAST (2:30 PM UTC)

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
    const sast  = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const today = sast.toISOString().split('T')[0];

    const bookings = await supabase('GET',
      `bookings?class_date=eq.${today}&status=eq.confirmed&select=user_id,classes(name,start_time)`
    );

    if (!Array.isArray(bookings) || bookings.length === 0) {
      console.log('No bookings today:', today);
      return { statusCode: 200, body: 'No bookings today' };
    }

    const filtered = bookings.filter(b => {
      if (!b.classes?.start_time) return false;
      return parseInt(b.classes.start_time.split(':')[0], 10) >= 12;
    });

    if (filtered.length === 0) {
      console.log('No afternoon bookings today');
      return { statusCode: 200, body: 'No afternoon bookings today' };
    }

    const userIds = [...new Set(filtered.map(b => b.user_id))];
    const subs    = await supabase('GET',
      `push_subscriptions?user_id=in.(${userIds.join(',')})&select=*`
    );

    if (!Array.isArray(subs) || subs.length === 0) {
      console.log('No push subscriptions found for these users');
      return { statusCode: 200, body: 'No subscriptions' };
    }

    let sent = 0, failed = 0;

    for (const sub of subs) {
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
        const hr    = h > 12 ? h - 12 : (h === 0 ? 12 : h);
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
        const status = err.statusCode || err.status;
        console.error(`Push failed for user ${sub.user_id}:`, status, err.message);
        if (status === 410 || status === 404) {
          const encoded = encodeURIComponent(sub.endpoint);
          await supabase('DELETE', `push_subscriptions?endpoint=eq.${encoded}`);
          console.log('Removed stale subscriptions for endpoint:', sub.endpoint);
        }
        failed++;
      }
    }

    console.log(`Afternoon reminders — sent: ${sent}, failed: ${failed}`);
    return { statusCode: 200, body: JSON.stringify({ sent, failed }) };

  } catch (err) {
    console.error('send-reminders-afternoon error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};

// 4:30 PM SAST = 2:30 PM UTC
module.exports.config = {
  schedule: '30 14 * * *'
};