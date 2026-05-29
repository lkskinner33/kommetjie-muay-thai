// netlify/functions/verify-dropin.js
// Verifies a Paystack drop-in payment and marks the booking as confirmed.
//
// Required Netlify environment variables:
//   PAYSTACK_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const reference = event.queryStringParameters?.reference;
  if (!reference) return { statusCode: 400, headers, body: JSON.stringify({ error: 'reference is required' }) };

  const SECRET_KEY  = process.env.PAYSTACK_SECRET_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

  if (!SECRET_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Payment service not configured' }) };

  try {
    // Verify with Paystack
    const res  = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { 'Authorization': `Bearer ${SECRET_KEY}` }
    });
    const data = await res.json();

    if (!data.status || data.data.status !== 'success') {
      return { statusCode: 402, headers, body: JSON.stringify({ success: false, message: data.data?.gateway_response || 'Payment not successful' }) };
    }

    const meta      = data.data.metadata || {};
    const bookingId = meta.booking_id;

    // Confirm the booking in Supabase
    if (SUPABASE_URL && SERVICE_KEY && bookingId) {
      await fetch(`${SUPABASE_URL}/rest/v1/dropin_bookings?id=eq.${bookingId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'confirmed', payment_reference: reference })
      });
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success:    true,
        name:       meta.name,
        email:      data.data.customer.email,
        className:  meta.class_name,
        classDate:  meta.class_date,
        classTime:  meta.class_time,
        reference,
        amount:     data.data.amount / 100
      })
    };

  } catch (err) {
    console.error('verify-dropin error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Verification failed' }) };
  }
};
