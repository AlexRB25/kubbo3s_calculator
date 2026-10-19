-- Kubbo3D: esquema completo. Pégalo entero en Supabase > SQL Editor y ejecútalo. Se puede volver a ejecutar.
--
-- Modelo de seguridad:
--   * La app móvil usa la clave publicable y la sesión del usuario (Supabase Auth). Cada fila lleva
--     user_id y las políticas RLS solo dejan ver y tocar las filas propias.
--   * Las existencias (filamento, piezas, horas de impresora) las mueven triggers, así que quedan
--     bien aunque se borre o corrija un registro.
--   * El dashboard usa la clave secreta (service_role) desde el servidor de Next.js; las funciones
--     admin_* no se pueden llamar desde la app.

-- ───────────────────────── Tablas ─────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  name text not null default '',
  business_name text not null default '',
  -- Precio de la luz por kWh, para sumar la electricidad al costo de cada pieza.
  kwh_price numeric(10,4) not null default 0 check (kwh_price >= 0),
  -- Ganancia deseada sobre el costo, en %. Con ella se calcula el precio sugerido.
  margin_pct numeric(7,2) not null default 100 check (margin_pct >= 0),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists profiles_created_at_idx on public.profiles (created_at);

-- Un renglón por usuario y día en que abrió la app (hora de México). Alimenta las métricas de uso.
create table if not exists public.activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
create index if not exists activity_days_day_idx on public.activity_days (day);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  contact text not null default '',
  phone text not null default '',
  url text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists suppliers_user_idx on public.suppliers (user_id);

create table if not exists public.printers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  model text not null default '',
  power_watts numeric(8,2) not null default 0 check (power_watts >= 0),
  -- Desgaste / depreciación por hora de impresión.
  hourly_cost numeric(10,2) not null default 0 check (hourly_cost >= 0),
  -- Minutos impresos acumulados; lo mantiene el trigger de print_jobs.
  print_minutes int not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists printers_user_idx on public.printers (user_id);

-- Un filamento es un tipo (marca + material + color), no un carrete: las compras suman gramos aquí.
create table if not exists public.filaments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand text not null default '',
  material text not null,
  color text not null default '',
  color_hex text not null default '#9A9AA8',
  supplier_id uuid references public.suppliers (id) on delete set null,
  -- Puede quedar negativo si se registra más consumo del que había: es la señal de que falta un ajuste.
  stock_g numeric(12,2) not null default 0,
  cost_per_kg numeric(10,2) not null default 0 check (cost_per_kg >= 0),
  low_stock_g numeric(12,2) not null default 200 check (low_stock_g >= 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists filaments_user_idx on public.filaments (user_id);

-- Canales de venta con sus comisiones (Mercado Libre, TikTok Shop, venta directa, …).
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  commission_pct numeric(6,2) not null default 0 check (commission_pct >= 0 and commission_pct < 100),
  fixed_fee numeric(10,2) not null default 0 check (fixed_fee >= 0),
  shipping_cost numeric(10,2) not null default 0 check (shipping_cost >= 0),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists channels_user_idx on public.channels (user_id);

-- Material de embalaje (cajas, sobres, bolsas…) con medidas y costo por unidad.
create table if not exists public.packaging (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'box' check (kind in ('box', 'envelope', 'bag', 'other')),
  length_mm numeric(8,1) not null default 0 check (length_mm >= 0),
  width_mm numeric(8,1) not null default 0 check (width_mm >= 0),
  height_mm numeric(8,1) not null default 0 check (height_mm >= 0),
  cost numeric(10,2) not null default 0 check (cost >= 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists packaging_user_idx on public.packaging (user_id);

-- Mis archivos: modelos 3D (STL, OBJ, 3MF) e imágenes que cada usuario subió en las herramientas o en
-- la calculadora, para volver a usarlos sin buscarlos en su computadora. Los archivos viven en el
-- bucket privado "user-files".
create table if not exists public.user_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  -- Ruta dentro del bucket: <user_id>/<uuid>-<nombre>.
  path text not null unique,
  size bigint not null default 0 check (size >= 0),
  kind text not null default 'other' check (kind in ('model', 'image', 'other')),
  -- Dónde se subió: 'tools' o 'calculator'.
  app text not null default 'tools' check (app in ('tools', 'calculator')),
  created_at timestamptz not null default now()
);
create index if not exists user_files_user_idx on public.user_files (user_id, created_at desc);
-- Vista previa de los modelos 3D (una imagen chica en el mismo bucket, carpeta thumbs/).
alter table public.user_files add column if not exists thumb_path text;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  sku text not null default '',
  description text not null default '',
  -- Ruta dentro del bucket "products".
  image_path text,
  print_minutes int not null default 0 check (print_minutes >= 0),
  -- Empaque, tornillería, etc. por pieza.
  extra_cost numeric(10,2) not null default 0 check (extra_cost >= 0),
  stock int not null default 0,
  -- Receta por pieza: [{"filament_id": uuid, "grams": number}]
  filaments jsonb not null default '[]',
  printer_ids uuid[] not null default '{}',
  -- Precio de venta por canal: {"<channel_id>": number}
  prices jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists products_user_idx on public.products (user_id);
-- Embalaje con el que se envía una pieza; entra al precio "con envío".
alter table public.products add column if not exists packaging_id uuid references public.packaging (id) on delete set null;

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  printer_id uuid references public.printers (id) on delete set null,
  quantity int not null check (quantity > 0),
  -- Piezas buenas que entran a existencias; 0 mientras imprime o si falló.
  good_quantity int not null default 0 check (good_quantity >= 0),
  status text not null default 'printing' check (status in ('printing', 'done', 'failed')),
  minutes int not null default 0 check (minutes >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check (good_quantity <= quantity),
  check (status = 'done' or good_quantity = 0)
);
create index if not exists print_jobs_user_idx on public.print_jobs (user_id, created_at desc);
create index if not exists print_jobs_created_at_idx on public.print_jobs (created_at);

create table if not exists public.print_job_filaments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.print_jobs (id) on delete cascade,
  filament_id uuid references public.filaments (id) on delete set null,
  filament_name text not null,
  grams numeric(12,2) not null check (grams >= 0),
  -- Costo del filamento al momento de imprimir.
  cost numeric(12,2) not null default 0
);
create index if not exists print_job_filaments_job_idx on public.print_job_filaments (job_id);
create index if not exists print_job_filaments_user_idx on public.print_job_filaments (user_id);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  channel_id uuid references public.channels (id) on delete set null,
  channel_name text not null default '',
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  -- Comisiones del canal por toda la venta.
  fees numeric(12,2) not null default 0 check (fees >= 0),
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  -- Costo de producción por pieza al momento de vender.
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  -- Embalaje usado en esta venta (0 si no se envió).
  packaging_cost numeric(12,2) not null default 0 check (packaging_cost >= 0),
  profit numeric(12,2) generated always as (quantity * unit_price - fees - shipping_cost - packaging_cost - quantity * unit_cost) stored,
  notes text not null default '',
  sold_at timestamptz not null default now()
);
create index if not exists sales_user_idx on public.sales (user_id, sold_at desc);
create index if not exists sales_sold_at_idx on public.sales (sold_at);

