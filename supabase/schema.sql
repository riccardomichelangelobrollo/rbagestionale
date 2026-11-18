-- =====================================================================
--  Gestionale studio — schema del database (Supabase / PostgreSQL)
--  Da eseguire una sola volta in Supabase > SQL Editor.
--  PRIMA DI ESEGUIRE: cambia l'indirizzo email nell'ultima riga.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- membri dello studio (chi può entrare) --------------------
create table if not exists public.membri (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique check (email = lower(email)),
  nome        text not null default '',
  ruolo       text not null default 'membro' check (ruolo in ('admin','membro')),
  attivo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- clienti ---------------------------------------------------
create table if not exists public.clienti (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  codice_fiscale  text not null default '',   -- CF o P.IVA
  email           text not null default '',
  telefono        text not null default '',
  indirizzo       text not null default '',
  note            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- progetti / incarichi -------------------------------------
create table if not exists public.progetti (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cliente_id  uuid references public.clienti(id) on delete set null,
  comune      text not null default '',
  indirizzo   text not null default '',
  stato       text not null default 'attivo' check (stato in ('attivo','in pausa','chiuso')),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- pratiche edilizie ----------------------------------------
create table if not exists public.pratiche (
  id             uuid primary key default gen_random_uuid(),
  progetto_id    uuid not null references public.progetti(id) on delete cascade,
  tipo           text not null default 'CILA',
  comune         text not null default '',
  protocollo     text not null default '',
  data_deposito  date,
  scadenza       date,
  stato          text not null default 'in preparazione'
                 check (stato in ('in preparazione','depositata','integrazioni richieste','conclusa')),
  note           text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- attività (le cose da fare) -------------------------------
create table if not exists public.attivita (
  id           uuid primary key default gen_random_uuid(),
  titolo       text not null,
  progetto_id  uuid references public.progetti(id) on delete set null,
  categoria    text not null default 'stu',
  scadenza     date,
  ogni_giorno  boolean not null default false,
  fatta        boolean not null default false,
  fatta_il     timestamptz,
  fatta_oggi   date,          -- per le attività di ogni giorno: ultimo giorno in cui è stata fatta
  in_oggi      date,          -- "da fare oggi": il giorno in cui è stata messa in programma
  attesa_chi   text not null default '',
  attesa_cosa  text not null default '',
  note         text not null default '',
  assegnata_a  uuid references public.membri(id) on delete set null,
  creata_da    uuid references public.membri(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- priorità (mappa) e posto nella giornata (timeline di "oggi"): aggiunti il 18/11/2026
alter table public.attivita add column if not exists priorita text not null default 'media';
alter table public.attivita drop constraint if exists attivita_priorita_check;
alter table public.attivita add constraint attivita_priorita_check check (priorita in ('bassa','media','alta'));
alter table public.attivita add column if not exists ora_oggi text;          -- 'HH:MM' nel giorno indicato da in_oggi
alter table public.attivita add column if not exists ordine double precision; -- ordine tra le cose da sistemare

-- tipi di attività (aggiornato il 18/11/2026: aggiunta 'cont', contabilità di cantiere)
alter table public.attivita drop constraint if exists attivita_categoria_check;
alter table public.attivita add constraint attivita_categoria_check check (categoria in ('pa','can','cont','prog','cli','amm','stu'));

-- orario della scadenza ('HH:MM', facoltativo): aggiunto il 18/11/2026
alter table public.attivita add column if not exists scadenza_ora text;
alter table public.pratiche add column if not exists scadenza_ora text;

-- attività da fare entro una scadenza (un'altra attività con data): aggiunto il 18/11/2026
alter table public.attivita add column if not exists per_scadenza uuid references public.attivita(id) on delete set null;
create index if not exists attivita_per_scadenza_idx on public.attivita(per_scadenza);

-- ordine dei progetti sulla scrivania (trascinando le cartelle): aggiunto il 18/11/2026
alter table public.progetti add column if not exists ordine double precision;

-- tipo: 'attivita' = cosa da fare (si spunta); 'scadenza' = scadenza o appuntamento fissato (succede a una data): aggiunto il 18/11/2026
alter table public.attivita add column if not exists tipo text not null default 'attivita';
alter table public.attivita drop constraint if exists attivita_tipo_check;
alter table public.attivita add constraint attivita_tipo_check check (tipo in ('attivita','scadenza'));

create index if not exists attivita_progetto_idx on public.attivita(progetto_id);
create index if not exists attivita_assegnata_idx on public.attivita(assegnata_a);
create index if not exists pratiche_progetto_idx on public.pratiche(progetto_id);
create index if not exists progetti_cliente_idx on public.progetti(cliente_id);

-- ---------- updated_at automatico ------------------------------------
create or replace function public.tocca_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['membri','clienti','progetti','pratiche','attivita'] loop
    execute format('drop trigger if exists %1$s_updated on public.%1$s', t);
    execute format('create trigger %1$s_updated before update on public.%1$s
                    for each row execute function public.tocca_updated_at()', t);
  end loop;
end $$;

-- ---------- chi è l'utente collegato ---------------------------------
create or replace function public.mia_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membri where email = public.mia_email() and attivo)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membri where email = public.mia_email() and attivo and ruolo = 'admin')
$$;

-- ---------- permessi (Row Level Security) ----------------------------
-- Tutti i membri attivi leggono e modificano clienti, progetti, pratiche e attività.
-- Solo gli amministratori aggiungono, modificano o tolgono membri.
alter table public.membri   enable row level security;
alter table public.clienti  enable row level security;
alter table public.progetti enable row level security;
alter table public.pratiche enable row level security;
alter table public.attivita enable row level security;

do $$
declare t text;
begin
  foreach t in array array['clienti','progetti','pratiche','attivita'] loop
    execute format('drop policy if exists "membri leggono" on public.%s', t);
    execute format('drop policy if exists "membri scrivono" on public.%s', t);
    execute format('create policy "membri leggono" on public.%s for select to authenticated using (public.is_membro())', t);
    execute format('create policy "membri scrivono" on public.%s for all to authenticated using (public.is_membro()) with check (public.is_membro())', t);
  end loop;
end $$;

drop policy if exists "membri si vedono" on public.membri;
drop policy if exists "admin gestisce membri" on public.membri;
create policy "membri si vedono" on public.membri
  for select to authenticated using (public.is_membro());
create policy "admin gestisce membri" on public.membri
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- accesso alle tabelle dall'API ----------------------------
-- I progetti Supabase recenti non aprono più in automatico le tabelle all'API:
-- lo facciamo qui. Che cosa vede ciascuno lo decidono comunque le regole qui sopra.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
  on public.membri, public.clienti, public.progetti, public.pratiche, public.attivita
  to authenticated;
grant execute on function public.mia_email(), public.is_membro(), public.is_admin() to authenticated;
-- solo per la richiesta "tieni sveglio": le regole non mostrano alcuna riga a chi non ha fatto l'accesso
grant select on public.membri to anon;

-- ---------- immagini allegate alle attività (Supabase Storage, contenitore privato) ----------
alter table public.attivita add column if not exists allegati jsonb not null default '[]'::jsonb;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('allegati','allegati', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']) on conflict (id) do nothing;
drop policy if exists "membri leggono allegati" on storage.objects;
drop policy if exists "membri caricano allegati" on storage.objects;
drop policy if exists "membri tolgono allegati" on storage.objects;
create policy "membri leggono allegati" on storage.objects for select to authenticated using (bucket_id = 'allegati' and public.is_membro());
create policy "membri caricano allegati" on storage.objects for insert to authenticated with check (bucket_id = 'allegati' and public.is_membro());
create policy "membri tolgono allegati" on storage.objects for delete to authenticated using (bucket_id = 'allegati' and public.is_membro());

-- ---------- aggiornamenti in tempo reale tra dispositivi -------------
do $$
declare t text;
begin
  foreach t in array array['membri','clienti','progetti','pratiche','attivita'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%s', t);
    exception when duplicate_object then null;
             when undefined_object then null;
    end;
  end loop;
end $$;

-- ---------- primo amministratore -------------------------------------
-- Scrivi qui la TUA email (minuscolo) e il tuo nome, poi esegui tutto.
insert into public.membri (email, nome, ruolo)
values ('studio@riccardobrolloarchitetto.it', 'Riccardo Brollo', 'admin')
on conflict (email) do update set ruolo = 'admin', attivo = true;
