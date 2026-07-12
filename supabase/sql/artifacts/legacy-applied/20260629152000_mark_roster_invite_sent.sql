create or replace function public.mark_roster_invite_sent(
  p_company_id uuid,
  p_roster_id uuid,
  p_full_name text,
  p_email text,
  p_token_id uuid,
  p_email_provider_id text
)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  update core.company_roster
  set invite_status = 'Invited'
  where id = p_roster_id
    and company_id = p_company_id;

  insert into core.company_roster_event (
    company_id, roster_id, event_category, event_type, event_detail, event_metadata, occurred_at
  )
  values (
    p_company_id,
    p_roster_id,
    'onboarding',
    'invite_sent',
    'Invite email sent from roster.',
    jsonb_build_object(
      'source', 'roster_invite_button',
      'full_name', p_full_name,
      'email', p_email,
      'token_id', p_token_id,
      'email_provider_id', p_email_provider_id
    ),
    now()
  );
end;
$$;

grant execute on function public.mark_roster_invite_sent(uuid, uuid, text, text, uuid, text) to authenticated;
