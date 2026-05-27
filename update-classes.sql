-- Run this in Supabase SQL Editor to update class names
-- Kommetjie Muay Thai — class schedule update

UPDATE classes SET name = 'Conditioning & Muay Thai'
  WHERE day_of_week = 1 AND start_time = '06:00:00' AND end_time = '07:00:00';

UPDATE classes SET name = 'Strength'
  WHERE day_of_week = 3 AND start_time = '06:00:00' AND end_time = '07:00:00';

UPDATE classes SET name = 'Mobility & Yoga Flow'
  WHERE day_of_week = 5 AND start_time = '06:00:00' AND end_time = '07:00:00';

-- Verify the changes
SELECT day_of_week, start_time, end_time, name, active
FROM classes
ORDER BY day_of_week, start_time;
