begin;

create table if not exists legal.customer_legal_task (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references core.companies(id) on delete set null,
  document_id uuid not null references legal.document(id) on delete cascade,
  document_version_id uuid not null references legal.document_version(id) on delete cascade,
  vault_item_id uuid references legal.document_vault_item(id) on delete set null,

  task_type text not null default 'CLIENT_DOCUMENT_ACCEPTANCE',
  task_key text not null,
  status text not null default 'READY_FOR_CUSTOMER_REVIEW',
  priority integer not null default 100,

  customer_legal_name text,
  customer_contact_email text,
  title text not null default 'Contract signature required',
  description text,

  released_at timestamptz not null default now(),
  customer_accepted_at timestamptz,
  customer_accepted_by_email text,
  teamoptix_executed_at timestamptz,
  teamoptix_executed_by uuid,
  completed_at timestamptz,
  cancelled_at timestamptz,

  blocking_reason text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customer_legal_task_type_ck
    check (task_type in ('CLIENT_DOCUMENT_ACCEPTANCE')),

  constraint customer_legal_task_status_ck
    check (
      status in (
        'READY_FOR_CUSTOMER_REVIEW',
        'CUSTOMER_ACCEPTED',
        'TEAMOPTIX_EXECUTED',
        'EXECUTED_AND_VAULTED',
        'CANCELLED'
      )
    ),

  constraint customer_legal_task_document_version_type_uq
    unique (document_version_id, task_type),

  constraint customer_legal_task_key_uq
    unique (task_key)
);

create index if not exists customer_legal_task_company_status_idx
  on legal.customer_legal_task (company_id, status, released_at desc);

create index if not exists customer_legal_task_document_idx
  on legal.customer_legal_task (document_id, document_version_id);

create or replace function legal.touch_customer_legal_task_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists customer_legal_task_touch_updated_at on legal.customer_legal_task;
create trigger customer_legal_task_touch_updated_at
before update on legal.customer_legal_task
for each row
execute function legal.touch_customer_legal_task_updated_at();

create or replace function legal.resolve_customer_company_id(
  p_customer_company_id uuid,
  p_customer_legal_name text
)
returns uuid
language plpgsql
stable
set search_path = public, legal, core
as $$
declare
  v_company_id uuid;
begin
  if p_customer_company_id is not null then
    return p_customer_company_id;
  end if;

  if nullif(btrim(coalesce(p_customer_legal_name, '')), '') is null then
    return null;
  end if;

  select c.id
  into v_company_id
  from core.companies c
  where lower(btrim(c.company_name)) = lower(btrim(p_customer_legal_name))
  order by c.created_at desc
  limit 1;

  return v_company_id;
end;
$$;

