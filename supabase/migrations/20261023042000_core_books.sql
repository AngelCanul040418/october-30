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

create unique index if not exists books_slug_key on public.books (slug);
