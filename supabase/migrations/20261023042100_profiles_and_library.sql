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
