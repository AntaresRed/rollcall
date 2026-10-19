import { KINDS, MSG, MAX_MEAL, MAX_TIMING, KEEP_VERSIONS, datasetTitle } from "../lib/datasets";

/** Whoever a POR should go to when the guide runs out. One place to change.
 *  The number is a link because the guide is read on a phone: one tap rings. */
const CONTACT = (
  <>the IIMPresent maintainer, Anuj Kapse (<a href="tel:+918830156905">88301 56905</a>)</>
);

/** A message exactly as the screen shows it, so it can be recognised. */
const Q = ({ children }) => <span className="por-quote">{children}</span>;

/** One "what do I do if…" entry: closed until asked, so the list scans. */
function Faq({ q, children }) {
  return (
    <details className="por-faq">
      <summary>{q}</summary>
      <div className="por-faq-a">{children}</div>
    </details>
  );
}

/**
 * The POR dashboard's guide, step by step, with what to do in each situation
 * a POR is likely to meet.
 *
 * Written for someone who has never seen the app, on a phone, possibly while
 * the mess board is being rewritten in front of them. Every message the
 * dashboard can show is quoted from MSG in lib/datasets.js, so the words here
 * are the words on screen. Sections for a dataset only appear to an account
 * that looks after one.
 */
export default function PorHelp({ email = "", kinds = [], onBack }) {
  const has = (k) => kinds.includes(k);
  const comingSoon = kinds.filter((k) => !KINDS[k]?.ready);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "the IIMPresent link";
  const example = email || "nhmessrep@email.iimcal.ac.in";

  return (
    <div className="por-help">
      <div className="eyebrow">How to use the POR dashboard</div>

      <section className="por-block">
        <h3 className="por-h">Three things to know first</h3>
        <ol className="por-steps">
          <li>
            <strong>What you publish reaches every student straight away.</strong> Nobody
            checks it in between. Read it once before you press Publish.
          </li>
          <li>
            <strong>The last {KEEP_VERSIONS} versions are kept.</strong> Each one is in History
            and can be put back with one tap, so a mistake costs a minute, not a week. Anything
            older than the last {KEEP_VERSIONS} is removed automatically.
          </li>
          <li>
            <strong>Your whole team shares one account.</strong> If two of you edit at once,
            the dashboard warns whoever publishes second. Agree among yourselves who
            updates what, and when.
          </li>
        </ol>
      </section>

      <section className="por-block">
        <h3 className="por-h">Quick start</h3>
        <ol className="por-steps">
          <li>Open <strong>{appUrl}</strong> and sign in with Google using your POR role account
            ({example}), <em>not</em> your personal one.</li>
          <li>You land on this dashboard. Tap the item you want to update.</li>
          <li>Change only what has changed. Everything else is already filled in.</li>
          <li>Scroll to the bottom and press <Q>{MSG.publish}</Q>, then <strong>OK</strong>.</li>
          <li>You see <Q>{MSG.published}</Q>. That's it.</li>
        </ol>
      </section>

      <section className="por-block">
        <h3 className="por-h">Signing in, step by step</h3>
        <ol className="por-steps">
          <li>Open <strong>{appUrl}</strong> on your phone or laptop. It is the same link
            students use. A laptop is easier when you're typing out a whole week.</li>
          <li>Press <Q>Continue with Google</Q>.</li>
          <li>Google asks which account to use. Pick the role account. If it isn't listed,
            choose <strong>Use another account</strong> and type the role account's address
            and password.</li>
          <li>You should see <strong>POR dashboard</strong> and <Q>Signed in as {example}</Q>.
            If you see a timetable, a course picker or a message about your batch's schedule
            instead, you're in the wrong account. See <em>Signing in</em> under
            "What do I do if…" below.</li>
          <li>On a shared or public computer, press <strong>Sign out</strong> at the bottom of
            the dashboard when you're done.</li>
        </ol>
        <p className="por-hint">
          Optional: on your phone, add IIMPresent to your home screen (Share → Add to Home
          Screen on iPhone, or the browser menu → Install app on Android) so it opens like
          an app next time.
        </p>
      </section>

      <section className="por-block">
        <h3 className="por-h">What the dashboard shows</h3>
        <p className="por-p">One card for each thing your account looks after. Under each title:</p>
        <ul className="por-list">
          <li><Q>{MSG.bundled}</Q>: nobody has published it from the dashboard yet, so
            students see the version the app was built with.</li>
          <li><Q>{MSG.live} 18 Oct, 09:30</Q>: what you published at that time is what
            students see.</li>
          <li><Q>{MSG.comingSoon}</Q>: this item can't be edited here yet. Keep sending
            updates to {CONTACT} the way you did before.</li>
        </ul>
      </section>

      {has("day-mess") && (
        <section className="por-block">
          <h3 className="por-h">Updating the day mess menu, step by step</h3>
          <p className="por-p">
            The menu is <strong>one week, Monday to Sunday, that repeats every week</strong>.
            It has no dates. Students see it starting from today. So "Tuesday lunch" is every
            Tuesday's lunch until someone changes it.
          </p>
          <ol className="por-steps">
            <li>On the dashboard, tap the card for your hostel, e.g.{" "}
              <strong>{datasetTitle("day-mess", "nh")}</strong>.</li>
            <li>The dark box at the top says what students see right now: <Q>The copy built
              into the app</Q> if nobody has published from here, or <Q>Published</Q> with
              the time and the account that did it.</li>
            <li><strong>Timings</strong> (optional): type them the way the mess prints them,
              e.g. <em>8 AM to 10:30 AM</em>. Up to {MAX_TIMING} characters. Leave a meal blank
              and no time is shown for it. Leave all four blank and the timings box disappears
              for students.</li>
            <li><strong>Served every day</strong> (optional): items that come with that meal
              every day, like bread, butter, jam, tea. Students see them once above the week
              instead of repeated seven times. Leave blank if there are none.</li>
            <li><strong>Each day</strong> has four boxes: Breakfast, Lunch, Snacks, Dinner.
              Write the dishes separated by commas, the way the board writes them, e.g.
              <em> Dosa, Sambar, Coconut Chutney, Tea, Coffee</em>. Up to {MAX_MEAL} characters
              per box. You can paste from WhatsApp, Excel or Notes.</li>
            <li>Scroll to the bottom. A <strong>red box</strong> lists things you must fix
              before you can publish. A <strong>yellow box</strong> is only a heads-up: you can
              still publish.</li>
            <li>Press <Q>{MSG.publish}</Q>. The app asks you to confirm: press
              <strong> OK</strong>.</li>
            <li>You see <Q>{MSG.published}</Q>, and a new row marked <strong>LIVE</strong>{" "}
              appears at the top of History.</li>
          </ol>
          <p className="por-hint">
            When students see it: the next time they open IIMPresent. If the app was already
            open in the background, when they come back to it; it checks at most once every
            half hour. Someone with the menu on screen at that moment sees it once they leave
            the menu and open it again.
          </p>
        </section>
      )}

      {has("day-mess") && (
        <section className="por-block">
          <h3 className="por-h">Checking what students see</h3>
          <ol className="por-steps">
            <li>Your role account only ever shows the dashboard, so check from your own student
              account: sign out here, or use another phone or browser.</li>
            <li>Open IIMPresent with your personal account. Tap <strong>Utils</strong>, then
              <strong> Day-Night Mess &amp; Tuck</strong>, then <strong>Day mess</strong>,
              then your hostel.</li>
            <li>Still the old menu? Close the app completely and open it again.</li>
          </ol>
        </section>
      )}

      <section className="por-block">
        <h3 className="por-h">Undoing a mistake</h3>
        <ul className="por-list">
          <li><strong>A typo in something you published:</strong> fix it and publish again.</li>
          <li><strong>You published the wrong thing entirely:</strong> scroll to History, find
            the version that was right, press <strong>Restore</strong>, then <strong>OK</strong>.
            It goes live at once and you see <Q>{MSG.restored}</Q>. The version you replaced
            stays in History too, so you can change your mind again.</li>
          <li><strong>A restore counts as a publish.</strong> It takes one of the{" "}
            {KEEP_VERSIONS} places in History, and the oldest version goes.</li>
          <li><strong>You haven't published, and want to start over:</strong> press
            <strong> Discard changes</strong> at the bottom. The form goes back to what
            students see.</li>
          <li><strong>You want to leave without publishing:</strong> press
            <strong> Back to dashboard</strong>. The app asks first, because unpublished
            changes are lost when you leave.</li>
        </ul>
      </section>

      <div className="eyebrow" style={{ marginTop: 22 }}>What do I do if…</div>

      <h4 className="por-faq-group">Signing in</h4>
      <Faq q="I see a timetable or course picker instead of the dashboard">
        You're signed in with your personal account. Go to <strong>Profile</strong>, press
        <strong> Sign out</strong>, and sign in again with the role account.
      </Faq>
      <Faq q="With the role account, I see a message about my batch's schedule not being there">
        This role account hasn't been added to the dashboard yet. Send {CONTACT} the exact
        address you signed in with. Until it's added, nothing you can do in the app will
        change that.
      </Faq>
      <Faq q={'It says "IIMPresent is open to IIM Calcutta accounts only"'}>
        You picked a non-institute Google account, such as a Gmail. Press <Q>Continue with
        Google</Q> again and choose the <strong>@email.iimcal.ac.in</strong> role account.
      </Faq>
      <Faq q="I don't know the role account's password">
        Ask the previous holder of your position or the Student Council. If it's truly lost,
        the institute's IT helpdesk manages these accounts. IIMPresent can't see or reset
        any password.
      </Faq>
      <Faq q={`It says "${MSG.nothingGranted}"`}>
        The account is set up for the dashboard but has nothing assigned to it. Tell
        {" "}{CONTACT} which account it is and what you look after.
      </Faq>
      <Faq q="I can't see something I'm responsible for">
        Each account only sees what it was given. Tell {CONTACT} what's missing and which
        account you use.
      </Faq>

      {has("day-mess") && (
        <>
          <h4 className="por-faq-group">Changing the menu</h4>
          <Faq q="The whole menu changed (new term, new rotation)">
            Go through the days one by one and replace each box. You don't have to publish
            after each day: publish once at the end, and students get the whole new week
            together. If you need a break halfway, don't leave the page: unpublished changes
            are lost when you leave.
          </Faq>
          <Faq q="Only one meal is different, just this once (a festival, a special dinner)">
            Remember the menu repeats every week. Change that day's box and publish. Then,
            <strong> after the special meal</strong>, put it back: open History and press
            <strong> Restore</strong> on the version just below your special one. Do it before
            anything else is published: after {KEEP_VERSIONS - 1} more publishes, the version
            you need is gone from History. If you forget, students will see the special dinner
            again next week.
          </Faq>
          <Faq q="The mess is closed for a meal or a day (vacation, holiday)">
            Write it in the box, e.g. <em>Mess closed: Puja vacation</em>, rather than
            leaving it empty. An empty box shows students "—", which looks like nobody
            updated the menu. Change it back when the mess reopens, or Restore the older
            version from History.
          </Faq>
          <Faq q="A meal is simply never served on some day (no Sunday snacks)">
            Leave that box empty or write <em>Not served</em>. An empty box gives you a yellow
            note when you publish. That's only a reminder: publishing still works.
          </Faq>
          <Faq q="The timings changed">
            Edit the <strong>Timings</strong> boxes and publish. To remove the timings
            completely, empty all four boxes. To show a time for only some meals, fill just
            those.
          </Faq>
          <Faq q="Should I mark dishes veg or non-veg, or add prices?">
            No. Write the dishes the way the board does. Students see exactly the words you
            type, nothing more.
          </Faq>
          <Faq q="I have the menu as a photo or a spreadsheet">
            Type or paste it in day by day. Sending a photo or file doesn't update the app any
            more: the dashboard is now the only way the day mess menu reaches students.
          </Faq>
          <Faq q="A box is too long">
            Each meal box takes up to {MAX_MEAL} characters and each timing up to {MAX_TIMING}.
            Shorten the list: drop items that are in <strong>Served every day</strong>, or use
            the short names the board uses.
          </Faq>
        </>
      )}

      <h4 className="por-faq-group">Publishing</h4>
      <Faq q={`The button is grey and says "${MSG.noChanges}"`}>
        You haven't changed anything yet, or your changes match exactly what students already
        see. Change something and the button turns on.
      </Faq>
      <Faq q={`There's a red box saying "${MSG.cantPublish}"`}>
        Fix every line it lists. The red box goes away when nothing is left, and the button
        turns on. The most common one is a box that's too long: it says which day and meal,
        and how many characters it has.
      </Faq>
      <Faq q="There's a yellow box about empty meals">
        Some meal boxes are empty, and students will see "—" there. If that's what you mean,
        publish anyway. If not, fill those boxes in.
      </Faq>
      <Faq q={`It says "${MSG.offline}"`}>
        Your internet dropped. Your changes are still on screen. Reconnect and press Publish
        again. Students saw nothing half-done.
      </Faq>
      <Faq q={`It says "${MSG.notAllowed}"`}>
        You're signed in with an account that doesn't look after this. Sign out and sign in
        with the right role account. If it still says this, tell {CONTACT}.
      </Faq>
      <Faq q={`It says "${MSG.rejected} …"`}>
        IIMPresent's server checked your menu and refused it; the rest of the message says
        why. Fix that and publish again. If the reason makes no sense, send a screenshot to
        {" "}{CONTACT}.
      </Faq>
      <Faq q={`It says "${MSG.publishFailed}"`}>
        Something unexpected went wrong. Wait a minute and press Publish again. If it keeps
        happening, send a screenshot to {CONTACT}. Students are still seeing the previous
        version, so nothing is broken for them.
      </Faq>
      <Faq q={`A box pops up saying a newer version ${MSG.conflict}`}>
        Someone else on your team published while you were editing. You have two choices:
        <ul className="por-list">
          <li><strong>OK</strong> publishes yours. It replaces theirs completely, including
            anything they changed that you didn't. Theirs stays in History.</li>
          <li><strong>Cancel</strong> keeps your changes on screen. Look at their version at
            the top of History, talk to them, then publish one agreed version.</li>
        </ul>
        If you're unsure, press Cancel.
      </Faq>
      <Faq q="I pressed Publish by mistake">
        Scroll to History and press <strong>Restore</strong> on the row just below the top
        one. Everything is back as it was.
      </Faq>
      <Faq q="I published, but a student says they still see the old menu">
        They need to close the app completely and open it again. If it's already open on
        their phone, the app checks for changes when they come back to it, at most once every
        half hour.
      </Faq>
      <Faq q="The version I want back isn't in History any more">
        Only the last {KEEP_VERSIONS} versions are kept, and older ones are removed for good.
        Type the menu in again and publish it. To avoid this: before a temporary change (a
        festival, a vacation), take a screenshot of the menu as it is; and finish all your
        edits before publishing once, rather than publishing after each small fix.
      </Faq>
      <Faq q="Could I publish over another hostel's or shop's data by mistake?">
        No. Your account only sees what it looks after, and IIMPresent's server refuses
        anything else even if someone tries.
      </Faq>

      <h4 className="por-faq-group">Working as a team</h4>
      <Faq q="Can I see who changed what?">
        History shows when each version was published and from which account. Everyone on
        the team shares the account, so it can't tell you which person. If that matters to
        your team, keep a note in your group chat when you publish.
      </Faq>
      <Faq q="A new team is taking over">
        Nothing to do in the app: the role account is the key. Hand over the account's
        password, and point the new team to this guide (the{" "}
        <strong>How to use this dashboard</strong> button). Changing the password at
        handover is a good idea.
      </Faq>
      <Faq q="Someone outside the team knows the password">
        Change the role account's password straight away, through the institute's account
        settings. Anyone with the password can publish to every student.
      </Faq>

      {comingSoon.length > 0 && (
        <section className="por-block" style={{ marginTop: 18 }}>
          <h3 className="por-h">Marked "Coming soon"</h3>
          <p className="por-p">
            These can't be edited here yet:{" "}
            {comingSoon.map((k) => KINDS[k]?.label ?? k).join(", ")}. Keep sending updates for
            them to {CONTACT} the way you did before. Each one will turn into a card you can
            tap, with its own steps in this guide.
          </p>
        </section>
      )}

      <section className="por-block" style={{ marginTop: 18 }}>
        <h3 className="por-h">Ground rules</h3>
        <ul className="por-list">
          <li>Publish only what is actually being served. Students plan their day on it.</li>
          <li>Never put phone numbers, names, announcements or links in a menu. Students see
            exactly what you type.</li>
          <li>Keep the role account's password inside your team.</li>
        </ul>
      </section>

      {onBack && (
        <button className="btn block" style={{ marginTop: 18 }} onClick={onBack}>
          Got it, take me back
        </button>
      )}
    </div>
  );
}
