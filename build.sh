#!/bin/bash
# build.sh — injects Netlify environment variables into config.js
# PAYSTACK_PLAN_CODE and PAYSTACK_SECRET_KEY are intentionally excluded —
# they are used only by server-side Netlify Functions.

cat > config.js << CONF
const SUPABASE_URL        = '${SUPABASE_URL}';
const SUPABASE_KEY        = '${SUPABASE_KEY}';
const PAYSTACK_PUBLIC_KEY = '${PAYSTACK_PUBLIC_KEY}';
CONF

echo "✓ config.js written (plan code and secret key kept server-side)"
