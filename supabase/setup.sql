insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'books',
  'books',
  true,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "folio_books_authenticated_insert" on storage.objects;
drop policy if exists "folio_books_owner_insert" on storage.objects;
drop policy if exists "folio_books_owner_select" on storage.objects;
drop policy if exists "folio_books_owner_delete" on storage.objects;

create policy "folio_books_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'books'
  and owner_id = (select auth.uid()::text)
);

create policy "folio_books_owner_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'books'
  and owner_id = (select auth.uid()::text)
);

create policy "folio_books_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'books'
  and owner_id = (select auth.uid()::text)
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null unique,
  title text not null check (char_length(title) between 1 and 120),
  subtitle text not null default '' check (char_length(subtitle) <= 160),
  description text not null default '' check (char_length(description) <= 2000),
  author text not null default '' check (char_length(author) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.books enable row level security;

drop policy if exists "folio_books_owner_select" on public.books;
drop policy if exists "folio_books_owner_insert" on public.books;
drop policy if exists "folio_books_owner_update" on public.books;
drop policy if exists "folio_books_owner_delete" on public.books;

create policy "folio_books_owner_select"
on public.books
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "folio_books_owner_insert"
on public.books
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "folio_books_owner_update"
on public.books
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "folio_books_owner_delete"
on public.books
for delete
to authenticated
using (owner_id = (select auth.uid()));

create or replace function public.get_shared_book(requested_id uuid)
returns table (
  title text,
  subtitle text,
  description text,
  author text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.title, b.subtitle, b.description, b.author
  from public.books as b
  where b.id = requested_id
  limit 1;
$$;

revoke all on function public.get_shared_book(uuid) from public;
grant execute on function public.get_shared_book(uuid) to anon, authenticated;
