insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'books',
  'books',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "books_storage_admin_insert" on storage.objects;
create policy "books_storage_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'books'
  and owner_id = (select auth.uid()::text)
  and exists (
    select 1 from public.user_profiles
    where user_id = (select auth.uid())
      and role in ('super_admin', 'author') and is_active
  )
);

drop policy if exists "books_storage_authorized_select" on storage.objects;
create policy "books_storage_authorized_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'books'
  and (
    public.is_library_super_admin()
    or exists (
      select 1 from public.books
      where (
        (
          books.owner_id = (select auth.uid())
          and exists (
            select 1 from public.user_profiles
            where user_id = (select auth.uid())
              and role = 'author' and is_active
          )
        )
        or exists (
          select 1 from public.user_books
          where user_books.book_id = books.id
            and user_books.user_id = (select auth.uid())
        )
      )
      and (books.file_path = storage.objects.name or books.cover_path = storage.objects.name)
    )
  )
);

drop policy if exists "books_storage_admin_delete" on storage.objects;
create policy "books_storage_admin_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'books'
  and (
    public.is_library_super_admin()
    or exists (
      select 1 from public.books
      where books.owner_id = (select auth.uid())
        and exists (
          select 1 from public.user_profiles
          where user_id = (select auth.uid())
            and role = 'author' and is_active
        )
        and (books.file_path = storage.objects.name or books.cover_path = storage.objects.name)
    )
  )
);
