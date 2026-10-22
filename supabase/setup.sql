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
  false,
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

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'reader',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists is_active boolean not null default true;

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

update public.user_profiles
set role = 'super_admin'
where role = 'admin';

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('super_admin', 'author', 'reader'));

create table if not exists public.user_books (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index if not exists user_books_book_id_idx on public.user_books (book_id);

revoke all on public.user_profiles, public.user_books from public, anon, authenticated;
grant select on public.user_profiles to authenticated;
grant select, delete on public.user_books to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, role)
  values (new.id, 'reader')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

insert into public.user_profiles (user_id, role)
select auth_user.id, 'reader'
from auth.users as auth_user
on conflict (user_id) do nothing;

alter table public.user_profiles enable row level security;
alter table public.user_books enable row level security;

create or replace function public.is_library_user_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where user_id = (select auth.uid())
      and is_active
  );
$$;

revoke all on function public.is_library_user_active() from public, anon;
grant execute on function public.is_library_user_active() to authenticated;

create or replace function public.is_library_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where user_id = (select auth.uid())
      and role = 'super_admin'
      and is_active
  );
$$;

revoke all on function public.is_library_super_admin() from public, anon;
grant execute on function public.is_library_super_admin() to authenticated;

drop policy if exists "user_profiles_select_self" on public.user_profiles;
create policy "user_profiles_select_self"
on public.user_profiles
for select
to authenticated
using (
  (user_id = (select auth.uid()) and public.is_library_user_active())
  or public.is_library_super_admin()
);

drop policy if exists "user_books_select_self" on public.user_books;
create policy "user_books_select_self"
on public.user_books
for select
to authenticated
using (user_id = (select auth.uid()) and public.is_library_user_active());

drop policy if exists "user_books_delete_self" on public.user_books;
create policy "user_books_delete_self"
on public.user_books
for delete
to authenticated
using (user_id = (select auth.uid()) and public.is_library_user_active());

alter table public.books enable row level security;
revoke all on public.books from public, anon;
grant select, insert, update, delete on public.books to authenticated;

drop policy if exists "folio_books_owner_select" on public.books;
drop policy if exists "folio_books_owner_insert" on public.books;
drop policy if exists "folio_books_owner_update" on public.books;
drop policy if exists "folio_books_owner_delete" on public.books;

create policy "folio_books_owner_select"
on public.books
for select
to authenticated
using (
  public.is_library_super_admin()
  or (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.user_profiles
      where user_id = (select auth.uid())
        and role = 'author'
        and is_active
    )
  )
  or exists (
    select 1
    from public.user_books
    where user_books.book_id = books.id
      and user_books.user_id = (select auth.uid())
  )
);

create policy "folio_books_owner_insert"
on public.books
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.user_profiles
    where user_id = (select auth.uid())
      and role in ('super_admin', 'author')
      and is_active
  )
);

create policy "folio_books_owner_update"
on public.books
for update
to authenticated
using (
  public.is_library_super_admin()
  or (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.user_profiles
      where user_id = (select auth.uid())
        and role = 'author'
        and is_active
    )
  )
)
with check (
  public.is_library_super_admin()
  or (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.user_profiles
      where user_id = (select auth.uid())
        and role = 'author'
        and is_active
    )
  )
);

create policy "folio_books_owner_delete"
on public.books
for delete
to authenticated
using (
  public.is_library_super_admin()
  or (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.user_profiles
      where user_id = (select auth.uid())
        and role = 'author'
        and is_active
    )
  )
);

drop policy if exists "folio_books_owner_insert" on storage.objects;
drop policy if exists "folio_books_owner_select" on storage.objects;
drop policy if exists "folio_books_owner_delete" on storage.objects;
drop policy if exists "books_storage_admin_insert" on storage.objects;
drop policy if exists "books_storage_authorized_select" on storage.objects;
drop policy if exists "books_storage_admin_delete" on storage.objects;

create policy "books_storage_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'books'
  and owner_id = (select auth.uid()::text)
  and exists (
    select 1
    from public.user_profiles
    where user_id = (select auth.uid())
      and role in ('super_admin', 'author')
      and is_active
  )
);

create policy "books_storage_authorized_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'books'
  and (
    public.is_library_super_admin()
    or exists (
      select 1
      from public.books
      where (
        (
          books.owner_id = (select auth.uid())
          and exists (
            select 1
            from public.user_profiles
            where user_id = (select auth.uid())
              and role = 'author'
              and is_active
          )
        )
        or exists (
          select 1
          from public.user_books
          where user_books.book_id = books.id
            and user_books.user_id = (select auth.uid())
        )
      )
      and books.file_path = storage.objects.name
    )
    or exists (
      select 1
      from public.books
      where (
        (
          books.owner_id = (select auth.uid())
          and exists (
            select 1
            from public.user_profiles
            where user_id = (select auth.uid())
              and role = 'author'
              and is_active
          )
        )
        or public.is_library_super_admin()
        or exists (
          select 1
          from public.user_books
          where user_books.book_id = books.id
            and user_books.user_id = (select auth.uid())
        )
      )
      and books.cover_path = storage.objects.name
    )
  )
);

create policy "books_storage_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'books'
  and (
    public.is_library_super_admin()
    or exists (
      select 1
      from public.books
      where books.owner_id = (select auth.uid())
        and exists (
          select 1
          from public.user_profiles
          where user_id = (select auth.uid())
            and role = 'author'
            and is_active
        )
        and books.file_path = storage.objects.name
    )
    or exists (
      select 1
      from public.books
      where books.owner_id = (select auth.uid())
        and exists (
          select 1
          from public.user_profiles
          where user_id = (select auth.uid())
            and role = 'author'
            and is_active
        )
        and books.cover_path = storage.objects.name
    )
  )
);

drop function if exists public.is_library_admin();

drop function if exists public.get_shared_book(uuid);
create or replace function public.get_shared_book(requested_id uuid)
returns table (
  id uuid,
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
    b.id,
    b.title,
    b.subtitle,
    b.description,
    b.author,
    b.slug,
    b.file_path,
    b.original_filename,
    b.cover_path
  from public.books as b
  where b.id = requested_id
    and (select auth.uid()) is not null
    and public.is_library_user_active()
  limit 1;
$$;

revoke all on function public.get_shared_book(uuid) from public;
grant execute on function public.get_shared_book(uuid) to authenticated;

drop function if exists public.get_shared_book_by_slug(text);
create or replace function public.get_shared_book_by_slug(requested_slug text)
returns table (
  id uuid,
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
    b.id,
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
    and (select auth.uid()) is not null
    and public.is_library_user_active()
  limit 1;
$$;

revoke all on function public.get_shared_book_by_slug(text) from public;
grant execute on function public.get_shared_book_by_slug(text) to authenticated;

create or replace function public.save_shared_book(requested_book text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_book_id uuid;
begin
  if (not public.is_library_user_active()) then
    raise exception 'Tu cuenta no está activa.';
  end if;

  select b.id
  into matched_book_id
  from public.books as b
  where b.slug = requested_book
     or b.id::text = requested_book
  limit 1;

  if matched_book_id is null then
    raise exception 'No encontramos el libro compartido.';
  end if;

  insert into public.user_books (user_id, book_id)
  values ((select auth.uid()), matched_book_id)
  on conflict (user_id, book_id) do nothing;

  return matched_book_id;
end;
$$;

revoke all on function public.save_shared_book(text) from public, anon;
grant execute on function public.save_shared_book(text) to authenticated;
