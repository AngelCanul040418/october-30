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
