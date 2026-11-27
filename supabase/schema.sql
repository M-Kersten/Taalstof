-- Tabel voor de lessen van Taalstof. Plak dit in Supabase onder SQL Editor en voer het uit.
-- Elke les hoort bij één gebruiker. Row level security zorgt dat je alleen je eigen lessen
-- kunt lezen, maken, wijzigen en wissen, ook al staat de anon-sleutel openbaar in de app.

create table if not exists public.lessen (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  sleutel text not null,
  titel text not null,
  track jsonb not null,
  les jsonb not null,
  meta jsonb not null,
  gemaakt timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists lessen_sleutel on public.lessen (user_id, sleutel);

alter table public.lessen enable row level security;

drop policy if exists "eigen lessen lezen" on public.lessen;
drop policy if exists "eigen lessen maken" on public.lessen;
drop policy if exists "eigen lessen wijzigen" on public.lessen;
drop policy if exists "eigen lessen wissen" on public.lessen;

create policy "eigen lessen lezen" on public.lessen for select to authenticated using ((select auth.uid()) = user_id);
create policy "eigen lessen maken" on public.lessen for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "eigen lessen wijzigen" on public.lessen for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigen lessen wissen" on public.lessen for delete to authenticated using ((select auth.uid()) = user_id);