-- Bases creadas antes del embalaje: agrega la columna y recalcula la ganancia con ella.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'sales' and column_name = 'packaging_cost') then
    alter table public.sales add column packaging_cost numeric(12,2) not null default 0 check (packaging_cost >= 0);
    alter table public.sales drop column profit;
    alter table public.sales add column profit numeric(12,2)
      generated always as (quantity * unit_price - fees - shipping_cost - packaging_cost - quantity * unit_cost) stored;
  end if;
end $$;

create table if not exists public.maintenance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  printer_id uuid not null references public.printers (id) on delete cascade,
  kind text not null default 'maintenance' check (kind in ('maintenance', 'adjustment', 'repair')),
  title text not null,
  notes text not null default '',
  cost numeric(12,2) not null default 0 check (cost >= 0),
  performed_at date not null default current_date,
  next_due date,
  created_at timestamptz not null default now()
);
create index if not exists maintenance_user_idx on public.maintenance (user_id, performed_at desc);

-- Todo el dinero que sale. Una compra de filamento es un gasto con filament_id y grams;
-- un mantenimiento con costo crea su gasto (maintenance_id).
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null default 'other'
    check (category in ('filament', 'parts', 'electricity', 'shipping', 'packaging', 'maintenance', 'other')),
  amount numeric(12,2) not null check (amount >= 0),
  note text not null default '',
  spent_at date not null default current_date,
  supplier_id uuid references public.suppliers (id) on delete set null,
  printer_id uuid references public.printers (id) on delete set null,
  filament_id uuid references public.filaments (id) on delete set null,
  grams numeric(12,2) check (grams > 0),
  maintenance_id uuid references public.maintenance (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists expenses_user_idx on public.expenses (user_id, spent_at desc);

-- ───────────────────────── Seguridad (RLS) ─────────────────────────

alter table public.profiles enable row level security;
alter table public.activity_days enable row level security; -- sin políticas: solo la escribe touch()

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- El usuario solo puede cambiar sus ajustes; el correo y las fechas los pone el servidor.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name, business_name, kwh_price, margin_pct) on public.profiles to authenticated;
revoke all on public.activity_days from anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['suppliers', 'printers', 'filaments', 'channels', 'products', 'print_jobs',
                           'print_job_filaments', 'sales', 'maintenance', 'expenses', 'packaging', 'user_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ───────────────────────── Alta de usuario y actividad ─────────────────────────

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;

  -- Comisiones de arranque: son aproximadas y cada usuario las ajusta en "Canales de venta".
  insert into public.channels (user_id, name, commission_pct, sort) values
    (new.id, 'Mercado Libre', 15, 1),
    (new.id, 'TikTok Shop', 8, 2),
    (new.id, 'Venta directa', 0, 3);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cuentas creadas antes de ejecutar este archivo: les da su perfil y sus canales de arranque.
insert into public.profiles (id, email, name)
select u.id, coalesce(u.email, ''), coalesce(u.raw_user_meta_data ->> 'name', '')
from auth.users u
on conflict (id) do nothing;

insert into public.channels (user_id, name, commission_pct, sort)
select u.id, c.name, c.commission_pct, c.sort
from auth.users u
cross join (values ('Mercado Libre', 15, 1), ('TikTok Shop', 8, 2), ('Venta directa', 0, 3)) as c (name, commission_pct, sort)
where not exists (select 1 from public.channels x where x.user_id = u.id);
-- La app la llama al abrirse: marca la última visita y el día activo.
create or replace function public.touch() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;
  update public.profiles set last_seen_at = now() where id = v_user;
  insert into public.activity_days (user_id, day)
  values (v_user, (now() at time zone 'America/Mexico_City')::date)
  on conflict do nothing;
end $$;
revoke execute on function public.touch() from public, anon;
grant execute on function public.touch() to authenticated;

-- ───────────────────────── Existencias (triggers) ─────────────────────────
-- Corren con los permisos del usuario, así que RLS impide tocar existencias ajenas.

-- Filamento consumido por una impresión.
create or replace function public.job_filament_moves_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' and old.filament_id is not null then
    update public.filaments set stock_g = stock_g + old.grams where id = old.filament_id;
  end if;
  if tg_op <> 'DELETE' and new.filament_id is not null then
    update public.filaments set stock_g = stock_g - new.grams where id = new.filament_id;
  end if;
  return null;
end $$;

create or replace trigger job_filament_moves_stock
  after insert or update or delete on public.print_job_filaments
  for each row execute function public.job_filament_moves_stock();

-- Piezas buenas que entran a existencias y minutos que acumula la impresora.
create or replace function public.print_job_moves_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    update public.products set stock = stock - old.good_quantity where id = old.product_id;
    update public.printers set print_minutes = print_minutes - old.minutes where id = old.printer_id;
  end if;
  if tg_op <> 'DELETE' then
    update public.products set stock = stock + new.good_quantity where id = new.product_id;
    update public.printers set print_minutes = print_minutes + new.minutes where id = new.printer_id;
  end if;
  return null;
end $$;

create or replace trigger print_job_moves_stock
  after insert or update or delete on public.print_jobs
  for each row execute function public.print_job_moves_stock();

-- Piezas que salen al vender.
create or replace function public.sale_moves_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    update public.products set stock = stock + old.quantity where id = old.product_id;
  end if;
  if tg_op <> 'DELETE' then
    update public.products set stock = stock - new.quantity where id = new.product_id;
  end if;
  return null;
end $$;

create or replace trigger sale_moves_stock
  after insert or update or delete on public.sales
  for each row execute function public.sale_moves_stock();

-- Compra de filamento: suma los gramos y recalcula el costo real por gramo con todas las compras
-- (total pagado ÷ gramos comprados). El costo por kg que escribe el usuario queda como referencia.
create or replace function public.expense_moves_filament() returns trigger
language plpgsql set search_path = '' as $$
declare
  touched uuid[] := '{}';
begin
  if tg_op = 'UPDATE'
     and (old.filament_id, old.grams, old.amount) is not distinct from (new.filament_id, new.grams, new.amount) then
    return null;
  end if;
  if tg_op <> 'INSERT' and old.filament_id is not null and old.grams is not null then
    update public.filaments set stock_g = stock_g - old.grams where id = old.filament_id;
    touched := touched || old.filament_id;
  end if;
  if tg_op <> 'DELETE' and new.filament_id is not null and new.grams is not null then
    update public.filaments set stock_g = stock_g + new.grams where id = new.filament_id;
    touched := touched || new.filament_id;
  end if;
  update public.filaments f set avg_cost_per_g = coalesce((
      select sum(e.amount) / nullif(sum(e.grams), 0) from public.expenses e where e.filament_id = f.id and e.grams is not null
    ), 0)
  where f.id = any(touched);
  return null;
end $$;

create or replace trigger expense_moves_filament
  after insert or update or delete on public.expenses
  for each row execute function public.expense_moves_filament();

-- Un mantenimiento con costo también es un gasto; se borra junto con el mantenimiento.
create or replace function public.maintenance_adds_expense() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.cost > 0 then
    insert into public.expenses (user_id, category, amount, note, spent_at, printer_id, maintenance_id)
    values (new.user_id, 'maintenance', new.cost, new.title, new.performed_at, new.printer_id, new.id);
  end if;
  return null;
end $$;

create or replace trigger maintenance_adds_expense
  after insert on public.maintenance
  for each row execute function public.maintenance_adds_expense();

-- ───────────────────────── Impresiones ─────────────────────────

-- Crea (p_id null) o corrige una impresión junto con su consumo de filamento, en una sola
-- transacción. p_filaments: [{"filament_id": uuid, "grams": number}]
create or replace function public.save_print(
  p_id uuid,
  p_product uuid,
  p_name text,
  p_printer uuid,
  p_quantity int,
  p_good int,
  p_status text,
  p_minutes int,
  p_notes text,
  p_filaments jsonb
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  if p_id is null then
    insert into public.print_jobs (product_id, product_name, printer_id, quantity, good_quantity, status, minutes, notes, finished_at)
    values (p_product, p_name, p_printer, p_quantity, p_good, p_status, p_minutes, coalesce(p_notes, ''),
            case when p_status <> 'printing' then now() end)
    returning id into v_id;
  else
    update public.print_jobs set
      product_id = p_product,
      product_name = p_name,
      printer_id = p_printer,
      quantity = p_quantity,
      good_quantity = p_good,
      status = p_status,
      minutes = p_minutes,
      notes = coalesce(p_notes, ''),
      finished_at = case when p_status = 'printing' then null else coalesce(finished_at, now()) end
    where id = p_id;
    if not found then
      raise exception 'No se encontró la impresión.';
    end if;
    -- El consumo de filamentos ya borrados se conserva como historial.
    delete from public.print_job_filaments where job_id = p_id and filament_id is not null;
  end if;

  insert into public.print_job_filaments (job_id, filament_id, filament_name, grams, cost)
  select v_id, f.id, concat_ws(' ', f.material, nullif(f.color, ''), nullif(f.brand, '')),
         x.grams, round(x.grams * f.cost_per_kg / 1000, 2)
  from jsonb_to_recordset(coalesce(p_filaments, '[]'::jsonb)) as x (filament_id uuid, grams numeric)
  join public.filaments f on f.id = x.filament_id
  where x.grams > 0;

  return v_id;
end $$;
revoke execute on function public.save_print(uuid, uuid, text, uuid, int, int, text, int, text, jsonb) from public, anon;
grant execute on function public.save_print(uuid, uuid, text, uuid, int, int, text, int, text, jsonb) to authenticated;

-- ───────────────────────── Imágenes de producto ─────────────────────────
-- Bucket público (las URL no se pueden adivinar); cada usuario solo escribe en su carpeta <user_id>/.

insert into storage.buckets (id, name, public) values ('products', 'products', true)
on conflict (id) do nothing;

drop policy if exists kubbo_products_own_folder on storage.objects;
create policy kubbo_products_own_folder on storage.objects for all to authenticated
  using (bucket_id = 'products' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'products' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Mis archivos: bucket privado, cada usuario solo lee y escribe en su carpeta <user_id>/.
insert into storage.buckets (id, name, public) values ('user-files', 'user-files', false)
on conflict (id) do nothing;

drop policy if exists kubbo_user_files_own_folder on storage.objects;
create policy kubbo_user_files_own_folder on storage.objects for all to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────────────────────── Herramientas 3D ─────────────────────────
-- Cada vez que alguien usa una herramienta del sitio kubbo3d-tools (misma cuenta que la calculadora).

create table if not exists public.tool_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool text not null check (char_length(tool) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists tool_runs_created_at_idx on public.tool_runs (created_at);
create index if not exists tool_runs_user_idx on public.tool_runs (user_id);

alter table public.tool_runs enable row level security;
revoke all on public.tool_runs from anon;
revoke update, delete on public.tool_runs from authenticated;
drop policy if exists tool_runs_insert_own on public.tool_runs;
create policy tool_runs_insert_own on public.tool_runs for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists tool_runs_select_own on public.tool_runs;
create policy tool_runs_select_own on public.tool_runs for select to authenticated using (user_id = (select auth.uid()));

-- ───────────────────────── Dashboard (solo service_role) ─────────────────────────

create or replace function public.admin_overview() returns jsonb
language sql stable set search_path = '' as $$
  with t as (select (now() at time zone 'America/Mexico_City')::date as today)
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'users_today', (select count(*) from public.profiles p where (p.created_at at time zone 'America/Mexico_City')::date = t.today),
    'users_7d', (select count(*) from public.profiles p where (p.created_at at time zone 'America/Mexico_City')::date > t.today - 7),
    'dau', (select count(*) from public.activity_days a where a.day = t.today),
    'wau', (select count(distinct a.user_id) from public.activity_days a where a.day > t.today - 7),
    'mau', (select count(distinct a.user_id) from public.activity_days a where a.day > t.today - 30),
    'users_with_product', (select count(distinct user_id) from public.products),
    'users_with_print', (select count(distinct user_id) from public.print_jobs),
    'users_with_sale', (select count(distinct user_id) from public.sales),
    'products', (select count(*) from public.products),
    'printers', (select count(*) from public.printers),
    'filaments', (select count(*) from public.filaments),
    'suppliers', (select count(*) from public.suppliers),
    'print_jobs', (select count(*) from public.print_jobs),
    'print_jobs_failed', (select count(*) from public.print_jobs where status = 'failed'),
    'sales', (select count(*) from public.sales),
    'pieces_sold', (select coalesce(sum(quantity), 0) from public.sales),
    'expenses', (select count(*) from public.expenses),
    'maintenance', (select count(*) from public.maintenance),
    'grams_printed', (select coalesce(sum(grams), 0) from public.print_job_filaments),
    'tool_runs', (select count(*) from public.tool_runs),
    'tool_runs_30d', (select count(*) from public.tool_runs r where (r.created_at at time zone 'America/Mexico_City')::date > t.today - 30),
    'tool_users', (select count(distinct user_id) from public.tool_runs),
    'top_tool', (select r.tool from public.tool_runs r group by r.tool order by count(*) desc limit 1)
  )
  from t
$$;

create or replace function public.admin_daily(p_days int default 30)
returns table (day date, signups bigint, active bigint, prints bigint, sales bigint, grams numeric)
language sql stable set search_path = '' as $$
  select
    d.day::date,
    (select count(*) from public.profiles p where (p.created_at at time zone 'America/Mexico_City')::date = d.day),
    (select count(*) from public.activity_days a where a.day = d.day),
    (select count(*) from public.print_jobs j where (j.created_at at time zone 'America/Mexico_City')::date = d.day),
    (select count(*) from public.sales s where (s.sold_at at time zone 'America/Mexico_City')::date = d.day),
    (select coalesce(sum(f.grams), 0)
       from public.print_job_filaments f join public.print_jobs j on j.id = f.job_id
      where (j.created_at at time zone 'America/Mexico_City')::date = d.day)
  from (
    select generate_series(
      ((now() at time zone 'America/Mexico_City')::date - (least(greatest(p_days, 1), 365) - 1))::timestamp,
      (now() at time zone 'America/Mexico_City')::date::timestamp,
      interval '1 day'
    )::date as day
  ) d
  order by 1
$$;

revoke execute on function public.admin_overview() from public, anon, authenticated;
revoke execute on function public.admin_daily(int) from public, anon, authenticated;
grant execute on function public.admin_overview() to service_role;
grant execute on function public.admin_daily(int) to service_role;

-- Una fila por usuario con su uso. security_invoker: aunque alguien llegara a leerla, RLS aplica.
create or replace view public.admin_users with (security_invoker = true) as
select
  p.id,
  p.email,
  p.name,
  p.business_name,
  p.created_at,
  p.last_seen_at,
  (select count(*) from public.activity_days a
    where a.user_id = p.id and a.day > (now() at time zone 'America/Mexico_City')::date - 30) as active_days_30,
  (select count(*) from public.products x where x.user_id = p.id) as products,
  (select count(*) from public.printers x where x.user_id = p.id) as printers,
  (select count(*) from public.filaments x where x.user_id = p.id) as filaments,
  (select count(*) from public.print_jobs x where x.user_id = p.id) as print_jobs,
  (select count(*) from public.sales x where x.user_id = p.id) as sales,
  (select coalesce(sum(x.grams), 0) from public.print_job_filaments x where x.user_id = p.id) as grams_printed,
  (select count(*) from public.tool_runs x where x.user_id = p.id) as tool_runs
from public.profiles p;

revoke all on public.admin_users from anon, authenticated;

-- ───────────────────────── Tienda en línea de Kubbo ─────────────────────────
-- Catálogo propio (impresiones, filamentos, impresoras…). Lo administra el dashboard con la
-- clave secreta; el sitio público solo lee lo activo y crea pedidos con place_order().

create table if not exists public.store_settings (
  id int primary key default 1 check (id = 1),
  shipping_flat numeric(10,2) not null default 0 check (shipping_flat >= 0),
  -- Subtotal desde el que el envío es gratis; null = nunca.
  free_shipping_from numeric(10,2) check (free_shipping_from >= 0),
  -- Texto que ve el cliente al terminar su pedido (datos de transferencia, etc.).
  payment_instructions text not null default '',
  -- Solo dígitos, con lada de país (52…): con él se arma el enlace de WhatsApp.
  whatsapp text not null default '',
  contact_email text not null default ''
);
insert into public.store_settings (id) values (1) on conflict do nothing;

create table if not exists public.store_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort int not null default 0
);

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.store_categories (id) on delete set null,
  name text not null,
  slug text not null unique,
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  -- Precio anterior, para mostrarlo tachado.
  compare_price numeric(12,2) check (compare_price >= 0),
  stock int not null default 0 check (stock >= 0),
  -- URL públicas; la primera es la portada.
  images text[] not null default '{}',
  active boolean not null default false,
  featured boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists store_products_category_idx on public.store_products (category_id);

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  -- Cuenta con la que se hizo el pedido, si el cliente había iniciado sesión.
  user_id uuid references auth.users (id) on delete set null,
  customer_name text not null,
  email text not null,
  phone text not null,
  address text not null,
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  tracking text not null default '',
  subtotal numeric(12,2) not null default 0,
  shipping numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
-- Pago de Mercado Pago que liquidó el pedido; los escribe el webhook del sitio.
alter table public.store_orders add column if not exists payment_id text;
alter table public.store_orders add column if not exists paid_at timestamptz;
create index if not exists store_orders_created_at_idx on public.store_orders (created_at desc);
create index if not exists store_orders_user_idx on public.store_orders (user_id);

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders (id) on delete cascade,
  product_id uuid references public.store_products (id) on delete set null,
  name text not null,
  unit_price numeric(12,2) not null,
  quantity int not null check (quantity > 0)
);
create index if not exists store_order_items_order_idx on public.store_order_items (order_id);

alter table public.store_settings enable row level security;
alter table public.store_categories enable row level security;
alter table public.store_products enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;

revoke insert, update, delete on public.store_settings, public.store_categories, public.store_products,
  public.store_orders, public.store_order_items from anon, authenticated;

drop policy if exists store_settings_read on public.store_settings;
create policy store_settings_read on public.store_settings for select to anon, authenticated using (true);
drop policy if exists store_categories_read on public.store_categories;
create policy store_categories_read on public.store_categories for select to anon, authenticated using (true);
drop policy if exists store_products_read on public.store_products;
create policy store_products_read on public.store_products for select to anon, authenticated using (active);
drop policy if exists store_orders_own on public.store_orders;
create policy store_orders_own on public.store_orders for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists store_order_items_own on public.store_order_items;
create policy store_order_items_own on public.store_order_items for select to authenticated
  using (exists (select 1 from public.store_orders o where o.id = order_id and o.user_id = (select auth.uid())));

-- Crea un pedido. Los precios y el envío salen de la base de datos, nunca del navegador, y las
-- existencias se apartan en la misma transacción.
--   p_customer: {"name","email","phone","address","city","state","postal_code","notes"}
--   p_items:    [{"product_id": uuid, "quantity": int}]
create or replace function public.place_order(p_customer jsonb, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid;
  v_number bigint;
  v_subtotal numeric(12,2) := 0;
  v_shipping numeric(12,2);
  v_settings public.store_settings;
  v_product public.store_products;
  v_item record;
  v_name text := btrim(coalesce(p_customer ->> 'name', ''));
  v_email text := btrim(coalesce(p_customer ->> 'email', ''));
  v_phone text := btrim(coalesce(p_customer ->> 'phone', ''));
  v_address text := btrim(coalesce(p_customer ->> 'address', ''));
begin
  if v_name = '' or v_phone = '' or v_address = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Completa tu nombre, correo, teléfono y dirección.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Tu carrito está vacío.';
  end if;

  insert into public.store_orders (user_id, customer_name, email, phone, address, city, state, postal_code, notes)
  values (auth.uid(), left(v_name, 120), left(v_email, 200), left(v_phone, 30), left(v_address, 300),
          left(btrim(coalesce(p_customer ->> 'city', '')), 80), left(btrim(coalesce(p_customer ->> 'state', '')), 80),
          left(btrim(coalesce(p_customer ->> 'postal_code', '')), 10), left(btrim(coalesce(p_customer ->> 'notes', '')), 500))
  returning id, number into v_order, v_number;

  for v_item in
    select x.product_id, sum(x.quantity)::int as quantity
    from jsonb_to_recordset(p_items) as x (product_id uuid, quantity int)
    group by x.product_id
    order by x.product_id -- mismo orden siempre: dos pedidos simultáneos no se bloquean entre sí
  loop
    if v_item.quantity is null or v_item.quantity < 1 then
      raise exception 'Cantidad inválida.';
    end if;
    select * into v_product from public.store_products where id = v_item.product_id and active for update;
    if not found then
      raise exception 'Uno de los productos de tu carrito ya no está disponible.';
    end if;
    if v_product.stock < v_item.quantity then
      raise exception 'Solo quedan % piezas de "%".', v_product.stock, v_product.name;
    end if;
    update public.store_products set stock = stock - v_item.quantity where id = v_product.id;
    insert into public.store_order_items (order_id, product_id, name, unit_price, quantity)
    values (v_order, v_product.id, v_product.name, v_product.price, v_item.quantity);
    v_subtotal := v_subtotal + v_product.price * v_item.quantity;
  end loop;

  select * into v_settings from public.store_settings where id = 1;
  v_shipping := case
    when v_settings.free_shipping_from is not null and v_subtotal >= v_settings.free_shipping_from then 0
    else v_settings.shipping_flat
  end;
  update public.store_orders set subtotal = v_subtotal, shipping = v_shipping, total = v_subtotal + v_shipping
  where id = v_order;

  -- El id (imposible de adivinar) es lo que el sitio usa después para cobrar este pedido.
  return jsonb_build_object('id', v_order, 'number', v_number, 'subtotal', v_subtotal, 'shipping', v_shipping,
                            'total', v_subtotal + v_shipping);
end $$;
revoke execute on function public.place_order(jsonb, jsonb) from public;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated;

-- Cancelar un pedido regresa sus piezas a existencias; reactivarlo las vuelve a apartar.
create or replace function public.store_order_status_moves_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (old.status = 'cancelled') <> (new.status = 'cancelled') then
    update public.store_products p
    set stock = greatest(p.stock + case when new.status = 'cancelled' then i.quantity else -i.quantity end, 0)
    from public.store_order_items i
    where i.order_id = new.id and p.id = i.product_id;
  end if;
  return null;
end $$;

create or replace trigger store_order_status_moves_stock
  after update of status on public.store_orders
  for each row execute function public.store_order_status_moves_stock();

-- Fotos de la tienda: bucket público; solo el dashboard (clave secreta) puede subir.
insert into storage.buckets (id, name, public) values ('store', 'store', true)
on conflict (id) do nothing;
-- ───────────────────────── Planes y suscripciones ─────────────────────────
-- Los planes se cobran con Mercado Pago (suscripción mensual) desde la landing. Los límites se revisan
-- aquí mismo, en la base de datos, así valen igual en la calculadora web, la app y las herramientas.

create table if not exists public.plans (
  id text primary key,
  name text not null,
  -- Precio que se anuncia, en dólares. Mercado Pago cobra en pesos: la landing lo convierte.
  price_usd numeric(10,2) not null default 0 check (price_usd >= 0),
  tagline text not null default '',
  sort int not null default 0,
  -- Límites; vacío (null) = sin límite.
  max_products int check (max_products >= 0),
  max_printers int check (max_printers >= 0),
  tool_runs_month int check (tool_runs_month >= 0),
  storage_mb int check (storage_mb >= 0),
  -- Descargas con colores (3MF/OBJ) en las herramientas.
  color_export boolean not null default false,
  -- Lo que se lista en la tarjeta del plan, además de los límites.
  features text[] not null default '{}',
  highlighted boolean not null default false,
  active boolean not null default true
);

-- Solo se insertan si no existen: lo que cambies después en Supabase no se pisa al volver a correr esto.
insert into public.plans (id, name, price_usd, tagline, sort, max_products, max_printers, tool_runs_month, storage_mb, color_export, features, highlighted)
values
  ('free', 'Gratis', 0, 'Para probar y para tu primer impresora', 0, 15, 2, 10, 500, false,
    array['Calculadora en la web y en la app', 'Costos, precios por canal y ganancias', 'Todas las herramientas 3D', 'Soporte por correo'], false),
  ('maker', 'Maker', 25, 'Para quien ya vende sus piezas', 1, 150, 5, 150, 5120, true,
    array['Todo lo de Gratis', 'Inventario de filamento y productos', 'Ventas, gastos y mantenimiento', 'Descargas con colores para tu laminador'], false),
  ('taller', 'Taller', 49, 'Para un taller con varias impresoras', 2, null, 15, 600, 20480, true,
    array['Todo lo de Maker', 'Soporte prioritario'], true),
  ('fabrica', 'Fábrica', 99, 'Para una granja de impresoras', 3, null, null, null, 102400, true,
    array['Todo lo de Taller', 'Soporte por WhatsApp', 'Una sesión de configuración de tu cuenta'], false)
on conflict (id) do nothing;

alter table public.plans enable row level security;
revoke insert, update, delete on public.plans from anon, authenticated;
drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select to anon, authenticated using (active);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  -- La suscripción ("preapproval") en Mercado Pago.
  mp_preapproval_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  amount numeric(12,2) not null default 0,
  currency text not null default 'MXN',
  payer_email text not null default '',
  -- Hasta cuándo está pagado: al cancelar, el plan sigue hasta esta fecha.
  paid_until timestamptz,
  next_payment_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, created_at desc);

-- Solo la landing (con la llave secreta) escribe aquí, a partir de lo que dice Mercado Pago.
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon;
revoke insert, update, delete on public.subscriptions from authenticated;
drop policy if exists subscriptions_own on public.subscriptions;
create policy subscriptions_own on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));

