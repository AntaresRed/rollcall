-- ============================================================
-- Food orders sent from the app
--
-- The night canteen and tuck shop baskets hand a written-out order to
-- WhatsApp, and until now the only record of that was the history kept on
-- the student's own device. Nothing could say how often the baskets are
-- actually used. This table is a copy of each order as it left the app: the
-- final message, word for word, as the student edited it.
--
-- What it is not: a record of what was delivered. The student still presses
-- send in WhatsApp, and can change or abandon the order there. A row here
-- means "the app handed this message over", nothing more.
--
-- The message carries the room and registration number the student typed,
-- so the table holds personal data. Students can add their own rows and
-- nothing else — not read them back, not change them, not see anyone
-- else's. Reading across students is for the SQL editor, which runs as the
-- owner and bypasses RLS.
--
--   psql "$DATABASE_URL" -f supabase/food-orders.sql
-- ============================================================

create table if not exists public.food_orders (
  id           bigint generated always as identity primary key,
  -- Defaulted rather than sent, and checked by the policy below, so a row can
  -- only ever be filed under the account that sent it.
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('night', 'tuck')),
  -- The shop's id and its name as the app showed it at the time. The name is
  -- copied rather than looked up, because a shop can be renamed in the
  -- spreadsheet and last month's orders should still say where they went.
  shop         text not null default '',
  shop_name    text not null default '',
  -- Capped so a runaway client can't fill the table with one row. A long
  -- order is a few hundred characters.
  message      text not null check (char_length(message) between 1 and 4000),
  -- What the basket came to, which is not necessarily what the message says
  -- once it has been edited. Null when the basket had no total.
  basket_total numeric,
  created_at   timestamptz not null default now()
);

create index if not exists food_orders_created_idx on public.food_orders (created_at desc);
create index if not exists food_orders_user_idx    on public.food_orders (user_id);

alter table public.food_orders enable row level security;

-- Insert only. No select, update or delete policy exists, so with RLS on those
-- are refused for every signed-in student, including on their own rows.
drop policy if exists "own food orders insert" on public.food_orders;
create policy "own food orders insert" on public.food_orders
  for insert to authenticated with check (user_id = auth.uid());

revoke all on public.food_orders from anon;
revoke all on public.food_orders from authenticated;
grant insert (kind, shop, shop_name, message, basket_total)
  on public.food_orders to authenticated;

comment on table public.food_orders is
  'Order messages handed from the app to WhatsApp (night canteen and tuck shops). Intent, not delivery.';
