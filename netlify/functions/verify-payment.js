// netlify/functions/verify-payment.js
// Called by the frontend after Paystack inline checkout closes.
// Verifies the transaction server-side, then updates Supabase.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { reference } = JSON.parse(event.body || '{}');
  if (!reference) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing reference' }) };
  }

  const secretKey   = process.env.PAYSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  // Helper to call Supabase REST API
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
    // 1. Verify with Paystack
    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    const psData = await psRes.json();

    if (!psData.status || psData.data?.status !== 'success') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Payment not successful', detail: psData.message })
      };
    }

    const tx          = psData.data;
    const email       = tx.customer?.email?.toLowerCase();
    const amount      = tx.amount;
    const meta        = tx.metadata || {};
    const paymentType = meta.payment_type || 'monthly';
    const classId     = meta.class_id   || null;
    const classDate   = meta.class_date || null;

    // 2. Find user profile
    const profiles = await supabase('GET', `profiles?email=eq.${encodeURIComponent(email)}&select=id`);
    const profile  = Array.isArray(profiles) ? profiles[0] : null;

    if (!profile) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Profile not found' }) };
    }

    // 3. Check payment not already processed
    const existing = await supabase('GET', `payments?paystack_ref=eq.${reference}&select=id,status`);
    if (Array.isArray(existing) && existing.length > 0 && existing[0].status === 'success') {
      return { statusCode: 200, body: JSON.stringify({ ok: true, already: true }) };
    }

    // 4. Log payment
    await supabase('POST', 'payments', {
      user_id:       profile.id,
      email,
      amount,
      payment_type:  paymentType,
      paystack_ref:  reference,
      paystack_event: 'charge.success',
      status:        'success',
      class_id:      classId,
      class_date:    classDate
    });

    // 5. Update profile / create booking
    if (paymentType === 'monthly') {
      const expires = new Date();
      expires.setMonth(expires.getMonth() + 1);
      await supabase('PATCH', `profiles?id=eq.${profile.id}`, {
        membership_type:    'monthly',
        membership_status:  'active',
        customer_code:      tx.customer?.customer_code || null,
        membership_expires: expires.toISOString().split('T')[0],
        active:             true
      });
    } else if (paymentType === 'dropin' && classId && classDate) {
      // Upsert booking
      await supabase('POST', 'bookings', {
        user_id:    profile.id,
        class_id:   classId,
        class_date: classDate,
        status:     'confirmed'
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, payment_type: paymentType })
    };

  } catch (err) {
    console.error('verify-payment error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
