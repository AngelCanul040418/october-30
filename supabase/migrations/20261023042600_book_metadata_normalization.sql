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
      select 1 from public.books
      where slug = candidate_slug and id <> book.id
    ) loop
      candidate_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    end loop;

    update public.books
    set slug = candidate_slug,
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
