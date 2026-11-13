-- Track SMS delivery separately from email for owner finder alerts.
alter table public.findit_finder_reports
  add column if not exists sms_status text not null default 'pending'
  check (sms_status in ('pending','sent','failed','skipped'));

comment on column public.findit_finder_reports.sms_status is
  'SMS notification status for the registered item owner; skipped means no valid owner mobile or Twilio configuration is present.';
