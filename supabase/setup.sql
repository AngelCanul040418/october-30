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
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
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
  slug text,
  original_filename text not null default '',
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.books
  add column if not exists slug text,
  add column if not exists original_filename text not null default '',
  add column if not exists cover_path text;

create or replace function public.slugify_book_title(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(coalesce(value, '')),
      'áéíóúüñàèìòùäëïöüç',
      'aeiouunaeiouaeiouc'
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

revoke all on function public.slugify_book_title(text) from public, anon, authenticated;

do $$
declare
  book record;
  base_slug text;
  candidate_slug text;
  suffix integer;
begin
  for book in
    select id, title
    from public.books
    where slug is null or btrim(slug) = ''
    order by created_at, id
  loop
    base_slug := coalesce(nullif(public.slugify_book_title(book.title), ''), 'libro');
    candidate_slug := base_slug;
    suffix := 2;

    while exists (
      select 1
      from public.books
      where slug = candidate_slug and id <> book.id
    ) loop
      candidate_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    end loop;

    update public.books
    set
      slug = candidate_slug,
      original_filename = coalesce(nullif(btrim(original_filename), ''), title || '.pdf')
    where id = book.id;
  end loop;
end;
$$;

update public.books
set original_filename = title || '.pdf'
where btrim(original_filename) = '';

alter table public.books
  alter column slug set not null,
  alter column original_filename drop default;

create unique index if not exists books_slug_key on public.books (slug);

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

create or replace function public.get_shared_book_by_slug(requested_slug text)
returns table (
  title text,
  subtitle text,
  description text,
  author text,
  slug text,
  file_path text,
  original_filename text,
  cover_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.title,
    b.subtitle,
    b.description,
    b.author,
    b.slug,
    b.file_path,
    b.original_filename,
    b.cover_path
  from public.books as b
  where b.slug = requested_slug
  limit 1;
$$;

revoke all on function public.get_shared_book_by_slug(text) from public;
grant execute on function public.get_shared_book_by_slug(text) to anon, authenticated;
