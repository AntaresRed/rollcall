# UPI app logos

Three files, referenced by `src/lib/upiapps.js` and shown in the "choose a UPI
app" picker on the tuck shop basket:

    gpay.png      Google Pay
    phonepe.png   PhonePe
    paytm.png     Paytm

Square, ideally 128×128 or larger — they are drawn at 22px and want to stay
crisp on a dense screen. PNG with transparency where the mark has it.

**These are absent by design until the real files are added.** The picker
hides an image that fails to load and falls back to the app's name, so a
missing file costs a logo and nothing else. They are other companies' marks:
drawing approximations of them would be worse than showing none.
