# Night Mess Menu — an Info sheet plus one menu sheet per canteen

Read by: scripts/build_night_menu.py    Feeds: the Night canteen tab



**The Info sheet:**

One row per canteen. 'Hostel' must match the first word of that canteen's menu sheet name. Column headings are matched loosely, so 'Phone number' still counts as 'Phone'.

Phone: ten digits. Two numbers may be written as '9876543210 / 9123456780' — the app calls and messages the FIRST one, so put the ordering line first.

Every canteen needs its own number. Two canteens sharing one is caught by the test suite, because the screen looks perfectly right while orders walk to the wrong hostel.

Room service (Rs): the flat delivery charge. Leave blank for none.



**The menu sheets:**

Named '<HOSTEL> Night Menu'. The four column headings — Category, Item, Price, Diet — must be spelled exactly. Renaming one stops the build and prints the header it actually read.



**Diet — only these three words:**

veg        no meat, no egg

egg        contains egg but no meat

non-veg    contains meat or fish

Anything else, including a blank, is carried through as 'unconfirmed'. Those items are shown under EVERY filter and marked with a hollow dot, and the build lists them at the end so they can be chased. Nothing is ever assumed vegetarian.



**Price:**

A whole number. A dish sold in two sizes may be written '22/25'; the basket adds up using the first figure.



**Categories:**

Keep each category's rows together. The app builds its sections in the order categories first appear, so a category split across two blocks becomes two sections with the same name.



**The photographed menu (optional, but do send it):**

Photograph the menu on the wall and send the images alongside. They go in public/menu/night/ named <hostel>-1.jpg, <hostel>-2.jpg and so on — lowercase. The app discovers them from the folder, so no spreadsheet change is needed. A canteen with no photos simply shows no 'See Original Menu' button.
