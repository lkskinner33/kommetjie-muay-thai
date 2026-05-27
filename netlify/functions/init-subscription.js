// netlify/functions/init-subscription.js
// Initializes a Paystack subscription server-side so that
// PAYSTACK_PLAN_CODE and PAYSTACK_SECRET_KEY never reach the browser.
//
// Required Netlify environment variables (set in Project configuration → Environment variables):
//   PAYSTACK_SECRET_KEY   — your Paystack secret key (sk_live_... or sk_test_...)
//   PAYSTACK_PLAN_CODE    — your subscription plan code (PLN_...)

exports.handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // CORS headers so the browser can call this from kommetjiemuaythai.co.za
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, name, userId } = body;

  if (!email || !name || !userId) {
    return {
      statusCode: 400, headers,
      body: JSON.stringify({ error: 'email, name and userId are required' })
    };
  }

  const SECRET_KEY  = process.env.PAYSTACK_SECRET_KEY;
  const PLAN_CODE   = process.env.PAYSTACK_PLAN_CODE;

  if (!SECRET_KEY || !PLAN_CODE) {
    console.error('Missing PAYSTACK_SECRET_KEY or PAYSTACK_PLAN_CODE environment variables');
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Payment service is not configured. Please contact the admin.' })
    };
  }

  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SECRET_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        email,
        // R250 in cents (Paystack uses smallest currency unit — ZAR cents)
        amount:    25000,
        plan:      PLAN_CODE,
        currency:  'ZAR',
        metadata: {
          name,
          user_id:    userId,
          gym:        'Kommetjie Muay Thai',
          custom_fields: [
            { display_name: 'Member Name', variable_name: 'name',    value: name },
            { display_name: 'User ID',     variable_name: 'user_id', value: userId }
          ]
        },
        callback_url: 'https://www.kommetjiemuaythai.co.za/payment-success.html'
      })
    });

    const data = await response.json();

    if (!data.status) {
      console.error('Paystack error:', data);
      return {
        statusCode: 502, headers,
        body: JSON.stringify({ error: data.message || 'Payment initialisation failed' })
      };
    }

    // Return only what the browser needs — no keys, no plan code
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        authorization_url: data.data.authorization_url,
        reference:         data.data.reference
      })
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Unexpected error. Please try again.' })
    };
  }
};
