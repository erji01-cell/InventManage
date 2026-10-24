-- Pin name resolution without replacing function bodies or changing inventory data.
begin;

alter function public.invent_create_parent_asset(text, integer, text) set search_path = '';
revoke execute on function public.invent_create_parent_asset(text, integer, text) from public, anon;
grant execute on function public.invent_create_parent_asset(text, integer, text) to authenticated, service_role;

alter function public.invent_register_movement(bigint, date, text, numeric, numeric, date, text, integer, text, text) set search_path = '';
revoke execute on function public.invent_register_movement(bigint, date, text, numeric, numeric, date, text, integer, text, text) from public, anon;
grant execute on function public.invent_register_movement(bigint, date, text, numeric, numeric, date, text, integer, text, text) to authenticated, service_role;

alter function public.invent_update_movement(bigint, bigint, date, text, numeric, numeric, date, text, integer, text, text) set search_path = '';
revoke execute on function public.invent_update_movement(bigint, bigint, date, text, numeric, numeric, date, text, integer, text, text) from public, anon;
grant execute on function public.invent_update_movement(bigint, bigint, date, text, numeric, numeric, date, text, integer, text, text) to authenticated, service_role;

alter function public.invent_year_end_update(date, boolean) set search_path = '';
revoke execute on function public.invent_year_end_update(date, boolean) from public, anon;
grant execute on function public.invent_year_end_update(date, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
