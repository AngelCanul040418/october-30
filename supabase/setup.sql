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

create policy "folio_books_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'books');
