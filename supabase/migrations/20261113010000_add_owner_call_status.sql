-- Track automated voice-call delivery separately from email and SMS.
alter table public.findit_finder_reports
  add column if not exists call_status text not null default 'pending'
  check (call_status in ('pending','sent','failed','skipped'));

comment on column public.findit_finder_reports.call_status is
  'Automated voice-call request status for the registered item owner; sent means Twilio accepted the call request, not that the owner answered.';
