// config.js
// PAYSTACK_PLAN_CODE and PAYSTACK_SECRET_KEY are intentionally absent.
// They live only in Netlify environment variables and are used exclusively
// by server-side functions in netlify/functions/.
//
// Set in Netlify → Project configuration → Environment variables:
//   SUPABASE_URL
//   SUPABASE_KEY
//   PAYSTACK_PUBLIC_KEY
//   PAYSTACK_PLAN_CODE      ← server-side only, never sent to browser
//   PAYSTACK_SECRET_KEY     ← server-side only, never sent to browser

const SUPABASE_URL        = '';
const SUPABASE_KEY        = '';
const PAYSTACK_PUBLIC_KEY = '';
const PAYSTACK_PLAN_CODE = '';
