-- ============================================================
-- One-shot: PGP1 Transformative Digital Technologies, Tuesday slots moved.
--
-- The institute's reissued post-mid sheet (Class Schedule _Term-II (Post-Mid
-- Term)_2026-2027_63rd_Batch.xlsx, in rollcall-resources) moves three Tuesday
-- TDT meetings and nothing else:
--
--     D  L-32   08:30 -> 12:00
--     E  N-31   14:30 -> 08:30
--     F  N-32   12:00 -> 14:30
--
-- catalogue-pgp1.json carries the new times, but that only reaches a student
-- who re-saves their timetable - and saveTimetable keys a row on weekday,
-- start time and subject, so a re-save would delete the old row and insert a
-- new one rather than move it. The alert sweep reads the saved rows, so until
-- this runs D, E and F keep getting TDT alerts at the old Tuesday time.
--
-- Rows are moved in place, keeping `id`, so overrides and attendance keyed to
-- the class survive. Attendance is also keyed by start_time, so marks already
-- made at the old slot (post-mid started 2026-11-02; 3 Nov is the only Tuesday
-- so far) move with it - otherwise the mark is orphaned and the app asks for
-- the class again at the new time. A mark that would collide with one already
-- at the new time is left where it is; STEP 1 lists any.
--
-- Run it AFTER publishing the rebuilt PGP1 catalogue from the admin screen:
-- a student who re-saves against the old published catalogue would put the
-- old time back. Safe to run more than once - a moved row no longer matches.
--
-- Run STEP 1 and read it. Run STEP 2 when it looks right.
-- ============================================================


-- ---------- STEP 1: what would move (changes nothing) ----------
with moves (section, old_start, new_start, new_end) as (
  values ('D', time '08:30', time '12:00', time '13:30'),
         ('E', time '14:30', time '08:30', time '10:00'),
         ('F', time '12:00', time '14:30', time '16:00')
), stale as (
  select c.id, c.user_id, c.subject, m.*
    from classes c
    join moves m on m.section = c.section and m.old_start = c.start_time
   where c.course_code = 'MI-130' and c.day_of_week = 2 and c.session_date is null
)
select r.section, r.old_start, r.new_start,
       count(distinct r.id)                                    as class_rows,
       count(a.id)                                             as marks_to_move,
       count(a.id) filter (where clash.id is not null)         as marks_blocked
  from stale r
  left join attendance a
         on a.user_id = r.user_id and a.subject = r.subject
        and a.start_time = r.old_start and a.class_date >= date '2026-11-02'
        and extract(isodow from a.class_date) = 2
  left join attendance clash
         on clash.user_id = a.user_id and clash.subject = a.subject
        and clash.class_date = a.class_date and clash.start_time = r.new_start
 group by r.section, r.old_start, r.new_start
 order by r.section;


-- ---------- STEP 2: move them ----------
-- One statement: both updates read the same snapshot, so the attendance half
-- still finds each student's class at its old time.
with moves (section, old_start, new_start, new_end) as (
  values ('D', time '08:30', time '12:00', time '13:30'),
         ('E', time '14:30', time '08:30', time '10:00'),
         ('F', time '12:00', time '14:30', time '16:00')
), stale as (
  select c.id, c.user_id, c.subject, m.*
    from classes c
    join moves m on m.section = c.section and m.old_start = c.start_time
   where c.course_code = 'MI-130' and c.day_of_week = 2 and c.session_date is null
), moved_marks as (
  update attendance a
     set start_time = r.new_start
    from stale r
   where a.user_id = r.user_id and a.subject = r.subject
     and a.start_time = r.old_start and a.class_date >= date '2026-11-02'
     and extract(isodow from a.class_date) = 2
     and not exists (
       select 1 from attendance clash
        where clash.user_id = a.user_id and clash.subject = a.subject
          and clash.class_date = a.class_date and clash.start_time = r.new_start)
  returning a.id
), moved_classes as (
  update classes c
     set start_time = r.new_start, end_time = r.new_end
    from stale r
   where c.id = r.id
  returning c.id
)
select (select count(*) from moved_classes) as class_rows_moved,
       (select count(*) from moved_marks)   as marks_moved;
