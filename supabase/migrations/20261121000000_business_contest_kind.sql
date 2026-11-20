-- ビジコン情報に「支援」（締切のない、いつでも使える支援）を同じ表で持てるようにする。
-- kind = 'contest'（ビジコン・ハッカソン・公募など締切のあるもの） / 'support'（支援制度・相談窓口など）
-- source = 'manual'（幹部が手で追加） / 'gemini'（イベント自動収集ボットが追加）
alter table public.business_contests
  add column if not exists kind text not null default 'contest',
  add column if not exists source text not null default 'manual';

do $$ begin
  alter table public.business_contests add constraint business_contests_kind_check check (kind in ('contest','support'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.business_contests add constraint business_contests_source_check check (source in ('manual','gemini'));
exception when duplicate_object then null; end $$;

create index if not exists idx_business_contests_club_kind on public.business_contests(club_id, kind, published_at desc);