create or replace function legal.upsert_customer_legal_task_for_version(p_document_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, legal, core
as $$
declare
  v_document legal.document%rowtype;
  v_version legal.document_version%rowtype;
  v_company_id uuid;
  v_task_id uuid;
  v_task_key text;
begin
  select *
  into v_version
  from legal.document_version
  where id = p_document_version_id;

  if not found then
    return null;
  end if;

  select *
  into v_document
  from legal.document
  where id = v_version.document_id;

  if not found or coalesce(v_document.document_scope, 'TEMPLATE') <> 'CLIENT_DOCUMENT' then
    return null;
  end if;

  v_company_id := legal.resolve_customer_company_id(
    v_document.customer_company_id,
    v_document.customer_legal_name
  );

  v_task_key := v_document.document_key || '__' || v_version.version_label || '__CUSTOMER_REVIEW';

  insert into legal.customer_legal_task (
    company_id,
    document_id,
    document_version_id,
    task_type,
    task_key,
    status,
    customer_legal_name,
    customer_contact_email,
    title,
    description,
    blocking_reason,
    metadata
  )
  values (
    v_company_id,
    v_document.id,
    v_version.id,
    'CLIENT_DOCUMENT_ACCEPTANCE',
    v_task_key,
    'READY_FOR_CUSTOMER_REVIEW',
    v_document.customer_legal_name,
    null,
    'Contract signature required',
    'A locked Team Optix client document is ready for customer review and acceptance.',
    'Customer acceptance is required before Team Optix can finalize and vault this agreement.',
    jsonb_build_object(
      'document_key', v_document.document_key,
      'document_title', v_document.title,
      'version_label', v_version.version_label,
      'source_template_document_id', v_document.source_template_document_id,
      'source_template_version_id', v_document.source_template_version_id
    )
  )
  on conflict (document_version_id, task_type)
  do update set
    company_id = coalesce(legal.customer_legal_task.company_id, excluded.company_id),
    customer_legal_name = coalesce(excluded.customer_legal_name, legal.customer_legal_task.customer_legal_name),
    title = excluded.title,
    description = excluded.description,
    blocking_reason = case
      when legal.customer_legal_task.status in ('READY_FOR_CUSTOMER_REVIEW') then excluded.blocking_reason
      else legal.customer_legal_task.blocking_reason
    end,
    metadata = legal.customer_legal_task.metadata || excluded.metadata
  returning id
  into v_task_id;

  return v_task_id;
end;
$$;

create or replace function legal.document_version_customer_task_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, legal, core
as $$
begin
  if new.status = 'LOCKED' then
    perform legal.upsert_customer_legal_task_for_version(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists document_version_customer_task_after_insert on legal.document_version;
create trigger document_version_customer_task_after_insert
after insert on legal.document_version
for each row
execute function legal.document_version_customer_task_after_insert();

create or replace function public.legal_customer_task_mark_customer_accepted(
  p_document_version_id uuid,
  p_accepted_by_email text default null,
  p_vault_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, legal, core
as $$
declare
  v_task legal.customer_legal_task%rowtype;
begin
  update legal.customer_legal_task
  set
    status = case
      when p_vault_item_id is not null then 'CUSTOMER_ACCEPTED'
      else 'CUSTOMER_ACCEPTED'
    end,
    customer_accepted_at = coalesce(customer_accepted_at, now()),
    customer_accepted_by_email = coalesce(nullif(btrim(coalesce(p_accepted_by_email, '')), ''), customer_accepted_by_email),
    vault_item_id = coalesce(p_vault_item_id, vault_item_id),
    blocking_reason = 'Team Optix final execution is pending.',
    metadata = metadata || jsonb_build_object('customer_accepted_source', 'legal_acceptance')
  where document_version_id = p_document_version_id
    and task_type = 'CLIENT_DOCUMENT_ACCEPTANCE'
    and status <> 'CANCELLED'
  returning *
  into v_task;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Customer legal task not found.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'task', to_jsonb(v_task)
  );
end;
$$;

grant execute on function public.legal_customer_task_mark_customer_accepted(uuid, text, uuid) to authenticated;
grant execute on function public.legal_customer_task_mark_customer_accepted(uuid, text, uuid) to service_role;

create or replace view public.legal_customer_legal_task_v
with (security_invoker = true)
as
select
  t.id,
  t.company_id,
  c.company_slug,
  c.company_name,
  t.document_id,
  d.document_key,
  d.title as document_title,
  d.customer_legal_name as document_customer_legal_name,
  t.document_version_id,
  dv.version_label,
  t.vault_item_id,
  t.task_type,
  t.task_key,
  t.status,
  t.priority,
  t.customer_legal_name,
  t.customer_contact_email,
  t.title,
  t.description,
  t.released_at,
  t.customer_accepted_at,
  t.customer_accepted_by_email,
  t.teamoptix_executed_at,
  t.teamoptix_executed_by,
  t.completed_at,
  t.cancelled_at,
  t.blocking_reason,
  t.metadata,
  t.created_at,
  t.updated_at
from legal.customer_legal_task t
join legal.document d on d.id = t.document_id
join legal.document_version dv on dv.id = t.document_version_id
left join core.companies c on c.id = t.company_id;

grant all on table public.legal_customer_legal_task_v to authenticated;
grant all on table public.legal_customer_legal_task_v to service_role;

select legal.upsert_customer_legal_task_for_version(dv.id)
from legal.document_version dv
join legal.document d on d.id = dv.document_id
where dv.status = 'LOCKED'
  and coalesce(d.document_scope, 'TEMPLATE') = 'CLIENT_DOCUMENT';

commit;
