alter table public.books enable row level security;
revoke all on public.books from public, anon;
grant select, insert, update, delete on public.books to authenticated;

drop policy if exists "user_profiles_select_self" on public.user_profiles;
create policy "user_profiles_select_self"
on public.user_profiles for select to authenticated
using (
  (user_id = (select auth.uid()) and public.is_library_user_active())
  or public.is_library_super_admin()
);

drop policy if exists "user_books_select_self" on public.user_books;
create policy "user_books_select_self"
on public.user_books for select to authenticated
using (user_id = (select auth.uid()) and public.is_library_user_active());

drop policy if exists "user_books_delete_self" on public.user_books;
create policy "user_books_delete_self"
on public.user_books for delete to authenticated
using (user_id = (select auth.uid()) and public.is_library_user_active());

drop policy if exists "folio_books_owner_select" on public.books;
create policy "folio_books_owner_select"
on public.books for select to authenticated
using (
  public.is_library_super_admin()
  or (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role = 'author' and is_active
    )
  )
  or exists (
    select 1 from public.user_books
    where user_books.book_id = books.id and user_books.user_id = (select auth.uid())
  )
);

drop policy if exists "folio_books_owner_insert" on public.books;
create policy "folio_books_owner_insert"
on public.books for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.user_profiles
    where user_id = (select auth.uid())
      and role in ('super_admin', 'author') and is_active
  )
);

drop policy if exists "folio_books_owner_update" on public.books;
create policy "folio_books_owner_update"
on public.books for update to authenticated
using (
  public.is_library_super_admin()
  or (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role = 'author' and is_active
    )
  )
)
with check (
  public.is_library_super_admin()
  or (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role = 'author' and is_active
    )
  )
);

drop policy if exists "folio_books_owner_delete" on public.books;
create policy "folio_books_owner_delete"
on public.books for delete to authenticated
using (
  public.is_library_super_admin()
  or (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role = 'author' and is_active
    )
  )
);
