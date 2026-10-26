drop policy "Public shared Codex work" on public.codex_work_items;

create policy "Public can read shared Codex work"
  on public.codex_work_items for select to anon, authenticated using (true);
create policy "Public can add shared Codex work"
  on public.codex_work_items for insert to anon, authenticated with check (true);
create policy "Public can update shared Codex work"
  on public.codex_work_items for update to anon, authenticated using (true) with check (true);
create policy "Public can delete shared Codex work"
  on public.codex_work_items for delete to anon, authenticated using (true);

revoke delete on public.codex_work_items from public, anon, authenticated;
grant delete on public.codex_work_items to anon, authenticated;
