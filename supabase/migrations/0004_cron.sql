create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Vault 에 넣어 둔 값을 읽어 Edge Function 을 호출한다.
-- 사전 준비(1회):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'functions_base_url');
--   select vault.create_secret('<service_role_key>', 'service_role_key');
create or replace function public.invoke_job(job text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  base text;
  key  text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'functions_base_url';
  select decrypted_secret into key  from vault.decrypted_secrets where name = 'service_role_key';
  if base is null or key is null then
    raise exception 'vault secrets missing: functions_base_url / service_role_key';
  end if;

  perform net.http_post(
    url     := base || '/' || job,
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || key,
                 'Content-Type',  'application/json'
               ),
    body    := '{}'::jsonb
  );
end;
$$;

-- 크론은 UTC 로 돈다. KST = UTC + 9.
select cron.schedule('collect',           '0 18 * * *',   $$select public.invoke_job('collect')$$);
select cron.schedule('summarize-submit',  '0 19 * * *',   $$select public.invoke_job('summarize-submit')$$);
select cron.schedule('summarize-collect', '*/20 * * * *', $$select public.invoke_job('summarize-collect')$$);
select cron.schedule('deliver',           '0 * * * *',    $$select public.invoke_job('deliver')$$);
