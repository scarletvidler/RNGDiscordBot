insert into public.discord_users (id, username, global_name, is_bot)
values ('122548971737579520', 'local-owner', 'Local Owner', false)
on conflict (id) do update
set username = excluded.username,
    global_name = excluded.global_name,
    last_seen_at = now();
