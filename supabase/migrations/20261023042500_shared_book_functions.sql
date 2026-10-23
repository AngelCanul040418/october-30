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

create or replace function public.get_shared_book_by_slug(requested_slug text)
returns table (
  id uuid, title text, subtitle text, description text, author text,
  slug text, file_path text, original_filename text, cover_path text
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.title, b.subtitle, b.description, b.author, b.slug,
    b.file_path, b.original_filename, b.cover_path
  from public.books as b
  where b.slug = requested_slug
    and (select auth.uid()) is not null
    and public.is_library_user_active()
  limit 1;
$$;

revoke all on function public.get_shared_book_by_slug(text) from public;
grant execute on function public.get_shared_book_by_slug(text) to authenticated;

create or replace function public.get_shared_book(requested_id uuid)
returns table (
  id uuid, title text, subtitle text, description text, author text,
  slug text, file_path text, original_filename text, cover_path text
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.title, b.subtitle, b.description, b.author, b.slug,
    b.file_path, b.original_filename, b.cover_path
  from public.books as b
  where b.id = requested_id
    and (select auth.uid()) is not null
    and public.is_library_user_active()
  limit 1;
$$;

revoke all on function public.get_shared_book(uuid) from public;
grant execute on function public.get_shared_book(uuid) to authenticated;

create or replace function public.save_shared_book(requested_book text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare matched_book_id uuid;
begin
  if not public.is_library_user_active() then
    raise exception 'Tu cuenta no está activa.';
  end if;
  select b.id into matched_book_id from public.books as b
  where b.slug = requested_book or b.id::text = requested_book limit 1;
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
