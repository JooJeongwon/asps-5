create table public.task_status_editors (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@]+@[^@]+$')
);

alter table public.task_status_editors enable row level security;
revoke all on public.task_status_editors from public, anon, authenticated;
grant select on public.task_status_editors to authenticated;

create policy "Editors can read their own membership"
  on public.task_status_editors for select to authenticated
  using (email = lower((select auth.jwt() ->> 'email')));

revoke update on public.tasks from public, anon, authenticated;
revoke update (task_id, project_id, status_id, milestone_id, github_issue_number, issue_url, title, issue_state)
  on public.tasks from public, anon, authenticated;
grant select on public.tasks to authenticated;
grant update (status_id) on public.tasks to authenticated;

create policy "Authenticated board members can read public GitHub tasks"
  on public.tasks for select to authenticated
  using (true);

create policy "Board editors can update GitHub task status"
  on public.tasks for update to authenticated
  using (exists (
    select 1 from public.task_status_editors
    where email = lower((select auth.jwt() ->> 'email'))
  ))
  with check (exists (
    select 1 from public.task_status_editors
    where email = lower((select auth.jwt() ->> 'email'))
  ));

create policy "GitHub task updates require board editor membership"
  on public.tasks as restrictive for update to authenticated
  using (exists (
    select 1 from public.task_status_editors
    where email = lower((select auth.jwt() ->> 'email'))
  ))
  with check (exists (
    select 1 from public.task_status_editors
    where email = lower((select auth.jwt() ->> 'email'))
  ));
