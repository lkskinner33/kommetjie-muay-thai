#!/bin/bash
# build.sh — injects Netlify environment variables into config.js
# PAYSTACK_SECRET_KEY is intentionally excluded — server-side only.
npm install
cat > config.js << CONF
const SUPABASE_URL        = '${SUPABASE_URL}';
const SUPABASE_KEY        = '${SUPABASE_KEY}';
const PAYSTACK_PUBLIC_KEY = '${PAYSTACK_PUBLIC_KEY}';
const PAYSTACK_PLAN_CODE  = '${PAYSTACK_PLAN_CODE}';
CONF
echo "✓ config.js written"
