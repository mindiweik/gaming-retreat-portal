-- Correct the 2027 retreat from June 10–14 to June 9–13 while preserving
-- existing day IDs and all attached setup data. Stored game/block timestamps
-- move by the same interval, so their Las Vegas local clock times stay intact.
WITH target_retreat AS (
  SELECT id
  FROM retreats
  WHERE name = 'Gaming Retreat 2027'
), shifted_days AS (
  SELECT id
  FROM days
  WHERE retreat_id IN (SELECT id FROM target_retreat)
)
UPDATE games
SET start_time = start_time - INTERVAL '1 day',
    end_time = end_time - INTERVAL '1 day',
    updated_at = now()
WHERE day_id IN (SELECT id FROM shifted_days);
--> statement-breakpoint
WITH target_retreat AS (
  SELECT id
  FROM retreats
  WHERE name = 'Gaming Retreat 2027'
), shifted_days AS (
  SELECT id
  FROM days
  WHERE retreat_id IN (SELECT id FROM target_retreat)
)
UPDATE calendar_blocks
SET start_time = start_time - INTERVAL '1 day',
    end_time = end_time - INTERVAL '1 day',
    updated_at = now()
WHERE day_id IN (SELECT id FROM shifted_days);
--> statement-breakpoint
WITH target_retreat AS (
  SELECT id
  FROM retreats
  WHERE name = 'Gaming Retreat 2027'
)
UPDATE days
SET date = date - 100,
    label = CASE date
      WHEN DATE '2027-06-10' THEN 'Bookend - Wednesday'
      WHEN DATE '2027-06-11' THEN 'Day 1 - Thursday'
      WHEN DATE '2027-06-12' THEN 'Day 2 - Friday'
      WHEN DATE '2027-06-13' THEN 'Day 3 - Saturday'
      WHEN DATE '2027-06-14' THEN 'Bookend - Sunday'
      ELSE label
    END,
    is_core_day = CASE date
      WHEN DATE '2027-06-10' THEN false
      WHEN DATE '2027-06-11' THEN true
      WHEN DATE '2027-06-12' THEN true
      WHEN DATE '2027-06-13' THEN true
      WHEN DATE '2027-06-14' THEN false
      ELSE is_core_day
    END,
    updated_at = now()
WHERE retreat_id IN (SELECT id FROM target_retreat)
  AND date BETWEEN DATE '2027-06-10' AND DATE '2027-06-14';
--> statement-breakpoint
WITH target_retreat AS (
  SELECT id
  FROM retreats
  WHERE name = 'Gaming Retreat 2027'
)
UPDATE days
SET date = date + 99,
    updated_at = now()
WHERE retreat_id IN (SELECT id FROM target_retreat)
  AND date BETWEEN DATE '2027-03-02' AND DATE '2027-03-06';
--> statement-breakpoint
UPDATE retreats
SET start_date = DATE '2027-06-09',
    end_date = DATE '2027-06-13',
    timezone = 'America/Los_Angeles',
    updated_at = now()
WHERE name = 'Gaming Retreat 2027';
