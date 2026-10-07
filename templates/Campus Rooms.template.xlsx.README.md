# Campus Rooms — how to find a room, for J Maps

Read by: scripts/build_rooms.py    Feeds: J Maps, venue chips, faculty rooms



**Buildings (one row per building):**

Building must be NAB, OAB, CDPO Building or Tata Hall. Google Maps is the link a student opens first — every description starts at the building's door. Room tabs lists the tabs holding its rooms, comma separated. A building with no link, or a tab no building claims, stops the build.



**Room tabs (one row per room):**

Room, Floor (Ground, 1st, 2nd, 3rd or 4th), Name (optional), Description and Status are read by heading; other columns are yours. Only Status 'Confirmed' ships. 'No description (final)' leaves a room out on purpose. Any other status with a description is an unfinished draft and stops the build, so a draft can never reach the app.

The same room in two tabs, even spelled differently (K-201 and K201), stops the build.



**Rule tabs ('NAB hallways', 'CDPO groups'):**

One row per series and floor, with Covers written as 'K-2xx (any)'. The app gives that description to any room whose letter and first digit match — rooms nobody listed included. The first digit is the floor plus one, and a Covers that disagrees with its Floor stops the build. A listed room inside a rule must say exactly what the rule says, or the build stops: one of them has drifted.



**Other names for a room:**

What the class schedule calls a room ('Amphi (East-150)') is not a row here. It goes in ALIASES in build_rooms.py, which checks each one points at a confirmed room.