-- El plan vigente de un usuario: el de su suscripción activa (o pagada hasta hoy), si no, Gratis.
create or replace function public.plan_of(uid uuid) returns public.plans
language sql stable security definer set search_path = public as $$
  select p.* from public.plans p
  where p.id = coalesce(
    (select s.plan_id from public.subscriptions s
      where s.user_id = uid and (s.status = 'authorized' or s.paid_until > now())
      order by s.created_at desc limit 1),
    'free');
$$;
revoke execute on function public.plan_of(uuid) from public, anon, authenticated;

-- Productos, impresoras y archivos de más se rechazan con un mensaje para el usuario.
create or replace function public.enforce_plan_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  plan public.plans;
  used bigint;
  cap int;
  what text;
begin
  plan := public.plan_of(new.user_id);
  if plan.id is null then
    return new;
  end if;
  if tg_table_name = 'user_files' then
    if plan.storage_mb is not null
      and (select coalesce(sum(size), 0) from public.user_files where user_id = new.user_id) + new.size > plan.storage_mb::bigint * 1048576 then
      raise exception using errcode = 'P0001', message = format(
        'Tu plan %s incluye %s MB en Mis archivos y este archivo ya no cabe. Borra archivos que no uses o mejora tu plan en la página de precios de Kubbo3D.',
        plan.name, plan.storage_mb);
    end if;
    return new;
  end if;
  if tg_table_name = 'products' then
    cap := plan.max_products;
    what := 'productos';
    if cap is not null then
      select count(*) into used from public.products where user_id = new.user_id;
    end if;
  else
    cap := plan.max_printers;
    what := 'impresoras';
    if cap is not null then
      select count(*) into used from public.printers where user_id = new.user_id;
    end if;
  end if;
  if cap is not null and used >= cap then
    raise exception using errcode = 'P0001', message = format(
      'Tu plan %s permite hasta %s %s. Mejora tu plan en la página de precios de Kubbo3D para agregar más.', plan.name, cap, what);
  end if;
  return new;
