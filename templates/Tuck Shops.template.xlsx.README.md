# Tuck Shops — an Info sheet plus one card per shop

Read by: scripts/build_tuck.py    Feeds: the Tuck shops tab



**The Info sheet:**

One row per shop. 'Shop' must match the first word of that shop's menu sheet name. A shop with no phone number is fine — it is a counter you walk to — and the screen simply shows no call button rather than a dead one. Never borrow another shop's number.

Delivers: Yes if the shop brings orders over, otherwise blank. A shop with rows in the Delivery sheet counts as Yes either way.



**The Delivery sheet (optional):**

Shop | Location, one row per place a shop walks to. The places offered in the basket are every location named here, in the order they first appear.



No prices, delivery fees or payment details anywhere in this workbook: they changed faster than anybody re-typed the card. Students read prices off the photographed card and pay the counter.



**The menu sheets:**

Named '<SHOP> Tuck'. Sl No. and Item must be spelled exactly. Diet is optional; see below.

One flat list, no categories — that is how the card on the counter reads, and inventing sections here would be a shape the shop does not have.



**Items, exactly as printed:**

Type each line as the card does, slashes and all — 'Paneer Masala Patty / with cheese' stays one row. SPLITS in build_tuck.py turns the lines that are really several dishes into one item each.



**Sl No.:**

Kept as printed, gaps and all. The card handed over skips 27, 29-31, 33-34 and 42, and renumbering would break the one thing the column is for — matching a row against the card on the counter.



**Diet — optional, and blank today:**

Fill it with veg, egg or non-veg and the Veg only / No meat filter appears on the screen by itself. Leave it blank and every item reads as unconfirmed and is shown to everyone, which is the honest state when nobody has been through the card. Nothing is ever guessed from an item's name.
