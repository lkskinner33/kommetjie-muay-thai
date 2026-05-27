# Kommetjie Muay Thai — Web App Setup Guide

## Files in this package

| File | Purpose |
|---|---|
| `schema.sql` | Run once in Supabase SQL Editor |
| `config.js` | Paste your Supabase credentials here |
| `app.js` | Shared utilities (do not edit) |
| `style.css` | Design system (do not edit) |
| `logo.png` | **Add your logo file here** |
| `index.html` | Public homepage |
| `register.html` | New member registration + indemnity |
| `login.html` | OTP login |
| `dashboard.html` | Member class booking |
| `admin.html` | Admin panel |

---

## Step 1 — Supabase: Run the schema

1. Log into [supabase.com](https://supabase.com) and open your project
2. In the left menu: **SQL Editor**
3. Paste the entire contents of `schema.sql` and click **Run**

---

## Step 2 — Supabase: Enable Email OTP

1. In Supabase: **Authentication → Providers → Email**
2. Make sure **Enable Email OTP** is turned **ON**
3. Set **OTP Expiry** to `3600` (1 hour) if not already set

---

## Step 3 — Add your credentials to config.js

Open `config.js` and replace the placeholders:

```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'your-anon-public-key-here';
```

Find these in Supabase: **Project Settings → API**

---

## Step 4 — Add your logo

Rename your logo image to `logo.png` and place it in this folder alongside the HTML files.

---

## Step 5 — Deploy to Netlify

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Select **all files in this folder** and drag them onto the page
   *(make sure you drag the files, not the folder itself)*
3. Netlify gives you a live link immediately

---

## Step 6 — Make yourself admin

After you sign up through the app for the first time:

1. Go to Supabase → **SQL Editor**
2. Run this (replace with your actual email):

```sql
update profiles set role = 'admin' where email = 'luke@youremail.com';
```

3. Log out and log back in — you will now see the **Admin** link in the nav

---

## Step 7 — Add your site URL to Supabase (important)

To make OTP login work correctly on Netlify:

1. Supabase → **Authentication → URL Configuration**
2. Add your Netlify URL to **Allowed Redirect URLs**:
   `https://your-site.netlify.app/**`
3. Set **Site URL** to: `https://your-site.netlify.app`

---

## Cancellation Policy (built in)

- **Morning sessions (6 AM):** Members cannot cancel after **10:00 PM the night before**
- **Afternoon sessions (5:30 PM):** Members cannot cancel after **9:00 AM the same day**

---

## Future phases

- **Phase 3 — Paystack payments:** R250/month recurring subscription
- **Phase 4 — WhatsApp reminders:** Booking confirmation + day-before reminder