end;
$$;

drop trigger if exists products_plan_limit on public.products;
create trigger products_plan_limit before insert on public.products for each row execute function public.enforce_plan_limits();
drop trigger if exists printers_plan_limit on public.printers;
create trigger printers_plan_limit before insert on public.printers for each row execute function public.enforce_plan_limits();
drop trigger if exists user_files_plan_limit on public.user_files;
create trigger user_files_plan_limit before insert on public.user_files for each row execute function public.enforce_plan_limits();

-- Plan, suscripción y uso del usuario que llama: para "Mi plan" y para revisar antes de usar una herramienta.
create or replace function public.my_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', to_jsonb(p),
    'subscription', (
      select to_jsonb(s) - 'user_id' from public.subscriptions s
      where s.user_id = auth.uid() and s.status <> 'pending'
      order by s.created_at desc limit 1),
    'usage', jsonb_build_object(
      'products', (select count(*) from public.products where user_id = auth.uid()),
      'printers', (select count(*) from public.printers where user_id = auth.uid()),
      'tool_runs_month', (
        select count(*) from public.tool_runs
        where user_id = auth.uid()
          and created_at >= (date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City')),
      'storage_mb', round((select coalesce(sum(size), 0) from public.user_files where user_id = auth.uid()) / 1048576.0, 1)))
  from public.plan_of(auth.uid()) p
  where auth.uid() is not null;
$$;
revoke execute on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- ───────────────────────── Reportes de problemas ─────────────────────────
-- El botón "Reportar un problema" de las herramientas (y después de los otros sitios) guarda aquí lo que
-- escribe el usuario más el contexto de lo que estaba haciendo. Solo el panel admin los lee.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  email text not null default '' check (char_length(email) <= 200),
  app text not null default 'tools' check (app in ('tools', 'calculator', 'landing', 'mobile')),
  -- Página donde estaba (por ejemplo /partir).
  page text not null default '' check (char_length(page) <= 300),
  message text not null check (char_length(message) between 5 and 5000),
  -- Herramienta, archivo, ajustes, último error, navegador…
  context jsonb not null default '{}',
  -- Captura opcional, en el bucket privado bug-reports.
  screenshot_path text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'fixed', 'dismissed')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bug_reports_created_idx on public.bug_reports (created_at desc);
