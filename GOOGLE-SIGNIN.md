# Google sign-in — setup

RollCall now requires a Google account on **@email.iimcal.ac.in**. Anonymous
accounts are gone.

About 20 minutes, mostly clicking through Google Cloud Console.

---

## 1. Google Cloud Console (10 min)

1. **console.cloud.google.com** → sign in → **Select a project → New Project** →
   name it `RollCall`.
2. **APIs & Services → OAuth consent screen**
   - User type: **External** (Internal only works if you own the Workspace)
   - App name `RollCall`, your email for support and developer contact
   - Scopes: the defaults are enough — `email`, `profile`, `openid`
   - Under **Test users**, add your own institute address while the app is
     still unpublished. An unpublished app admits **100 test users at most**,
     so you must click **Publish app** before a real cohort uses it.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Type: **Web application**
   - **Authorised JavaScript origins:**
     ```
     https://rollcall-seven-theta.vercel.app
     http://localhost:5173
     ```
   - **Authorised redirect URI** — this is Supabase's callback, not your app's:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
4. Copy the **Client ID** and **Client secret**.

## 2. Supabase (3 min)

1. **Authentication → Sign In / Providers → Google** → enable
2. Paste the Client ID and Client secret → **Save**
3. **Authentication → URL Configuration**
   - Site URL: `https://rollcall-seven-theta.vercel.app`
   - Redirect URLs: add the same, plus `http://localhost:5173` for local work
4. **Turn OFF Anonymous sign-ins.** The trigger rejects them anyway, but there
   is no reason to leave the door ajar.

## 3. Database (2 min)

Run `supabase/schema.sql` in the SQL Editor. It adds the allowlist and the
trigger that enforces it.

Confirm:

```sql
select * from public.allowed_email_domains;

select tgname from pg_trigger where tgname = 'enforce_email_domain';
```

## 4. Clear out the old anonymous accounts

Existing anonymous users can no longer sign in, and their timetables are
unreachable. While you're still testing, delete them:

```sql
-- have a look first
select id, email, created_at from auth.users where email is null;

-- then remove them; classes and attendance cascade away
delete from auth.users where email is null;
```

---

## How the restriction actually works

Two layers, and only one of them counts.

**The database trigger** on `auth.users` is the real control. It runs before
any account is created and rejects anything outside the allowlist, so a
non-institute account cannot exist — however the request reaches Supabase.

**The `hd` parameter** sent to Google is a convenience: it prompts for
institute accounts and hides personal ones. It can be stripped from the URL by
anyone who cares to, which is exactly why it isn't the control.

The address shape is checked before the domain is read. `a@evil.com` fails the
obvious way; `a@email.iimcal.ac.in@evil.com` is rejected outright rather than
being parsed as either domain, since an address with two `@` signs has no
honest answer.

## Adding another domain

Faculty or staff on a different domain:

```sql
insert into public.allowed_email_domains (domain, note)
values ('iimcal.ac.in', 'faculty and staff');
```

Takes effect immediately — no redeploy. Also update `EXPECTED_DOMAIN` in
`src/lib/supabase.js` if you want the sign-in screen to mention it.

## Across devices, and staying signed in

Every row is scoped by `auth.uid() = user_id`, and a Google account resolves to
the same `auth.users.id` wherever it's used. So a student who signs in on their
phone and their laptop sees one timetable and one attendance record — a class
marked present on the laptop is present on the phone. This is the thing
anonymous accounts couldn't do: those were per-browser, so the same person on
two devices was two unrelated students.

Sessions persist. The client stores the session and refreshes the token in the
background, so a student signs in once and stays signed in — closing the app,
rebooting the phone, and weeks of ordinary use don't log them out.

Four things do end a session, and all four are recoverable with one tap,
because nothing lives in the browser except the token:

- signing out from the account chip in the masthead
- clearing browser or site data
- iOS evicting storage for a web app left untouched for a long stretch
- a token that has aged out entirely

Notifications are per device: each phone or laptop registers separately, so a
student with the app on two devices gets the alert on both. That's deliberate,
and matches how any messaging app behaves.

One wrinkle worth knowing: the alert timezone is stored per student, not per
device, and is set by whichever device most recently turned alerts on. It only
matters if someone enables alerts from a machine in a different timezone.

## Things worth knowing

- **Publish the OAuth app before the pilot.** Unpublished means 100 test users
  and a Google warning screen.
- **iOS PWAs and OAuth don't always cooperate.** Redirecting to Google can drop
  the student into Safari rather than back into the installed app, leaving the
  session in the wrong place. Test this specifically on an iPhone before you
  rely on it — it's the one part of this flow that behaves differently there.
- **Signing out is in the masthead**, on the chip showing the account name.
