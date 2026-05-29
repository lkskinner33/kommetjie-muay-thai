// netlify/functions/init-dropin.js
// Initialises a one-time R150 Paystack payment for a drop-in class booking.
// The plan code and secret key never reach the browser.
//
// Required Netlify environment variables:
//   PAYSTACK_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY   ← Supabase service role key (NOT the anon key)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { name, email, phone, classId, classDate, className, classTime } = body;
  if (!name || !email || !classId || !classDate) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'name, email, classId and classDate are required' }) };
  }

  const SECRET_KEY    = process.env.PAYSTACK_SECRET_KEY;
  const SUPABASE_URL  = process.env.SUPABASE_URL;
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;

  if (!SECRET_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Payment service not configured' }) };

  try {
    // Insert pending booking into Supabase using service role key (bypasses RLS)
    let bookingId = null;
    if (SUPABASE_URL && SERVICE_KEY) {
      const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/dropin_bookings`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ name, email, phone: phone || null, class_id: classId, class_date: classDate, status: 'pending' })
      });
      const sbData = await sbRes.json();
      if (Array.isArray(sbData) && sbData[0]?.id) bookingId = sbData[0].id;
    }

    // Initialise Paystack transaction — R150 = 15000 cents
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount:   15000,
        currency: 'ZAR',
        metadata: {
          name, phone,
          class_id:   classId,
          class_date: classDate,
          class_name: className,
          class_time: classTime,
          booking_id: bookingId,
          type:       'dropin',
          custom_fields: [
            { display_name: 'Guest Name',  variable_name: 'name',       value: name },
            { display_name: 'Class',       variable_name: 'class_name', value: className },
            { display_name: 'Class Date',  variable_name: 'class_date', value: classDate }
          ]
        },
        callback_url: 'https://www.kommetjiemuaythai.co.za/dropin-success.html'
      })
    });

    const data = await response.json();
    if (!data.status) return { statusCode: 502, headers, body: JSON.stringify({ error: data.message || 'Payment init failed' }) };

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ authorization_url: data.data.authorization_url, reference: data.data.reference, bookingId })
    };

  } catch (err) {
    console.error('init-dropin error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Unexpected error. Please try again.' }) };
  }
};
