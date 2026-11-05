-- Execute no SQL Editor do Supabase antes de usar o novo menu "Outros produtos".
create table if not exists public.other_products (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  cost numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  stock integer not null default 0 check (stock >= 0),
  image_data text,
  created_at timestamptz not null default now()
);

alter table public.other_products enable row level security;
revoke all on table public.other_products from anon;
grant select, insert, update, delete on table public.other_products to authenticated;

drop policy if exists "Users can read own other products" on public.other_products;
drop policy if exists "Users can insert own other products" on public.other_products;
drop policy if exists "Users can update own other products" on public.other_products;
drop policy if exists "Users can delete own other products" on public.other_products;
create policy "Users can read own other products" on public.other_products for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own other products" on public.other_products for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own other products" on public.other_products for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own other products" on public.other_products for delete to authenticated using ((select auth.uid()) = user_id);
create index if not exists other_products_user_id_idx on public.other_products(user_id);
