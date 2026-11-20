create table public.ocr_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  items jsonb not null
);
alter table public.ocr_feedback enable row level security;
revoke all on table public.ocr_feedback from public, anon, authenticated;
grant all on table public.ocr_feedback to service_role;
