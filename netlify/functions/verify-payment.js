// netlify/functions/verify-payment.js
// Verifies a Paystack transaction reference server-side after the user
// returns from Paystack checkout. Keeps the secret key off the browser.
//
// Required Netlify environment variable:
//   PAYSTACK_SECRET_KEY

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const reference = event.queryStringParameters?.reference;
  if (!reference) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'reference is required' }) };
  }

  const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!SECRET_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Payment service not configured' }) };
  }

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { 'Authorization': `Bearer ${SECRET_KEY}` }
    });

    const data = await response.json();

    if (!data.status || data.data.status !== 'success') {
      return {
        statusCode: 402, headers,
        body: JSON.stringify({ success: false, message: data.data?.gateway_response || 'Payment not successful' })
      };
    }

    // Return only safe fields — no keys exposed
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        success:   true,
        email:     data.data.customer.email,
        reference: data.data.reference,
        plan:      data.data.plan_object?.name || 'Muay Thai Membership',
        amount:    data.data.amount / 100  // convert cents → rands
      })
    };

  } catch (err) {
    console.error('Verify error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Verification failed' }) };
  }
};