create index if not exists bug_reports_status_idx on public.bug_reports (status, created_at desc);

alter table public.bug_reports enable row level security;
revoke all on public.bug_reports from anon;
revoke update, delete on public.bug_reports from authenticated;
drop policy if exists bug_reports_insert_own on public.bug_reports;
create policy bug_reports_insert_own on public.bug_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new' and admin_note = '');
drop policy if exists bug_reports_select_own on public.bug_reports;
create policy bug_reports_select_own on public.bug_reports for select to authenticated using (user_id = (select auth.uid()));

-- Hasta 10 reportes por hora por persona, para que nadie llene la bandeja por error (o a propósito).
create or replace function public.bug_reports_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.bug_reports where user_id = new.user_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception using errcode = 'P0001', message = 'Ya enviaste varios reportes en la última hora. Espera un poco antes de mandar otro.';
  end if;
  return new;
end;
$$;
drop trigger if exists bug_reports_rate_limit on public.bug_reports;
create trigger bug_reports_rate_limit before insert on public.bug_reports for each row execute function public.bug_reports_rate_limit();

-- Capturas: cada quien sube a su carpeta; nadie más que el panel admin (llave secreta) las ve.
insert into storage.buckets (id, name, public) values ('bug-reports', 'bug-reports', false)
on conflict (id) do nothing;
drop policy if exists kubbo_bug_reports_upload on storage.objects;
create policy kubbo_bug_reports_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'bug-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────────────────────── Inventario ─────────────────────────
-- Materia prima (filamento y otros materiales) y productos terminados. Las existencias se mueven
-- solas: compras (gastos), impresiones, ventas y ajustes de conteo.

