-- ============================================================
-- Fix: 90-minute class slots
--
-- Every weekly class row was saved with an end_time computed under the old,
-- wrong 75-minute assumption. This corrects existing rows to match; it does
-- not touch session_date rows (dated block courses), which already carry
-- explicit, correct end times per session.
-- ============================================================

update classes
set end_time = case
  when start_time = time '08:30' then time '10:00'
  when start_time = time '10:15' then time '11:45'
  when start_time = time '12:00' then time '13:30'
  when start_time = time '14:30' then time '16:00'
  when start_time = time '16:15' then time '17:45'
  when start_time = time '18:00' then time '19:30'
  else end_time  -- leave anything off the standard grid untouched
end
where session_date is null;  -- weekly courses only; dated ones are already correct

-- Verify — every weekly row's duration should now read 90 minutes.
select start_time, end_time,
       extract(epoch from (end_time - start_time)) / 60 as duration_minutes,
       count(*) as rows
from classes
where session_date is null
group by start_time, end_time
order by start_time;
