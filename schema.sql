-- ============================================================
-- KOMMETJIE MUAY THAI — DATABASE SCHEMA
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- TABLES -------------------------------------------------------

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  phone text,
  date_of_birth date,
  emergency_contact_name text,
  emergency_contact_phone text,
  role text not null default 'member' check (role in ('member', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists indemnity_audit (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete set null,
  email text not null,
  full_name text not null,
  ip_address text,
  user_agent text,
  agreed_at timestamptz not null default now(),
  indemnity_version text not null default '1.0'
);

create table if not exists classes (
  id uuid default gen_random_uuid() primary key,
  name text not null default 'Muay Thai',
  day_of_week integer not null check (day_of_week between 0 and 6), -- 0=Sun, 1=Mon … 6=Sat
  start_time time not null,
  end_time time not null,
  capacity integer not null default 20,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  class_date date not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique(user_id, class_id, class_date)
);

-- ROW LEVEL SECURITY -------------------------------------------

alter table profiles enable row level security;
alter table indemnity_audit enable row level security;
alter table classes enable row level security;
alter table bookings enable row level security;

-- Helper: get current user's role (avoids RLS recursion)
create or replace function get_my_role()
returns text language sql security definer stable as $$
  select role from profiles where id = auth.uid()
$$;

-- Profiles
create policy "profiles_select_own"   on profiles for select using (auth.uid() = id);
create policy "profiles_insert_own"   on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"   on profiles for update using (auth.uid() = id);
create policy "profiles_select_admin" on profiles for select using (get_my_role() = 'admin');
create policy "profiles_update_admin" on profiles for update using (get_my_role() = 'admin');

-- Classes (public read, admin write)
create policy "classes_select_all"  on classes for select using (true);
create policy "classes_all_admin"   on classes for all   using (get_my_role() = 'admin');

-- Bookings
create policy "bookings_own"          on bookings for all    using (auth.uid() = user_id);
create policy "bookings_select_admin" on bookings for select using (get_my_role() = 'admin');
create policy "bookings_update_admin" on bookings for update using (get_my_role() = 'admin');

-- Indemnity audit
create policy "indemnity_insert_own"   on indemnity_audit for insert with check (auth.uid() = user_id);
create policy "indemnity_select_admin" on indemnity_audit for select using (get_my_role() = 'admin');

-- DEFAULT SCHEDULE ---------------------------------------------
-- Mon–Fri 06:00–07:00, Mon+Wed 17:30–18:30

insert into classes (day_of_week, start_time, end_time, name) values
  (1, '06:00', '07:00', 'Conditioning & Muay Thai'),
  (2, '06:00', '07:00', 'Muay Thai'),
  (3, '06:00', '07:00', 'Strength'),
  (4, '06:00', '07:00', 'Muay Thai'),
  (5, '06:00', '07:00', 'Mobility & Yoga Flow'),
  (1, '17:30', '18:30', 'Muay Thai'),
  (3, '17:30', '18:30', 'Muay Thai')
on conflict do nothing;

-- MAKE YOURSELF ADMIN ------------------------------------------
-- After you sign up for the first time, run this with your email:
-- update profiles set role = 'admin' where email = 'your@email.com';

-- ============================================================
-- ADMIN ROLE PROTECTION
-- Prevents any client-side code from downgrading an admin to
-- a member. Role can only be changed via the Supabase dashboard
-- or the admin panel's grant/revoke functions (which use the
-- service role key server-side in future).
-- ============================================================

create or replace function protect_admin_role()
returns trigger language plpgsql security definer as $$
begin
  -- If the existing role is 'admin', never allow it to be overwritten
  -- with 'member' from a client-side upsert
  if old.role = 'admin' and new.role = 'member' then
    new.role := 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_admin_role_trigger on profiles;
create trigger protect_admin_role_trigger
  before update on profiles
  for each row execute function protect_admin_role();

-- Run this to restore your admin access:
-- update profiles set role = 'admin' where email = 'lkskinner33@gmail.com';