-- Otros materiales además del filamento: resina, imanes, tornillos, pintura… con su unidad.
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null default '',
  unit text not null default 'pza' check (unit in ('g', 'ml', 'pza')),
  -- Lo mantienen las compras y los ajustes.
  stock numeric(14,3) not null default 0,
  -- Costo promedio por unidad (por gramo, mililitro o pieza).
  cost_per_unit numeric(14,4) not null default 0 check (cost_per_unit >= 0),
  low_stock numeric(14,3) not null default 0 check (low_stock >= 0),
  supplier_id uuid references public.suppliers (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists materials_user_idx on public.materials (user_id);
alter table public.materials enable row level security;
drop policy if exists own_rows on public.materials;
create policy own_rows on public.materials for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- La compra de un material es un gasto (como la del filamento) que suma existencia.
alter table public.expenses add column if not exists material_id uuid references public.materials (id) on delete set null;
alter table public.expenses add column if not exists quantity numeric(14,3) check (quantity > 0);

-- Costo real por gramo / unidad: total pagado ÷ cantidad comprada en todas las compras. El costo que
-- escribe el usuario (cost_per_kg, cost_per_unit) es su referencia de lo que normalmente cuesta.
alter table public.filaments add column if not exists avg_cost_per_g numeric(14,6) not null default 0;
alter table public.materials add column if not exists avg_cost_per_unit numeric(14,6) not null default 0;
update public.filaments f set avg_cost_per_g = coalesce((
    select sum(e.amount) / nullif(sum(e.grams), 0) from public.expenses e where e.filament_id = f.id and e.grams is not null
  ), 0);
update public.materials m set avg_cost_per_unit = coalesce((
    select sum(e.amount) / nullif(sum(e.quantity), 0) from public.expenses e where e.material_id = m.id and e.quantity is not null
  ), 0);
do $$
begin
  alter table public.expenses drop constraint if exists expenses_category_check;
  alter table public.expenses add constraint expenses_category_check
    check (category in ('filament', 'material', 'parts', 'electricity', 'shipping', 'packaging', 'maintenance', 'other'));
end $$;

-- Compra de material: suma la cantidad y recalcula el costo real por unidad con todas las compras.
create or replace function public.expense_moves_material() returns trigger
language plpgsql set search_path = '' as $$
declare
  touched uuid[] := '{}';
begin
  if tg_op = 'UPDATE'
     and (old.material_id, old.quantity, old.amount) is not distinct from (new.material_id, new.quantity, new.amount) then
    return null;
  end if;
  if tg_op <> 'INSERT' and old.material_id is not null and old.quantity is not null then
    update public.materials set stock = stock - old.quantity where id = old.material_id;
    touched := touched || old.material_id;
  end if;
  if tg_op <> 'DELETE' and new.material_id is not null and new.quantity is not null then
    update public.materials set stock = stock + new.quantity where id = new.material_id;
    touched := touched || new.material_id;
  end if;
  update public.materials m set avg_cost_per_unit = coalesce((
      select sum(e.amount) / nullif(sum(e.quantity), 0) from public.expenses e where e.material_id = m.id and e.quantity is not null
    ), 0)
  where m.id = any(touched);
  return null;
end $$;

create or replace trigger expense_moves_material
  after insert or update or delete on public.expenses
  for each row execute function public.expense_moves_material();

-- Ajustes de conteo: lo que se corrige a mano en cualquier existencia (positivo entra, negativo sale).
create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('filament', 'material', 'product')),
  item_id uuid not null,
  delta numeric(14,3) not null check (delta <> 0),
  note text not null default '',
  moved_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists inventory_adjustments_item_idx on public.inventory_adjustments (user_id, item_type, item_id);
