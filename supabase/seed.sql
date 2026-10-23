-- Run only after Supabase Auth has created the invited user.
-- This seed never creates or stores a password.
do $$
declare
  invited_user_id uuid;
begin
  select id
  into invited_user_id
  from auth.users
  where lower(email) = lower('acanul353@gmail.com')
  limit 1;

  if invited_user_id is null then
    raise exception 'Invite acanul353@gmail.com first, then run this seed.';
  end if;

  insert into public.user_profiles (user_id, role, is_active)
  values (invited_user_id, 'super_admin', true)
  on conflict (user_id) do update
  set role = excluded.role,
      is_active = true;
end;
$$;
