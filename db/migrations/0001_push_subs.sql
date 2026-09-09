-- Plan v2 section 6.7. The whole server side data model.
--
-- Columns that deliberately do not exist: any user id, any name, any email, any place, any
-- merchant, any amount, any jar or ledger figure, any event, any IP address, any user agent.
-- If a future change wants one of those it is a plan revision and a rewrite of section 9.4,
-- not a migration. `tests/db/schema.test.ts` lists this table's columns and fails the moment
-- an extra one appears, so that rule is enforced rather than remembered.
--
-- `endpoint_hash` is sha256(endpoint) in lowercase hex, computed server side (6.10).

create table if not exists schema_migrations (
  id          text primary key,
  applied_at  timestamptz not null default now()
);

create table if not exists push_subs (
  endpoint_hash        char(64)    primary key,
  endpoint             text        not null,
  p256dh               text        not null,
  auth                 text        not null,
  tz                   text        not null,
  nudge_local_date     date,
  nudge_local_minute   smallint,
  last_sent_local_date date,
  enabled              boolean     not null default true,
  fail_count           smallint    not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint push_subs_minute_range
    check (nudge_local_minute is null or (nudge_local_minute >= 0 and nudge_local_minute <= 1439)),
  constraint push_subs_tz_nonempty check (length(tz) between 1 and 64)
);

create index if not exists push_subs_due_idx
  on push_subs (nudge_local_date)
  where enabled and nudge_local_minute is not null;

create index if not exists push_subs_stale_idx on push_subs (updated_at);