alter table public.inventory_adjustments enable row level security;
drop policy if exists own_rows on public.inventory_adjustments;
create policy own_rows on public.inventory_adjustments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.apply_adjustment(kind text, item uuid, change numeric) returns void
language plpgsql set search_path = '' as $$
begin
  if kind = 'filament' then
    update public.filaments set stock_g = stock_g + change where id = item;
  elsif kind = 'material' then
    update public.materials set stock = stock + change where id = item;
  else
    if change <> trunc(change) then
      raise exception using errcode = 'P0001', message = 'Los productos se cuentan en piezas enteras.';
    end if;
    update public.products set stock = stock + change::int where id = item;
  end if;
end $$;
revoke execute on function public.apply_adjustment(text, uuid, numeric) from public, anon;
grant execute on function public.apply_adjustment(text, uuid, numeric) to authenticated;

create or replace function public.adjustment_moves_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    perform public.apply_adjustment(old.item_type, old.item_id, -old.delta);
  end if;
  if tg_op <> 'DELETE' then
    perform public.apply_adjustment(new.item_type, new.item_id, new.delta);
  end if;
  return null;
end $$;

create or replace trigger adjustment_moves_stock
  after insert or update or delete on public.inventory_adjustments
  for each row execute function public.adjustment_moves_stock();

