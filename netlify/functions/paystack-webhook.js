// netlify/functions/paystack-webhook.js
// Receives events from Paystack and updates Supabase accordingly.
// Set these in Netlify → Environment Variables:
//   PAYSTACK_SECRET_KEY   — sk_live_...
//   SUPABASE_URL          — https://xxx.supabase.co
//   SUPABASE_SERVICE_KEY  — your Supabase service_role key (NOT the anon key)

const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // 1. Verify signature
  const secret    = process.env.PAYSTACK_SECRET_KEY;
  const hash      = crypto.createHmac('sha512', secret)
                          .update(event.body)
                          .digest('hex');
  const signature = event.headers['x-paystack-signature'];

  if (hash !== signature) {
    console.error('Invalid Paystack signature');
    return { statusCode: 401, body: 'Invalid signature' };
  }

  const payload = JSON.parse(event.body);
  const type    = payload.event;
  const data    = payload.data;

  console.log('Paystack event:', type, data?.reference || data?.subscription_code);

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
    if (type === 'charge.success') {
      const ref         = data.reference;
      const email       = data.customer?.email?.toLowerCase();
      const amount      = data.amount;
      const meta        = data.metadata || {};
      const paymentType = meta.payment_type || 'monthly';
      const classId     = meta.class_id   || null;
      const classDate   = meta.class_date || null;

      // Find user
      const profiles = await supabase('GET', `profiles?email=eq.${encodeURIComponent(email)}&select=id,membership_status`);
      const profile  = Array.isArray(profiles) ? profiles[0] : null;

      // Log payment
      await supabase('POST', 'payments', {
        user_id:       profile?.id || null,
        email,
        amount,
        payment_type:  paymentType,
        paystack_ref:  ref,
        paystack_event: type,
        status:        'success',
        class_id:      classId,
        class_date:    classDate
      });

      if (profile?.id) {
        if (paymentType === 'monthly') {
          // Calculate expiry — 1 month from now
          const expires = new Date();
          expires.setMonth(expires.getMonth() + 1);

          await supabase('PATCH', `profiles?id=eq.${profile.id}`, {
            membership_type:    'monthly',
            membership_status:  'active',
            subscription_code:  data.subscription_code || null,
            customer_code:      data.customer?.customer_code || null,
            membership_expires: expires.toISOString().split('T')[0],
            active:             true
          });
        } else if (paymentType === 'dropin') {
          // For drop-ins, just confirm the booking
          if (classId && classDate) {
            await supabase('POST', 'bookings', {
              user_id:    profile.id,
              class_id:   classId,
              class_date: classDate,
              status:     'confirmed'
            });
          }
        }
      }
    }

    else if (type === 'subscription.disable' || type === 'subscription.not_renew') {
      const subCode = data.subscription_code;
      await supabase('PATCH', `profiles?subscription_code=eq.${subCode}`, {
        membership_status: 'cancelled'
      });
    }

    else if (type === 'invoice.payment_failed') {
      const subCode = data.subscription?.subscription_code;
      if (subCode) {
        await supabase('PATCH', `profiles?subscription_code=eq.${subCode}`, {
          membership_status: 'expired'
        });
      }
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
