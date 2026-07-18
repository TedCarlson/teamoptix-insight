begin;

alter table core.platform_service drop constraint if exists platform_service_key_ck;
alter table core.platform_service
  add constraint platform_service_key_ck
  check (service_key in ('VERCEL','SUPABASE','DIGITALOCEAN','BACKBLAZE','RESEND'));

alter table core.platform_service drop constraint if exists platform_service_role_ck;
alter table core.platform_service
  add constraint platform_service_role_ck
  check (service_role in ('APPLICATION','DATA','COMPUTE','ARCHIVE','COMMUNICATIONS'));

insert into core.platform_service(service_key, service_name, service_role, is_critical, display_order)
values ('RESEND','Resend','COMMUNICATIONS',true,50)
on conflict (service_key) do update set
  service_name = excluded.service_name,
  service_role = excluded.service_role,
  is_critical = excluded.is_critical,
  display_order = excluded.display_order,
  enabled = true,
  updated_at = now();

commit;
