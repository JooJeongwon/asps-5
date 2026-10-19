create table public.codex_work_items (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  status_name text not null check (status_name in ('Todo', 'In Progress', 'Done')),
  created_by text not null default 'Codex',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.codex_work_items enable row level security;

-- This is a public team board, matching the existing public GitHub Project.
create policy "Public shared Codex work" on public.codex_work_items
  for all to anon, authenticated
  using (true) with check (true);

grant select, insert, update on public.codex_work_items to anon, authenticated;
grant usage, select on sequence public.codex_work_items_id_seq to anon, authenticated;