-- Todos los movimientos de existencias en un solo lugar (se arma con lo que ya está registrado).
-- Cantidad con signo: gramos de filamento, unidades del material o piezas del producto.
create or replace view public.inventory_moves with (security_invoker = true) as
  select e.id, 'filament'::text as item_type, e.filament_id as item_id, 'purchase'::text as kind,
         e.grams as quantity, e.amount as total, e.spent_at::timestamptz as moved_at, e.note, e.supplier_id
    from public.expenses e where e.filament_id is not null and e.grams is not null
  union all
  select e.id, 'material', e.material_id, 'purchase', e.quantity, e.amount, e.spent_at::timestamptz, e.note, e.supplier_id
    from public.expenses e where e.material_id is not null and e.quantity is not null
  union all
  select f.id, 'filament', f.filament_id, 'print', -f.grams, f.cost, j.created_at, j.product_name, null
    from public.print_job_filaments f join public.print_jobs j on j.id = f.job_id where f.filament_id is not null
  union all
  select j.id, 'product', j.product_id, 'production', j.good_quantity, null, coalesce(j.finished_at, j.created_at), j.notes, null
    from public.print_jobs j where j.product_id is not null and j.good_quantity > 0
  union all
  select s.id, 'product', s.product_id, 'sale', -s.quantity, s.quantity * s.unit_price, s.sold_at, s.channel_name, null
    from public.sales s where s.product_id is not null
  union all
  select a.id, a.item_type, a.item_id, 'adjustment', a.delta, null, a.moved_at::timestamptz, a.note, null
    from public.inventory_adjustments a;
revoke all on public.inventory_moves from anon;
grant select on public.inventory_moves to authenticated;

-- ───────────────────────── Arqueo: la existencia solo cambia con movimientos ─────────────────────────
-- Compras, impresiones, ventas y arqueos (inventory_adjustments) mueven la existencia desde sus
-- triggers. Un cambio directo (desde un formulario de editar) se rechaza: para corregir se arquea,
-- y el arqueo queda en el historial.

create or replace function public.stock_only_by_moves() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Dentro de otro trigger (una compra, una impresión, un arqueo…) sí se permite.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_table_name = 'filaments' then
    if new.stock_g is distinct from old.stock_g then
      raise exception using errcode = 'P0001',
        message = 'La existencia solo cambia con compras, impresiones o un arqueo. Usa «Arquear» para corregirla.';
    end if;
  elsif new.stock is distinct from old.stock then
    raise exception using errcode = 'P0001',
      message = 'La existencia solo cambia con compras, impresiones, ventas o un arqueo. Usa «Arquear» para corregirla.';
  end if;
  return new;
end $$;

drop trigger if exists filaments_stock_only_by_moves on public.filaments;
create trigger filaments_stock_only_by_moves before update on public.filaments
  for each row execute function public.stock_only_by_moves();
drop trigger if exists materials_stock_only_by_moves on public.materials;
create trigger materials_stock_only_by_moves before update on public.materials
  for each row execute function public.stock_only_by_moves();
drop trigger if exists products_stock_only_by_moves on public.products;
create trigger products_stock_only_by_moves before update on public.products
  for each row execute function public.stock_only_by_moves();

-- Lo que ya se tenía al dar de alta un filamento, material o producto entra como un primer arqueo
-- ("Existencia inicial"), así aparece en el historial.
create or replace function public.initial_stock_as_count() returns trigger
language plpgsql set search_path = '' as $$
declare
  initial numeric;
  kind text;
begin
  if tg_table_name = 'filaments' then
    initial := new.stock_g;
    kind := 'filament';
  elsif tg_table_name = 'materials' then
    initial := new.stock;
    kind := 'material';
  else
    initial := new.stock;
    kind := 'product';
  end if;
  if coalesce(initial, 0) = 0 then
    return null;
  end if;
  if kind = 'filament' then
    update public.filaments set stock_g = 0 where id = new.id;
  elsif kind = 'material' then
    update public.materials set stock = 0 where id = new.id;
  else
    update public.products set stock = 0 where id = new.id;
  end if;
  insert into public.inventory_adjustments (user_id, item_type, item_id, delta, note)
  values (new.user_id, kind, new.id, initial, 'Existencia inicial');
  return null;
end $$;

drop trigger if exists filaments_initial_stock on public.filaments;
create trigger filaments_initial_stock after insert on public.filaments
  for each row execute function public.initial_stock_as_count();
drop trigger if exists materials_initial_stock on public.materials;
create trigger materials_initial_stock after insert on public.materials
  for each row execute function public.initial_stock_as_count();
drop trigger if exists products_initial_stock on public.products;
create trigger products_initial_stock after insert on public.products
  for each row execute function public.initial_stock_as_count();

-- ───────────────────────── Catálogo de filamentos Kubbo ─────────────────────────
-- Filamentos precargados por Kubbo3D desde el panel admin (marca, material, color, foto, datos).
-- Al dar de alta un filamento el usuario elige uno y solo completa lo suyo (costo, proveedor…).

create table if not exists public.filament_catalog (
  id uuid primary key default gen_random_uuid(),
  brand text not null default '',
  material text not null check (char_length(material) between 1 and 60),
  -- Nombre del color como lo vende la marca: "Verde bosque", "Gris espacial"…
  color_name text not null default '',
  color_hex text not null default '#9A9AA8',
  image_url text,
  -- Peso neto de un rollo, en gramos.
  spool_g numeric(10,2) not null default 1000 check (spool_g > 0),
  -- Precio de referencia por kg en México (lo que normalmente cuesta).
  reference_price_kg numeric(10,2) not null default 0 check (reference_price_kg >= 0),
  nozzle_temp text not null default '',
  bed_temp text not null default '',
  notes text not null default '',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists filament_catalog_list_idx on public.filament_catalog (active, brand, material, color_name);

-- Todos lo leen; solo el panel admin (llave secreta) lo escribe.
alter table public.filament_catalog enable row level security;
revoke insert, update, delete on public.filament_catalog from anon, authenticated;
drop policy if exists filament_catalog_read on public.filament_catalog;
create policy filament_catalog_read on public.filament_catalog for select to anon, authenticated using (active);

-- El filamento del usuario guarda su foto y, si salió del catálogo, de cuál.
alter table public.filaments add column if not exists image_url text;
alter table public.filaments add column if not exists catalog_id uuid references public.filament_catalog (id) on delete set null;

-- Fotos del catálogo: públicas; las sube el panel admin.
insert into storage.buckets (id, name, public) values ('catalog', 'catalog', true)
on conflict (id) do nothing;
