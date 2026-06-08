// netlify/functions/save-subscription.js
// Called by the frontend when a user grants push notification permission.
 
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
 
  const { subscription, user_id } = JSON.parse(event.body || '{}');
 
  if (!subscription || !user_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing subscription or user_id' }) };
  }
 
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
 
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: {
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id,
        endpoint: subscription.endpoint,
        p256dh:   subscription.keys.p256dh,
        auth:     subscription.keys.auth
      })
    });
 
    if (!res.ok) {
      const err = await res.text();
      return { statusCode: 500, body: JSON.stringify({ error: err }) };
    }
 
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
 
  } catch (err) {
    console.error('save-subscription error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
  }
};