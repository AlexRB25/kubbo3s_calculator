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
-- Impuestos que se van del precio de venta en ese canal (retenciones de IVA e ISR de la plataforma, o los
-- que pague el vendedor): se descuentan como la comisión.
alter table public.channels add column if not exists tax_pct numeric(6,2) not null default 0 check (tax_pct >= 0 and tax_pct < 100);
-- Los impuestos uno por uno: [{"name": "IVA retenido", "pct": 8, "net": true}] (net = sobre el precio sin
-- IVA, como las retenciones de Mercado Libre). tax_pct guarda su suma como parte del precio.
alter table public.channels add column if not exists taxes jsonb not null default '[]';
alter table public.channels alter column tax_pct type numeric(8,4);

-- Paqueterías: tarifas de envío por peso (y, si la paquetería lo cobra así, por precio del producto).
-- weights: límite superior de cada renglón en kg; prices: límite superior de cada columna en pesos (vacío
-- = una sola columna); rates[renglón][columna]: lo que cobra. Se cobra por el peso mayor entre el
-- físico y el volumétrico (largo × ancho × alto en cm ÷ divisor).
create table if not exists public.carriers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  divisor numeric(10,2) not null default 5000 check (divisor > 0),
  weights numeric[] not null default '{}',
  prices numeric[] not null default '{}',
  rates jsonb not null default '[]',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists carriers_user_idx on public.carriers (user_id);
alter table public.carriers enable row level security;
revoke all on public.carriers from anon;
drop policy if exists own_rows on public.carriers;
create policy own_rows on public.carriers for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Con qué paqueterías envía cada canal (Mercado Libre con su tabla, venta directa con DHL o Estafeta…).
alter table public.channels add column if not exists carrier_ids uuid[] not null default '{}';

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
-- Cuántos empaques hay (bajan uno por cada venta con envío) y cuánto pesa cada uno (para el envío).
alter table public.packaging add column if not exists stock int not null default 0;
alter table public.packaging add column if not exists weight_g numeric(10,1) not null default 0 check (weight_g >= 0);

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
-- Placas por impresora: una pieza puede salir en varias placas y cada impresora tiene las suyas.
-- [{"printer_id": uuid, "name": "Placa 1", "minutes": int, "grams": {"<filament_id>": number},
--   "parts": {"<part_id>": piezas que salen en la placa}}]
-- filaments y print_minutes guardan lo que toca a un producto en la combinación de placas más cara.
alter table public.products add column if not exists plates jsonb not null default '[]';
-- Piezas que forman el producto: [{"id": text, "name": "Brazo", "needed": 2}].
alter table public.products add column if not exists parts jsonb not null default '[]';
-- Piezas impresas que todavía no completan un producto: {"<part_id>": cantidad}.
alter table public.products add column if not exists part_stock jsonb not null default '{}';

-- Categorías del producto (puede tener varias): las del catálogo de Kubbo3D o las que escriba el usuario.
alter table public.products add column if not exists categories text[] not null default '{}';
-- Más fotos además de la portada (image_path), en orden.
alter table public.products add column if not exists image_paths text[] not null default '{}';
-- Insumos que lleva cada producto (LEDs, focos, tornillos…): [{"material_id": uuid, "quantity": number}].
-- Su costo se suma al del producto y se descuentan del inventario al producirlo.
alter table public.products add column if not exists materials jsonb not null default '[]';
create index if not exists products_categories_idx on public.products using gin (categories);

-- Catálogo de categorías de impresión 3D: Kubbo3D lo mantiene desde el panel admin.
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 60),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.product_categories enable row level security;
revoke insert, update, delete on public.product_categories from anon, authenticated;
drop policy if exists product_categories_read on public.product_categories;
create policy product_categories_read on public.product_categories for select to anon, authenticated using (active);

-- Categorías de arranque; las que ya existen no se tocan (se editan desde el panel admin).
insert into public.product_categories (name, sort) values
  ('Macetas', 1), ('Portalápices', 2), ('Juguetes', 3), ('Lámparas', 4), ('Llaveros', 5),
  ('Figuras y coleccionables', 6), ('Articulados (flexi)', 7), ('Decoración', 8), ('Organizadores', 9),
  ('Soportes (celular, audífonos, control)', 10), ('Cocina', 11), ('Baño', 12), ('Oficina y escritorio', 13),
  ('Gaming', 14), ('Cosplay y props', 15), ('Joyería y accesorios', 16), ('Mascotas', 17), ('Jardín', 18),
  ('Herramientas y repuestos', 19), ('Electrónica (cajas y carcasas)', 20), ('Automotriz', 21),
  ('Miniaturas y juegos de mesa', 22), ('Fidget y antiestrés', 23), ('Educativo', 24), ('Infantil', 25),
  ('Cortadores de galletas', 26), ('Moldes', 27), ('Letreros y logos', 28), ('Regalos personalizados', 29),
  ('Bodas y eventos', 30), ('Navidad', 31), ('Halloween', 32), ('Día de Muertos', 33),
  ('Maquetas y arquitectura', 34), ('Deportes', 35)
on conflict (name) do nothing;

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
-- Placa que se mandó a imprimir (quantity = veces): {"name": "Placa 2", "parts": {"<part_id>": cantidad}}.
-- Sus piezas buenas entran como piezas sueltas y se arman productos cuando se completan.
alter table public.print_jobs add column if not exists plate jsonb;
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
-- Empaque con el que se envió (sale de su existencia); vacío si no se envió.
alter table public.sales add column if not exists packaging_id uuid references public.packaging (id) on delete set null;
-- Precio de lista del canal al vender: con el precio real da el descuento que se hizo.
alter table public.sales add column if not exists list_price numeric(12,2) check (list_price >= 0);

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

-- Fondo de desgaste de cada impresora: cada impresión le carga su desgaste (horas × desgaste por hora de
-- la impresora) y el usuario registra lo que aparta para ella. Saldo = aportado − desgaste.
create table if not exists public.printer_wear (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  printer_id uuid not null references public.printers (id) on delete cascade,
  kind text not null check (kind in ('wear', 'payment')),
  amount numeric(12,2) not null check (amount >= 0),
  note text not null default '',
  -- El desgaste viene de una impresión (y se ajusta o se borra con ella); los aportes no.
  job_id uuid unique references public.print_jobs (id) on delete cascade,
  happened_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists printer_wear_printer_idx on public.printer_wear (user_id, printer_id, happened_at desc);
alter table public.printer_wear enable row level security;
revoke all on public.printer_wear from anon;
drop policy if exists own_rows on public.printer_wear;
create policy own_rows on public.printer_wear for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

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
-- Merma por placa: cuánto filamento de más se cotiza según las piezas que lleva la placa (más piezas,
-- más riesgo). [{"max_pieces": 15, "pct": 25}, {"max_pieces": 30, "pct": 50}…]; arriba del último, el último.
alter table public.profiles add column if not exists waste_rules jsonb not null default '[]';
grant update (name, business_name, kwh_price, margin_pct, waste_rules) on public.profiles to authenticated;

-- Moneda del taller: sus costos y precios se escriben y muestran en ella. Lo que Kubbo3D recomienda
-- (precios de referencia del catálogo, en pesos mexicanos) se convierte al tipo de cambio del día.
alter table public.profiles add column if not exists currency text not null default 'MXN';
alter table public.profiles drop constraint if exists profiles_currency_check;
alter table public.profiles add constraint profiles_currency_check check (currency ~ '^[A-Z]{3}$');
grant update (currency) on public.profiles to authenticated;

-- La ganancia deseada se mide sobre el precio de venta (vendo en 100, me quedan 50: 50 %), ya no sobre
-- el costo. Una sola vez, los perfiles de antes pasan su porcentaje a su equivalente sobre la venta
-- (100 % sobre el costo = 50 % sobre la venta), así sus precios sugeridos no cambian.
alter table public.profiles add column if not exists margin_on_price boolean not null default false;
update public.profiles
set margin_pct = round(margin_pct * 100 / (100 + margin_pct), 2), margin_on_price = true
where not margin_on_price;
alter table public.profiles alter column margin_on_price set default true;
alter table public.profiles alter column margin_pct set default 50;
alter table public.profiles drop constraint if exists profiles_margin_pct_check;
alter table public.profiles add constraint profiles_margin_pct_check check (margin_pct >= 0 and margin_pct < 95);
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

-- Insumos de `p_count` productos: salen del inventario (o regresan, con un número negativo) como
-- ajustes con nota, así quedan en el historial de cada insumo.
create or replace function public.consume_materials(p_product uuid, p_count int, p_note text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_product is null or coalesce(p_count, 0) = 0 then
    return;
  end if;
  insert into public.inventory_adjustments (item_type, item_id, delta, note)
  select 'material', m.id, -(x.quantity * p_count), p_note
  from public.products p
  cross join lateral jsonb_to_recordset(p.materials) as x (material_id uuid, quantity numeric)
  join public.materials m on m.id = x.material_id
  where p.id = p_product and x.quantity > 0;
end $$;
revoke execute on function public.consume_materials(uuid, int, text) from public, anon;
grant execute on function public.consume_materials(uuid, int, text) to authenticated;

-- Piezas sueltas de un producto que se imprime por placas: suma (o quita) las de una placa
-- `times` veces y arma los productos que ya se completan. Si al quitar faltan piezas, desarma
-- los productos necesarios. Armar y desarmar quedan en el historial como ajustes.
create or replace function public.move_parts(p_product uuid, p_parts jsonb, p_times int) returns void
language plpgsql set search_path = '' as $$
declare
  v_parts jsonb;
  v_loose jsonb;
  v_part jsonb;
  v_key text;
  v_have numeric;
  v_need numeric;
  v_build int;
  v_undo int := 0;
begin
  if p_product is null or p_times = 0 or p_parts is null then
    return;
  end if;
  select parts, part_stock into v_parts, v_loose from public.products where id = p_product for update;
  if not found then
    return;
  end if;
  v_loose := coalesce(v_loose, '{}'::jsonb);
  for v_key in select jsonb_object_keys(p_parts) loop
    v_loose := jsonb_set(v_loose, array[v_key],
      to_jsonb(coalesce((v_loose ->> v_key)::numeric, 0) + coalesce((p_parts ->> v_key)::numeric, 0) * p_times));
  end loop;

  if jsonb_array_length(coalesce(v_parts, '[]'::jsonb)) > 0 then
    -- Productos que se completan con lo suelto, o que hay que desarmar si algo quedó en negativo.
    v_build := null;
    for v_part in select * from jsonb_array_elements(v_parts) loop
      v_need := greatest(coalesce((v_part ->> 'needed')::numeric, 1), 1);
      v_have := coalesce((v_loose ->> (v_part ->> 'id'))::numeric, 0);
      v_build := least(coalesce(v_build, floor(v_have / v_need)::int), floor(v_have / v_need)::int);
      if v_have < 0 then
        v_undo := greatest(v_undo, ceil(-v_have / v_need)::int);
      end if;
    end loop;
    if v_undo > 0 then
      v_build := -v_undo;
    end if;
    if coalesce(v_build, 0) <> 0 then
      for v_part in select * from jsonb_array_elements(v_parts) loop
        v_need := greatest(coalesce((v_part ->> 'needed')::numeric, 1), 1);
        v_loose := jsonb_set(v_loose, array[v_part ->> 'id'],
          to_jsonb(coalesce((v_loose ->> (v_part ->> 'id'))::numeric, 0) - v_need * v_build));
      end loop;
    end if;
  end if;

  update public.products set part_stock = v_loose where id = p_product;
  if coalesce(v_build, 0) > 0 then
    insert into public.inventory_adjustments (item_type, item_id, delta, note)
    values ('product', p_product, v_build, 'Armado con piezas impresas');
    perform public.consume_materials(p_product, v_build, 'Usado al armar productos');
  elsif coalesce(v_build, 0) < 0 then
    insert into public.inventory_adjustments (item_type, item_id, delta, note)
    values ('product', p_product, v_build, 'Desarmado: se corrigió o quitó una impresión');
    perform public.consume_materials(p_product, v_build, 'Devuelto: se desarmaron productos');
  end if;
end $$;
-- Solo sirve dentro del trigger de impresiones: una llamada directa la frena stock_only_by_moves.
revoke execute on function public.move_parts(uuid, jsonb, int) from public, anon;
grant execute on function public.move_parts(uuid, jsonb, int) to authenticated;

-- Piezas buenas que entran a existencias y minutos que acumula la impresora. Una placa suma sus
-- piezas sueltas; una impresión sin placa suma productos completos.
create or replace function public.print_job_moves_stock() returns trigger
language plpgsql set search_path = '' as $$
declare
  -- Si solo cambian notas o tiempo, las piezas no se mueven (ni se arma o desarma nada).
  v_same boolean := tg_op = 'UPDATE'
    and (old.product_id, old.plate, old.good_quantity) is not distinct from (new.product_id, new.plate, new.good_quantity);
begin
  if tg_op <> 'INSERT' then
    if v_same then
      null;
    elsif old.plate is null then
      update public.products set stock = stock - old.good_quantity where id = old.product_id;
      perform public.consume_materials(old.product_id, -old.good_quantity, 'Devuelto: se corrigió o quitó una impresión');
    else
      perform public.move_parts(old.product_id, old.plate -> 'parts', -old.good_quantity);
    end if;
    update public.printers set print_minutes = print_minutes - old.minutes where id = old.printer_id;
  end if;
  if tg_op <> 'DELETE' then
    if v_same then
      null;
    elsif new.plate is null then
      update public.products set stock = stock + new.good_quantity where id = new.product_id;
      perform public.consume_materials(new.product_id, new.good_quantity, 'Usado en una impresión');
    else
      perform public.move_parts(new.product_id, new.plate -> 'parts', new.good_quantity);
    end if;
    update public.printers set print_minutes = print_minutes + new.minutes where id = new.printer_id;
  end if;
  return null;
end $$;

create or replace trigger print_job_moves_stock
  after insert or update or delete on public.print_jobs
  for each row execute function public.print_job_moves_stock();

-- Cada impresión carga su desgaste al fondo de su impresora; si se corrige, se recalcula, y si se
-- borra, el desgaste se va con ella (job_id … on delete cascade).
create or replace function public.print_job_wears_printer() returns trigger
language plpgsql set search_path = '' as $$
begin
  delete from public.printer_wear where job_id = new.id;
  if new.printer_id is not null and new.minutes > 0 then
    insert into public.printer_wear (user_id, printer_id, kind, amount, note, job_id, happened_at)
    select new.user_id, p.id, 'wear', round(new.minutes / 60.0 * p.hourly_cost, 2),
           format('Desgaste: %s de %s', case when new.minutes >= 60 then round(new.minutes / 60.0, 1) || ' h' else new.minutes || ' min' end, new.product_name),
           new.id, coalesce(new.finished_at, new.created_at)::date
    from public.printers p
    where p.id = new.printer_id and p.hourly_cost > 0;
  end if;
  return null;
end $$;

drop trigger if exists print_job_wears_printer on public.print_jobs;
create trigger print_job_wears_printer
  after insert or update of printer_id, minutes, product_name, status on public.print_jobs
  for each row execute function public.print_job_wears_printer();

-- Impresiones de antes del fondo: su desgaste también cuenta.
insert into public.printer_wear (user_id, printer_id, kind, amount, note, job_id, happened_at)
select j.user_id, p.id, 'wear', round(j.minutes / 60.0 * p.hourly_cost, 2),
       format('Desgaste: %s de %s', case when j.minutes >= 60 then round(j.minutes / 60.0, 1) || ' h' else j.minutes || ' min' end, j.product_name),
       j.id, coalesce(j.finished_at, j.created_at)::date
from public.print_jobs j
join public.printers p on p.id = j.printer_id
where j.minutes > 0 and p.hourly_cost > 0
  and not exists (select 1 from public.printer_wear w where w.job_id = j.id);

-- Piezas que salen al vender.
create or replace function public.sale_moves_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    update public.products set stock = stock + old.quantity where id = old.product_id;
    -- Un empaque por venta enviada.
    update public.packaging set stock = stock + 1 where id = old.packaging_id;
  end if;
  if tg_op <> 'DELETE' then
    update public.products set stock = stock - new.quantity where id = new.product_id;
    update public.packaging set stock = stock - 1 where id = new.packaging_id;
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
-- Versión anterior, sin placa.
drop function if exists public.save_print(uuid, uuid, text, uuid, int, int, text, int, text, jsonb);
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
  p_filaments jsonb,
  p_plate jsonb default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  if p_id is null then
    insert into public.print_jobs (product_id, product_name, printer_id, quantity, good_quantity, status, minutes, notes, finished_at, plate)
    values (p_product, p_name, p_printer, p_quantity, p_good, p_status, p_minutes, coalesce(p_notes, ''),
            case when p_status <> 'printing' then now() end, p_plate)
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
      plate = p_plate,
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
         -- Costo real de las compras; el de referencia mientras no hay compras.
         x.grams, round(x.grams * case when f.avg_cost_per_g > 0 then f.avg_cost_per_g else f.cost_per_kg / 1000 end, 2)
  from jsonb_to_recordset(coalesce(p_filaments, '[]'::jsonb)) as x (filament_id uuid, grams numeric)
  join public.filaments f on f.id = x.filament_id
  where x.grams > 0;

  return v_id;
end $$;
revoke execute on function public.save_print(uuid, uuid, text, uuid, int, int, text, int, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_print(uuid, uuid, text, uuid, int, int, text, int, text, jsonb, jsonb) to authenticated;

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
  -- Resultados de las herramientas que se pueden descargar al mes (probar es libre).
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
-- Planes asignados desde el panel admin (pruebas, cortesías): sin Mercado Pago, vencen en paid_until
-- o son de por vida. Se cancelan desde el panel.
alter table public.subscriptions alter column mp_preapproval_id drop not null;
alter table public.subscriptions add column if not exists source text not null default 'mercadopago'
  check (source in ('mercadopago', 'admin'));
alter table public.subscriptions add column if not exists lifetime boolean not null default false;
alter table public.subscriptions add column if not exists note text not null default '';
alter table public.subscriptions drop constraint if exists subscriptions_admin_has_end;
alter table public.subscriptions add constraint subscriptions_admin_has_end
  check (source <> 'admin' or lifetime or paid_until is not null);

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
      where s.user_id = uid
        and case when s.source = 'admin'
              -- Asignado desde el panel: vale mientras no se cancele y no venza.
              then s.status = 'authorized' and (s.lifetime or s.paid_until > now())
              else s.status = 'authorized' or s.paid_until > now() end
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

-- ───────────────────────── Descargas de las herramientas ─────────────────────────
-- Probar las herramientas es libre: lo que cuenta para el plan (plans.tool_runs_month) es bajar un
-- resultado. Un resultado (una corrida) cuenta una sola vez aunque se bajen varias piezas o formatos,
-- y queda guardado en Mis archivos para volver a bajarlo o editarlo sin contar otra vez.

create table if not exists public.tool_downloads (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool text not null check (char_length(tool) between 1 and 40),
  result_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, result_id)
);
create index if not exists tool_downloads_month_idx on public.tool_downloads (user_id, created_at);

-- Solo se escribe con claim_download, que revisa el plan.
alter table public.tool_downloads enable row level security;
revoke all on public.tool_downloads from anon;
revoke insert, update, delete on public.tool_downloads from authenticated;
drop policy if exists tool_downloads_select_own on public.tool_downloads;
create policy tool_downloads_select_own on public.tool_downloads for select to authenticated using (user_id = (select auth.uid()));

-- Lo creado con las herramientas se guarda en Mis archivos marcado como resultado.
alter table public.user_files add column if not exists origin text not null default 'upload' check (origin in ('upload', 'result'));
alter table public.user_files add column if not exists tool text not null default '' check (char_length(tool) <= 40);

-- Cuenta la descarga de un resultado si el plan lo permite. La misma descarga otra vez no cuenta.
create or replace function public.claim_download(p_result uuid, p_tool text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_plan public.plans;
  v_used int;
begin
  if v_user is null then
    raise exception using errcode = 'P0001', message = 'Entra con tu cuenta Kubbo3D para descargar.';
  end if;
  if exists (select 1 from public.tool_downloads where user_id = v_user and result_id = p_result) then
    return jsonb_build_object('charged', false);
  end if;
  v_plan := public.plan_of(v_user);
  select count(*) into v_used from public.tool_downloads
  where user_id = v_user
    and created_at >= (date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City');
  if v_plan.tool_runs_month is not null and v_used >= v_plan.tool_runs_month then
    raise exception using errcode = 'P0001', message = format(
      'Ya descargaste los %s resultados de tu plan %s de este mes. Puedes seguir probando las herramientas; para descargar mejora tu plan o espera al día 1 del próximo mes.',
      v_plan.tool_runs_month, v_plan.name);
  end if;
  insert into public.tool_downloads (user_id, tool, result_id) values (v_user, left(coalesce(p_tool, ''), 40), p_result);
  return jsonb_build_object('charged', true, 'used', v_used + 1, 'limit', v_plan.tool_runs_month);
end $$;
revoke execute on function public.claim_download(uuid, text) from public, anon;
grant execute on function public.claim_download(uuid, text) to authenticated;

-- Plan, suscripción y uso del usuario que llama: para "Mi plan" y para revisar antes de usar una herramienta.
create or replace function public.my_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', to_jsonb(p),
    'subscription', (
      select to_jsonb(s) - 'user_id' from public.subscriptions s
      where s.user_id = auth.uid() and s.status <> 'pending'
      -- Primero la que da el plan vigente (la misma regla que plan_of).
      order by case when s.source = 'admin'
                 then s.status = 'authorized' and (s.lifetime or s.paid_until > now())
                 else s.status = 'authorized' or s.paid_until > now() end desc,
               s.created_at desc
      limit 1),
    'usage', jsonb_build_object(
      'products', (select count(*) from public.products where user_id = auth.uid()),
      'printers', (select count(*) from public.printers where user_id = auth.uid()),
      'tool_runs_month', (
        select count(*) from public.tool_runs
        where user_id = auth.uid()
          and created_at >= (date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City')),
      -- Lo que cuenta el plan: resultados descargados este mes.
      'tool_downloads_month', (
        select count(*) from public.tool_downloads
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
    from public.print_jobs j where j.product_id is not null and j.good_quantity > 0 and j.plate is null
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
  elsif tg_table_name = 'products' then
    -- Las piezas sueltas solo las mueven las impresiones por placa.
    if new.part_stock is distinct from old.part_stock then
      raise exception using errcode = 'P0001', message = 'Las piezas sueltas solo cambian al imprimir placas.';
    end if;
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

-- ───────────────────────── Catálogo de impresoras Kubbo ─────────────────────────
-- Marcas y modelos que Kubbo3D mantiene al día desde el panel admin. Al dar de alta su impresora
-- el usuario elige marca y modelo (o escribe otro) y anota su ID o número de serie.

create table if not exists public.printer_catalog (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (char_length(brand) between 1 and 60),
  model text not null check (char_length(model) between 1 and 80),
  -- Consumo promedio mientras imprime; 0 si no se conoce (el usuario lo escribe).
  power_watts numeric(8,2) not null default 0 check (power_watts >= 0),
  notes text not null default '',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (brand, model)
);
create index if not exists printer_catalog_list_idx on public.printer_catalog (active, brand, sort, model);

alter table public.printer_catalog enable row level security;
revoke insert, update, delete on public.printer_catalog from anon, authenticated;
drop policy if exists printer_catalog_read on public.printer_catalog;
create policy printer_catalog_read on public.printer_catalog for select to anon, authenticated using (active);

-- Modelos de arranque; los que ya existen no se tocan (se editan desde el panel admin).
insert into public.printer_catalog (brand, model, sort) values
  ('Bambu Lab', 'A1 mini', 1), ('Bambu Lab', 'A1', 2), ('Bambu Lab', 'P1P', 3), ('Bambu Lab', 'P1S', 4),
  ('Bambu Lab', 'P2S', 5), ('Bambu Lab', 'X1 Carbon', 6), ('Bambu Lab', 'X1E', 7), ('Bambu Lab', 'H2D', 8),
  ('Bambu Lab', 'H2S', 9), ('Bambu Lab', 'H2C', 10),
  ('Creality', 'Ender-3 V3 SE', 1), ('Creality', 'Ender-3 V3 KE', 2), ('Creality', 'Ender-3 V3', 3), ('Creality', 'K1', 4),
  ('Creality', 'K1C', 5), ('Creality', 'K1 Max', 6), ('Creality', 'K2 Plus', 7), ('Creality', 'Hi', 8),
  ('Prusa Research', 'MINI+', 1), ('Prusa Research', 'MK4S', 2), ('Prusa Research', 'CORE One', 3), ('Prusa Research', 'XL', 4),
  ('Elegoo', 'Neptune 4', 1), ('Elegoo', 'Neptune 4 Pro', 2), ('Elegoo', 'Neptune 4 Max', 3), ('Elegoo', 'Centauri Carbon', 4),
  ('Anycubic', 'Kobra 2 Neo', 1), ('Anycubic', 'Kobra 3', 2), ('Anycubic', 'Kobra 3 Combo', 3), ('Anycubic', 'Kobra S1', 4),
  ('Flashforge', 'Adventurer 5M', 1), ('Flashforge', 'Adventurer 5M Pro', 2), ('Flashforge', 'AD5X', 3),
  ('Sovol', 'SV06', 1), ('Sovol', 'SV07', 2), ('Sovol', 'SV08', 3),
  ('Qidi', 'Q1 Pro', 1), ('Qidi', 'Plus4', 2)
on conflict (brand, model) do nothing;

-- La impresora del usuario: marca, modelo, su ID o número de serie y de qué modelo del catálogo salió.
alter table public.printers add column if not exists brand text not null default '';
alter table public.printers add column if not exists device_id text not null default '';
alter table public.printers add column if not exists catalog_id uuid references public.printer_catalog (id) on delete set null;
-- Horas que ya traía la impresora al darla de alta (opcional); se suman a las de sus impresiones.
alter table public.printers add column if not exists initial_minutes int not null default 0 check (initial_minutes >= 0);
-- Lo que costó la impresora y las horas de vida que se le calculan: dan el desgaste por hora.
alter table public.printers add column if not exists purchase_price numeric(12,2) not null default 0 check (purchase_price >= 0);
alter table public.printers add column if not exists life_hours int not null default 0 check (life_hours >= 0);

-- ───────────────────────── Catálogo público del taller ─────────────────────────
-- Cada usuario puede publicar sus productos como catálogo: en kubbo3d (/c/<dirección>) o en su propio
-- dominio. Al abrir un producto se ven fotos, descripción, categorías y los enlaces a sus publicaciones
-- en cada canal de venta (Mercado Libre, TikTok Shop…). Nunca se muestran costos, placas ni stock.

-- Enlace de la publicación en cada canal: {"<channel_id>": "https://…"}.
alter table public.products add column if not exists links jsonb not null default '{}';
-- Si aparece en el catálogo.
alter table public.products add column if not exists in_catalog boolean not null default true;

create table if not exists public.catalogs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- La dirección: kubbo3d…/c/<slug>.
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  title text not null default '' check (char_length(title) <= 80),
  about text not null default '' check (char_length(about) <= 1000),
  whatsapp text not null default '' check (whatsapp ~ '^[0-9]{0,15}$'),
  show_prices boolean not null default true,
  published boolean not null default false,
  -- Dominio propio (tienda.midominio.com). Solo responde cuando Kubbo3D lo conecta y lo marca verificado.
  domain text check (domain is null or (char_length(domain) <= 253 and domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$')),
  domain_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists catalogs_domain_idx on public.catalogs (domain) where domain_verified;

alter table public.catalogs enable row level security;
revoke all on public.catalogs from anon;
drop policy if exists own_rows on public.catalogs;
create policy own_rows on public.catalogs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- El usuario no puede marcar su dominio como verificado: eso lo hace el panel admin (llave secreta).
revoke insert, update on public.catalogs from authenticated;
grant insert (slug, title, about, whatsapp, show_prices, published, domain) on public.catalogs to authenticated;
grant update (slug, title, about, whatsapp, show_prices, published, domain) on public.catalogs to authenticated;

-- Cambiar el dominio lo deja otra vez pendiente de conectar.
create or replace function public.catalogs_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.domain is distinct from old.domain then
    new.domain_verified := false;
  end if;
  return new;
end;
$$;
drop trigger if exists catalogs_touch on public.catalogs;
create trigger catalogs_touch before update on public.catalogs
  for each row execute function public.catalogs_touch();

-- Lo que ve cualquiera del catálogo publicado, por su dirección o por su dominio verificado.
create or replace function public.public_catalog(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', c.slug,
    'title', coalesce(nullif(c.title, ''), nullif(pr.business_name, ''), c.slug),
    'about', c.about,
    'whatsapp', c.whatsapp,
    'show_prices', c.show_prices,
    'currency', coalesce(pr.currency, 'MXN'),
    'domain', case when c.domain_verified then c.domain end,
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'image_path', p.image_path,
        'image_paths', p.image_paths,
        'categories', p.categories,
        'links', coalesce((
          select jsonb_agg(jsonb_build_object(
            'channel', ch.name,
            'url', p.links ->> ch.id::text,
            'price', case when c.show_prices and jsonb_typeof(p.prices -> ch.id::text) = 'number'
                          and (p.prices ->> ch.id::text)::numeric > 0 then (p.prices ->> ch.id::text)::numeric end
          ) order by ch.sort, ch.name)
          from public.channels ch
          where ch.user_id = c.user_id and coalesce(p.links ->> ch.id::text, '') ~ '^https?://'
        ), '[]'::jsonb)
      ) order by p.name)
      from public.products p
      where p.user_id = c.user_id and p.in_catalog
    ), '[]'::jsonb)
  )
  from public.catalogs c
  left join public.profiles pr on pr.id = c.user_id
  where c.published
    and (c.slug = lower(p_key) or (c.domain_verified and c.domain = lower(p_key)))
  limit 1;
$$;
revoke all on function public.public_catalog(text) from public;
grant execute on function public.public_catalog(text) to anon, authenticated;

-- ───────────────────────── Usos de IA (herramientas) ─────────────────────────
-- Cada imagen que la IA redibuja (por ejemplo en el Lentero) deja un renglón: el servidor del sitio de
-- herramientas los cuenta para el límite diario. El usuario solo puede agregar y ver los suyos.
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool text not null default '' check (char_length(tool) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists ai_generations_user_idx on public.ai_generations (user_id, created_at);
alter table public.ai_generations enable row level security;
revoke all on public.ai_generations from anon;
revoke update, delete on public.ai_generations from authenticated;
drop policy if exists ai_generations_insert on public.ai_generations;
create policy ai_generations_insert on public.ai_generations for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists ai_generations_read on public.ai_generations;
create policy ai_generations_read on public.ai_generations for select to authenticated using (user_id = (select auth.uid()));

-- ───────────────────────── Gastos fijos del taller ─────────────────────────
-- Renta del local, internet, sueldos… cada uno con nombre, monto al mes y si está activo. Los activos se
-- reparten entre las piezas que el taller produce al mes y esa parte se suma al costo de cada pieza.
-- [{"id": "…", "name": "Renta del local", "amount": 15000, "active": true}]
alter table public.profiles add column if not exists overheads jsonb not null default '[]';
alter table public.profiles add column if not exists overhead_pieces int not null default 0 check (overhead_pieces >= 0);
grant update (overheads, overhead_pieces) on public.profiles to authenticated;

-- ───────────────────────── Tienda y colaboradores ─────────────────────────
-- Cada cuenta es una tienda (la del dueño): sus filas llevan user_id = el dueño. El dueño invita por correo a
-- colaboradores con su propia cuenta; ellos trabajan dentro de la tienda del dueño con un rol:
--   admin: todo menos Ajustes, Equipo y Suscripción (eso es del dueño).
--   staff: el día a día (productos, filamento, insumos, embalaje, impresiones, ventas, inventario, compras,
--          mantenimiento) sin borrar nada, y sin tocar canales, paqueterías, impresoras, proveedores ni catálogo.
-- Cuántos colaboradores caben lo dice el plan del dueño (plans.max_members).

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'plans' and column_name = 'max_members') then
    alter table public.plans add column max_members int check (max_members >= 0);
    -- Valores de arranque (luego se cambian en la tabla plans); vacío = sin límite.
    update public.plans set max_members = case id when 'free' then 0 when 'maker' then 1 when 'taller' then 3 when 'fabrica' then 10 else 0 end;
  end if;
end $$;

create table if not exists public.shop_members (
  owner_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (owner_id, user_id),
  check (owner_id <> user_id)
);
create index if not exists shop_members_user_idx on public.shop_members (user_id);

create table if not exists public.shop_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role text not null default 'staff' check (role in ('admin', 'staff')),
  token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create unique index if not exists shop_invites_pending_idx on public.shop_invites (owner_id, lower(email)) where accepted_at is null;

-- La tienda en la que trabaja cada quien (null = la suya).
alter table public.profiles add column if not exists active_shop uuid references auth.users (id) on delete set null;
grant update (active_shop) on public.profiles to authenticated;

-- La tienda activa del usuario: la que eligió si sigue siendo colaborador ahí; si no, la suya.
create or replace function public.current_shop() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.active_shop from public.profiles p
      where p.id = auth.uid() and p.active_shop is not null
        and exists (select 1 from public.shop_members m where m.owner_id = p.active_shop and m.user_id = auth.uid())),
    auth.uid());
$$;
revoke all on function public.current_shop() from public, anon;
grant execute on function public.current_shop() to authenticated;

-- 'owner', 'admin' o 'staff' en la tienda activa.
create or replace function public.shop_role() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when public.current_shop() = auth.uid() then 'owner'
    else (select m.role from public.shop_members m where m.owner_id = public.current_shop() and m.user_id = auth.uid())
  end;
$$;
revoke all on function public.shop_role() from public, anon;
grant execute on function public.shop_role() to authenticated;

-- Las filas del taller son de la tienda activa: ahí se leen y se escriben (las nuevas, a su nombre).
do $$
declare
  t text;
begin
  foreach t in array array['suppliers', 'printers', 'filaments', 'channels', 'carriers', 'products', 'print_jobs',
                           'print_job_filaments', 'sales', 'maintenance', 'printer_wear', 'expenses', 'packaging',
                           'materials', 'inventory_adjustments', 'catalogs'] loop
    execute format('alter table public.%I alter column user_id set default public.current_shop()', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = (select public.current_shop())) with check (user_id = (select public.current_shop()))', t);
  end loop;
end $$;

-- Lo que cada rol puede hacer directamente. Los cambios que hacen otros triggers (stock, desgaste, compras de
-- un mantenimiento) no se revisan: vienen de algo que el usuario sí podía hacer.
create or replace function public.guard_shop_role() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_role text;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return coalesce(new, old);
  end if;
  v_role := public.shop_role();
  if v_role is null or v_role in ('owner', 'admin') then
    return coalesce(new, old);
  end if;
  if tg_argv[0] = 'config' then
    raise exception using errcode = 'P0001', message = 'Como colaborador no puedes cambiar esto. Pídeselo al dueño o a un administrador de la tienda.';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'Como colaborador no puedes borrar. Pídeselo al dueño o a un administrador de la tienda.';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['channels', 'carriers', 'printers', 'printer_wear', 'suppliers', 'catalogs'] loop
    execute format('drop trigger if exists guard_shop_role on public.%I', t);
    execute format('create trigger guard_shop_role before insert or update or delete on public.%I
                      for each row execute function public.guard_shop_role(%L)', t, 'config');
  end loop;
  foreach t in array array['products', 'filaments', 'materials', 'packaging', 'print_jobs', 'sales', 'expenses',
                           'maintenance', 'inventory_adjustments'] loop
    execute format('drop trigger if exists guard_shop_role on public.%I', t);
    execute format('create trigger guard_shop_role before delete on public.%I
                      for each row execute function public.guard_shop_role(%L)', t, 'data');
  end loop;
end $$;

-- Perfiles: cada quien el suyo; los colaboradores leen el del dueño (sus ajustes: luz, ganancia, gastos fijos)
-- y el dueño los de su equipo (nombre y correo). Solo el dueño cambia sus ajustes.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or id = (select public.current_shop())
  or id in (select m.user_id from public.shop_members m where m.owner_id = (select auth.uid()))
  or id in (select m.owner_id from public.shop_members m where m.user_id = (select auth.uid()))
);

-- Fotos de productos: en la carpeta de la tienda (o en la propia).
drop policy if exists kubbo_products_own_folder on storage.objects;
create policy kubbo_products_own_folder on storage.objects for all to authenticated
  using (bucket_id = 'products' and (storage.foldername(name))[1] in ((select auth.uid())::text, (select public.current_shop())::text))
  with check (bucket_id = 'products' and (storage.foldername(name))[1] in ((select auth.uid())::text, (select public.current_shop())::text));

-- Equipo: el dueño ve y quita a los suyos y cambia su rol; cada colaborador se ve a sí mismo y puede salirse.
alter table public.shop_members enable row level security;
revoke all on public.shop_members from anon;
revoke insert, update on public.shop_members from authenticated;
grant update (role) on public.shop_members to authenticated;
drop policy if exists shop_members_read on public.shop_members;
create policy shop_members_read on public.shop_members for select to authenticated
  using (owner_id = (select auth.uid()) or user_id = (select auth.uid()));
drop policy if exists shop_members_role on public.shop_members;
create policy shop_members_role on public.shop_members for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists shop_members_leave on public.shop_members;
create policy shop_members_leave on public.shop_members for delete to authenticated
  using (owner_id = (select auth.uid()) or user_id = (select auth.uid()));

-- Invitaciones: solo el dueño de la tienda, a su tienda.
alter table public.shop_invites enable row level security;
revoke all on public.shop_invites from anon;
revoke update on public.shop_invites from authenticated;
drop policy if exists shop_invites_owner on public.shop_invites;
create policy shop_invites_owner on public.shop_invites for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Lugares del plan: colaboradores + invitaciones pendientes no pasan de plans.max_members.
create or replace function public.shop_seats_left(p_owner uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when p.max_members is null then 1000000
    else p.max_members
      - (select count(*) from public.shop_members m where m.owner_id = p_owner)::int
      - (select count(*) from public.shop_invites i where i.owner_id = p_owner and i.accepted_at is null)::int
  end
  from public.plan_of(p_owner) p;
$$;
revoke all on function public.shop_seats_left(uuid) from public, anon, authenticated;

create or replace function public.shop_invites_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans;
begin
  new.email := lower(trim(new.email));
  if lower(new.email) = (select lower(email) from public.profiles where id = new.owner_id) then
    raise exception using errcode = 'P0001', message = 'Esa es tu propia cuenta.';
  end if;
  if exists (select 1 from public.shop_members m join public.profiles p on p.id = m.user_id
             where m.owner_id = new.owner_id and lower(p.email) = new.email) then
    raise exception using errcode = 'P0001', message = 'Esa persona ya es parte de tu tienda.';
  end if;
  if public.shop_seats_left(new.owner_id) <= 0 then
    v_plan := public.plan_of(new.owner_id);
    raise exception using errcode = 'P0001', message = case when coalesce(v_plan.max_members, 0) = 0
      then format('Tu plan %s no incluye colaboradores. Mejora tu plan en la página de precios de Kubbo3D.', v_plan.name)
      else format('Tu plan %s incluye %s colaborador(es) y ya están ocupados (contando invitaciones pendientes). Cancela una invitación, quita a alguien o mejora tu plan.', v_plan.name, v_plan.max_members) end;
  end if;
  return new;
end $$;
drop trigger if exists shop_invites_limit on public.shop_invites;
create trigger shop_invites_limit before insert on public.shop_invites
  for each row execute function public.shop_invites_limit();

-- Lo que la página de la invitación muestra antes de aceptar (quien tenga el enlace).
create or replace function public.invite_info(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shop', coalesce(nullif(p.business_name, ''), nullif(p.name, ''), p.email),
    'email', i.email,
    'role', i.role,
    'accepted', i.accepted_at is not null)
  from public.shop_invites i join public.profiles p on p.id = i.owner_id
  where i.token = p_token;
$$;
revoke all on function public.invite_info(uuid) from public, anon;
grant execute on function public.invite_info(uuid) to authenticated;

-- Aceptar: el correo de la cuenta tiene que ser el invitado. Queda como colaborador y trabajando en esa tienda.
create or replace function public.accept_invite(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.shop_invites;
  v_email text;
begin
  select * into v_invite from public.shop_invites where token = p_token for update;
  if v_invite.id is null then
    raise exception using errcode = 'P0001', message = 'Esta invitación ya no existe: pide que te inviten otra vez.';
  end if;
  if v_invite.accepted_at is not null then
    raise exception using errcode = 'P0001', message = 'Esta invitación ya se usó.';
  end if;
  select lower(email) into v_email from public.profiles where id = auth.uid();
  if v_email is distinct from lower(v_invite.email) then
    raise exception using errcode = 'P0001', message = format('La invitación es para %s. Entra con esa cuenta para aceptarla.', v_invite.email);
  end if;
  insert into public.shop_members (owner_id, user_id, role) values (v_invite.owner_id, auth.uid(), v_invite.role)
  on conflict (owner_id, user_id) do update set role = excluded.role;
  update public.shop_invites set accepted_at = now(), accepted_by = auth.uid() where id = v_invite.id;
  update public.profiles set active_shop = v_invite.owner_id where id = auth.uid();
  return jsonb_build_object('owner_id', v_invite.owner_id, 'role', v_invite.role);
end $$;
revoke all on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;

-- La tienda activa, el rol y todas las tiendas a las que puede entrar (la suya primero).
create or replace function public.my_shop() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shop_id', public.current_shop(),
    'role', public.shop_role(),
    'shops', (
      select jsonb_agg(s order by s ->> 'role' = 'owner' desc, s ->> 'name')
      from (
        select jsonb_build_object('owner_id', p.id, 'role', 'owner',
                 'name', coalesce(nullif(p.business_name, ''), 'Mi tienda')) as s
        from public.profiles p where p.id = auth.uid()
        union all
        select jsonb_build_object('owner_id', m.owner_id, 'role', m.role,
                 'name', coalesce(nullif(p.business_name, ''), nullif(p.name, ''), p.email))
        from public.shop_members m join public.profiles p on p.id = m.owner_id
        where m.user_id = auth.uid()
      ) list),
    'seats', (select to_jsonb(x) from (select p.max_members as max,
                (select count(*) from public.shop_members m where m.owner_id = auth.uid()) as members,
                (select count(*) from public.shop_invites i where i.owner_id = auth.uid() and i.accepted_at is null) as pending
              from public.plan_of(auth.uid()) p) x))
  where auth.uid() is not null;
$$;
revoke all on function public.my_shop() from public, anon;
grant execute on function public.my_shop() to authenticated;

-- ───────────────────────── Marketplace de modelos 3D ─────────────────────────
-- Cualquier usuario sube STL / 3MF gratis o de pago; los demás los descargan o compran, comentan,
-- califican y guardan en favoritos. Kubbo cobra con Mercado Pago, se queda fee_pct y el resto
-- suma al saldo del vendedor, que lo retira (CLABE, Mercado Pago o PayPal) cuando pasan hold_days.

create table if not exists public.market_settings (
  id int primary key default 1 check (id = 1),
  -- Comisión de Kubbo sobre cada venta, en % del precio (cubre también la comisión de Mercado Pago).
  fee_pct numeric(5,2) not null default 20 check (fee_pct between 0 and 90),
  -- Saldo mínimo para pedir un retiro.
  min_payout numeric(12,2) not null default 200 check (min_payout >= 0),
  -- Días que una venta espera antes de poder retirarse (reembolsos y contracargos).
  hold_days int not null default 14 check (hold_days between 0 and 120)
);
insert into public.market_settings (id) values (1) on conflict do nothing;
alter table public.market_settings enable row level security;
revoke insert, update, delete on public.market_settings from anon, authenticated;
drop policy if exists market_settings_read on public.market_settings;
create policy market_settings_read on public.market_settings for select to anon, authenticated using (true);

-- Perfil público de quien sube, comenta o califica. Se crea solo la primera vez (ensure_maker).
create table if not exists public.makers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  name text not null default '' check (char_length(name) <= 80),
  bio text not null default '' check (char_length(bio) <= 500),
  country text not null default '' check (char_length(country) <= 60),
  created_at timestamptz not null default now()
);
alter table public.makers enable row level security;
revoke insert, update, delete on public.makers from anon, authenticated;
grant update (handle, name, bio, country) on public.makers to authenticated;
drop policy if exists makers_read on public.makers;
create policy makers_read on public.makers for select to anon, authenticated using (true);
drop policy if exists makers_own on public.makers;
create policy makers_own on public.makers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Crea el perfil público con un @usuario libre sacado del nombre (nunca del correo).
create or replace function public.ensure_maker(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_base text;
  v_handle text;
begin
  if p_user is null or exists (select 1 from public.makers where user_id = p_user) then
    return;
  end if;
  select btrim(name) into v_name from public.profiles where id = p_user;
  v_base := left(regexp_replace(translate(lower(coalesce(v_name, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'), '[^a-z0-9]+', '', 'g'), 20);
  if char_length(v_base) < 3 then
    v_base := 'maker';
  end if;
  v_handle := v_base;
  while exists (select 1 from public.makers where handle = v_handle) loop
    v_handle := v_base || (1000 + floor(random() * 9000))::int;
  end loop;
  insert into public.makers (user_id, handle, name) values (p_user, v_handle, left(coalesce(v_name, ''), 80))
  on conflict (user_id) do nothing;
end $$;
revoke all on function public.ensure_maker(uuid) from public, anon, authenticated;

create or replace function public.my_maker() returns public.makers
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.makers;
begin
  perform public.ensure_maker(auth.uid());
  select * into v_row from public.makers where user_id = auth.uid();
  return v_row;
end $$;
revoke all on function public.my_maker() from public, anon;
grant execute on function public.my_maker() to authenticated;

-- Datos para pagarle al vendedor. Solo los ve él (y el admin con la clave secreta).
create table if not exists public.maker_payout_info (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  method text not null check (method in ('clabe', 'mercadopago', 'paypal')),
  account text not null check (char_length(btrim(account)) between 3 and 120),
  holder text not null default '' check (char_length(holder) <= 120),
  updated_at timestamptz not null default now()
);
alter table public.maker_payout_info enable row level security;
revoke all on public.maker_payout_info from anon;
drop policy if exists maker_payout_info_own on public.maker_payout_info;
create policy maker_payout_info_own on public.maker_payout_info for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.makers (user_id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  category text not null default 'otros' check (char_length(category) <= 40),
  tags text[] not null default '{}',
  -- En pesos; 0 = gratis.
  price numeric(12,2) not null default 0 check (price = 0 or price between 10 and 20000),
  -- Licencia: true = quien lo obtiene puede vender las piezas impresas.
  commercial boolean not null default false,
  -- Material, capa, soportes, relleno…
  print_notes text not null default '' check (char_length(print_notes) <= 2000),
  -- Rutas en el bucket público model-media (<user_id>/<model_id>/…); la primera es la portada.
  images text[] not null default '{}',
  -- [{"path","name","size"}] en el bucket privado model-files (<user_id>/<model_id>/…).
  files jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'published')),
  -- Lo oculta el admin (derechos de autor, contenido ofensivo…).
  blocked boolean not null default false,
  blocked_reason text not null default '',
  downloads int not null default 0,
  sales int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists models_user_idx on public.models (user_id);
create index if not exists models_listing_idx on public.models (published_at desc) where status = 'published' and not blocked;
alter table public.models enable row level security;
revoke insert, update, delete on public.models from anon, authenticated;
grant insert (id, title, description, category, tags, price, commercial, print_notes, images, files, status) on public.models to authenticated;
grant update (title, description, category, tags, price, commercial, print_notes, images, files, status) on public.models to authenticated;
grant delete on public.models to authenticated;
drop policy if exists models_read on public.models;
create policy models_read on public.models for select to anon, authenticated
  using ((status = 'published' and not blocked) or user_id = (select auth.uid()));
drop policy if exists models_insert on public.models;
create policy models_insert on public.models for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists models_update on public.models;
create policy models_update on public.models for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists models_delete on public.models;
create policy models_delete on public.models for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.models_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text := new.user_id::text || '/' || new.id::text || '/';
  v_file jsonb;
begin
  -- Los contadores los mueven otros triggers (profundidad > 1): solo los cambios del vendedor pasan por aquí.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  perform public.ensure_maker(new.user_id);
  new.title := btrim(new.title);
  new.tags := coalesce((select array_agg(distinct t) from (
    select left(lower(btrim(x)), 30) as t from unnest(new.tags) x where btrim(x) <> '' limit 10) s), '{}');
  if cardinality(new.images) > 12 then
    raise exception 'Máximo 12 fotos por modelo.';
  end if;
  if jsonb_typeof(new.files) is distinct from 'array' or jsonb_array_length(new.files) > 20 then
    raise exception 'Máximo 20 archivos por modelo.';
  end if;
  for v_file in select * from jsonb_array_elements(new.files) loop
    if not coalesce(v_file ->> 'path', '') like v_prefix || '%' or v_file ->> 'path' like '%..%' then
      raise exception 'Archivo fuera de la carpeta del modelo.';
    end if;
  end loop;
  if exists (select 1 from unnest(new.images) i where i not like v_prefix || '%') then
    raise exception 'Foto fuera de la carpeta del modelo.';
  end if;
  if new.status = 'published' then
    if cardinality(new.images) = 0 or jsonb_array_length(new.files) = 0 then
      raise exception 'Para publicar sube al menos una foto y un archivo STL o 3MF.';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists models_check on public.models;
create trigger models_check before insert or update on public.models
  for each row execute function public.models_check();

create table if not exists public.model_purchases (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  -- Sin llave foránea: la venta queda registrada aunque el vendedor borre su cuenta.
  seller_id uuid not null,
  title text not null,
  price numeric(12,2) not null,
  fee_pct numeric(5,2) not null,
  fee numeric(12,2) not null,
  seller_amount numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists model_purchases_paid_idx on public.model_purchases (model_id, buyer_id) where status = 'paid';
create index if not exists model_purchases_buyer_idx on public.model_purchases (buyer_id);
create index if not exists model_purchases_seller_idx on public.model_purchases (seller_id, status);
alter table public.model_purchases enable row level security;
revoke insert, update, delete on public.model_purchases from anon, authenticated;
drop policy if exists model_purchases_own on public.model_purchases;
create policy model_purchases_own on public.model_purchases for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

-- Un modelo vendido no se borra: el vendedor lo despublica y quien lo compró lo sigue descargando.
create or replace function public.models_keep_sold() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and exists (select 1 from public.model_purchases p where p.model_id = old.id and p.status = 'paid') then
    raise exception 'Este modelo ya tiene compras: despublícalo en lugar de borrarlo.';
  end if;
  return old;
end $$;
drop trigger if exists models_keep_sold on public.models;
create trigger models_keep_sold before delete on public.models
  for each row execute function public.models_keep_sold();

-- Quién descargó qué (una fila por persona y modelo). Quien bajó un modelo gratis lo conserva si luego le ponen precio.
create table if not exists public.model_downloads (
  model_id uuid not null references public.models (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  times int not null default 1,
  -- La bajó cuando era gratis: la conserva aunque luego tenga precio (una compra reembolsada no).
  free boolean not null default false,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (model_id, user_id)
);
create index if not exists model_downloads_user_idx on public.model_downloads (user_id);
alter table public.model_downloads enable row level security;
revoke insert, update, delete on public.model_downloads from anon, authenticated;
drop policy if exists model_downloads_own on public.model_downloads;
create policy model_downloads_own on public.model_downloads for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.has_model_access(p_model uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.models m
    where m.id = p_model and (
      m.user_id = auth.uid()
      or (m.price = 0 and m.status = 'published' and not m.blocked)
      or exists (select 1 from public.model_purchases p where p.model_id = m.id and p.buyer_id = auth.uid() and p.status = 'paid')
      or exists (select 1 from public.model_downloads d where d.model_id = m.id and d.user_id = auth.uid() and d.free)));
$$;
revoke all on function public.has_model_access(uuid) from public, anon;
grant execute on function public.has_model_access(uuid) to authenticated;

-- Registra la descarga y devuelve la lista de archivos; el navegador firma cada uno con su sesión.
create or replace function public.download_model(p_model uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_model public.models;
  v_first boolean;
begin
  if auth.uid() is null then
    raise exception 'Entra a tu cuenta para descargar.';
  end if;
  if not public.has_model_access(p_model) then
    raise exception 'Compra este modelo para descargarlo.';
  end if;
  select * into v_model from public.models where id = p_model;
  if v_model.user_id <> auth.uid() then
    insert into public.model_downloads (model_id, user_id, free) values (p_model, auth.uid(), v_model.price = 0)
    on conflict (model_id, user_id) do update
      set times = public.model_downloads.times + 1, last_at = now(), free = public.model_downloads.free or excluded.free
    returning (xmax = 0) into v_first;
    if v_first then
      update public.models set downloads = downloads + 1 where id = p_model;
    end if;
  end if;
  return v_model.files;
end $$;
revoke all on function public.download_model(uuid) from public, anon;
grant execute on function public.download_model(uuid) to authenticated;

-- Aparta la compra con el precio de la base de datos; /api/modelos/pagar la cobra con Mercado Pago.
create or replace function public.buy_model(p_model uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_model public.models;
  v_fee_pct numeric(5,2);
  v_fee numeric(12,2);
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Entra a tu cuenta para comprar.';
  end if;
  select * into v_model from public.models where id = p_model and status = 'published' and not blocked;
  if not found then
    raise exception 'Este modelo ya no está a la venta.';
  end if;
  if v_model.user_id = auth.uid() then
    raise exception 'Es tu propio modelo.';
  end if;
  if v_model.price = 0 then
    raise exception 'Este modelo es gratis: descárgalo directo.';
  end if;
  if exists (select 1 from public.model_purchases where model_id = p_model and buyer_id = auth.uid() and status = 'paid') then
    return jsonb_build_object('already', true);
  end if;
  select fee_pct into v_fee_pct from public.market_settings where id = 1;
  v_fee := round(v_model.price * v_fee_pct / 100, 2);
  select id into v_id from public.model_purchases
  where model_id = p_model and buyer_id = auth.uid() and status = 'pending' order by created_at desc limit 1;
  if v_id is null then
    insert into public.model_purchases (model_id, buyer_id, seller_id, title, price, fee_pct, fee, seller_amount)
    values (p_model, auth.uid(), v_model.user_id, v_model.title, v_model.price, v_fee_pct, v_fee, v_model.price - v_fee)
    returning id into v_id;
  else
    update public.model_purchases
    set title = v_model.title, price = v_model.price, fee_pct = v_fee_pct, fee = v_fee, seller_amount = v_model.price - v_fee, created_at = now()
    where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'price', v_model.price);
end $$;
revoke all on function public.buy_model(uuid) from public, anon;
grant execute on function public.buy_model(uuid) to authenticated;

-- Contador de ventas del modelo cuando una compra se paga o se reembolsa.
create or replace function public.model_purchases_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.status = 'paid') <> (new.status = 'paid') then
    update public.models set sales = greatest(sales + case when new.status = 'paid' then 1 else -1 end, 0) where id = new.model_id;
  end if;
  return null;
end $$;
drop trigger if exists model_purchases_count on public.model_purchases;
create trigger model_purchases_count after update of status on public.model_purchases
  for each row execute function public.model_purchases_count();

create table if not exists public.model_favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  model_id uuid not null references public.models (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, model_id)
);
create index if not exists model_favorites_model_idx on public.model_favorites (model_id);
alter table public.model_favorites enable row level security;
revoke all on public.model_favorites from anon;
revoke update on public.model_favorites from authenticated;
drop policy if exists model_favorites_own on public.model_favorites;
create policy model_favorites_own on public.model_favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.model_favorites_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.models set likes = likes + 1 where id = new.model_id;
  else
    update public.models set likes = greatest(likes - 1, 0) where id = old.model_id;
  end if;
  return null;
end $$;
drop trigger if exists model_favorites_count on public.model_favorites;
create trigger model_favorites_count after insert or delete on public.model_favorites
  for each row execute function public.model_favorites_count();

create table if not exists public.model_comments (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.makers (user_id) on delete cascade,
  -- Respuesta a otro comentario (un solo nivel).
  parent_id uuid references public.model_comments (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists model_comments_model_idx on public.model_comments (model_id, created_at);
alter table public.model_comments enable row level security;
revoke update on public.model_comments from anon, authenticated;
revoke insert, delete on public.model_comments from anon;
drop policy if exists model_comments_read on public.model_comments;
create policy model_comments_read on public.model_comments for select to anon, authenticated
  using (exists (select 1 from public.models m where m.id = model_id));
drop policy if exists model_comments_insert on public.model_comments;
create policy model_comments_insert on public.model_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.models m where m.id = model_id));
-- Borra su comentario quien lo escribió o el dueño del modelo.
drop policy if exists model_comments_delete on public.model_comments;
create policy model_comments_delete on public.model_comments for delete to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.models m where m.id = model_id and m.user_id = (select auth.uid())));

create or replace function public.model_comments_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ensure_maker(new.user_id);
  new.body := btrim(new.body);
  if new.parent_id is not null and not exists (
    select 1 from public.model_comments c where c.id = new.parent_id and c.model_id = new.model_id and c.parent_id is null) then
    raise exception 'Solo se responde a comentarios de este modelo.';
  end if;
  -- Freno al spam: máximo 20 comentarios por persona cada 10 minutos.
  if (select count(*) from public.model_comments c where c.user_id = new.user_id and c.created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Vas muy rápido: espera unos minutos para comentar otra vez.';
  end if;
  return new;
end $$;
drop trigger if exists model_comments_check on public.model_comments;
create trigger model_comments_check before insert on public.model_comments
  for each row execute function public.model_comments_check();

create or replace function public.model_comments_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.models set comments = comments + 1 where id = new.model_id;
  else
    update public.models set comments = greatest(comments - 1, 0) where id = old.model_id;
  end if;
  return null;
end $$;
drop trigger if exists model_comments_count on public.model_comments;
create trigger model_comments_count after insert or delete on public.model_comments
  for each row execute function public.model_comments_count();

-- Calificación de 1 a 5 estrellas: solo quien descargó o compró el modelo, y no su autor.
create table if not exists public.model_ratings (
  model_id uuid not null references public.models (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (model_id, user_id)
);
alter table public.model_ratings enable row level security;
revoke all on public.model_ratings from anon;
revoke update on public.model_ratings from authenticated;
grant update (stars) on public.model_ratings to authenticated;
drop policy if exists model_ratings_own on public.model_ratings;
create policy model_ratings_own on public.model_ratings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_model_access(model_id)
              and not exists (select 1 from public.models m where m.id = model_id and m.user_id = (select auth.uid())));

create or replace function public.model_ratings_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_model uuid := coalesce(new.model_id, old.model_id);
begin
  update public.models m
  set rating_avg = coalesce(r.avg, 0), rating_count = r.n
  from (select round(avg(stars), 2) as avg, count(*)::int as n from public.model_ratings where model_id = v_model) r
  where m.id = v_model;
  return null;
end $$;
drop trigger if exists model_ratings_count on public.model_ratings;
create trigger model_ratings_count after insert or update or delete on public.model_ratings
  for each row execute function public.model_ratings_count();

-- Denuncias (derechos de autor, contenido ofensivo, archivo roto…). Las revisa el admin.
create table if not exists public.model_reports (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (reason in ('copyright', 'offensive', 'broken', 'other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'new' check (status in ('new', 'resolved')),
  created_at timestamptz not null default now()
);
create unique index if not exists model_reports_open_idx on public.model_reports (model_id, user_id) where status = 'new';
alter table public.model_reports enable row level security;
revoke all on public.model_reports from anon;
revoke select, update, delete on public.model_reports from authenticated;
drop policy if exists model_reports_insert on public.model_reports;
create policy model_reports_insert on public.model_reports for insert to authenticated with check (user_id = (select auth.uid()));

-- Retiros del saldo del vendedor. Los pide el vendedor (request_payout) y los paga el admin.
create table if not exists public.maker_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null,
  account text not null,
  holder text not null default '',
  status text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  -- Folio de la transferencia o motivo del rechazo; lo escribe el admin.
  reference text not null default '',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists maker_payouts_user_idx on public.maker_payouts (user_id, created_at desc);
alter table public.maker_payouts enable row level security;
revoke insert, update, delete on public.maker_payouts from anon, authenticated;
drop policy if exists maker_payouts_own on public.maker_payouts;
create policy maker_payouts_own on public.maker_payouts for select to authenticated using (user_id = (select auth.uid()));

-- Saldo de un vendedor: ventas pagadas − comisión, menos lo que aún espera hold_days, menos retiros.
create or replace function public.maker_balance(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'earned', e.earned, 'held', e.held, 'withdrawn', w.paid, 'requested', w.requested,
    'available', e.earned - e.held - w.paid - w.requested,
    'min_payout', s.min_payout, 'hold_days', s.hold_days, 'fee_pct', s.fee_pct)
  from public.market_settings s
  cross join lateral (
    select coalesce(sum(p.seller_amount), 0) as earned,
           coalesce(sum(p.seller_amount) filter (where p.paid_at > now() - make_interval(days => s.hold_days)), 0) as held
    from public.model_purchases p where p.seller_id = p_user and p.status = 'paid') e
  cross join lateral (
    select coalesce(sum(x.amount) filter (where x.status = 'paid'), 0) as paid,
           coalesce(sum(x.amount) filter (where x.status = 'requested'), 0) as requested
    from public.maker_payouts x where x.user_id = p_user) w
  where s.id = 1;
$$;
revoke all on function public.maker_balance(uuid) from public, anon, authenticated;

create or replace function public.my_balance() returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.maker_balance(auth.uid()) where auth.uid() is not null;
$$;
revoke all on function public.my_balance() from public, anon;
grant execute on function public.my_balance() to authenticated;

create or replace function public.request_payout() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_balance jsonb;
  v_info public.maker_payout_info;
  v_amount numeric(12,2);
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Entra a tu cuenta.';
  end if;
  -- Un retiro a la vez por vendedor, aunque pidan dos al mismo tiempo.
  perform pg_advisory_xact_lock(hashtext('payout:' || auth.uid()::text));
  if exists (select 1 from public.maker_payouts where user_id = auth.uid() and status = 'requested') then
    raise exception 'Ya tienes un retiro en proceso.';
  end if;
  select * into v_info from public.maker_payout_info where user_id = auth.uid();
  if not found then
    raise exception 'Primero guarda a dónde te pagamos (CLABE, Mercado Pago o PayPal).';
  end if;
  v_balance := public.maker_balance(auth.uid());
  v_amount := (v_balance ->> 'available')::numeric;
  if v_amount <= 0 or v_amount < (v_balance ->> 'min_payout')::numeric then
    raise exception 'El retiro mínimo es de $% y tienes $% disponibles.', v_balance ->> 'min_payout', greatest(v_amount, 0);
  end if;
  insert into public.maker_payouts (user_id, amount, method, account, holder)
  values (auth.uid(), v_amount, v_info.method, v_info.account, v_info.holder)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'amount', v_amount);
end $$;
revoke all on function public.request_payout() from public, anon;
grant execute on function public.request_payout() to authenticated;

-- Fotos (públicas) y archivos (privados) de los modelos, en <user_id>/<model_id>/…
insert into storage.buckets (id, name, public) values ('model-media', 'model-media', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('model-files', 'model-files', false)
on conflict (id) do nothing;

drop policy if exists kubbo_model_media_own on storage.objects;
create policy kubbo_model_media_own on storage.objects for all to authenticated
  using (bucket_id = 'model-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'model-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists kubbo_model_files_own on storage.objects;
create policy kubbo_model_files_own on storage.objects for all to authenticated
  using (bucket_id = 'model-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'model-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Un archivo de <vendedor>/<modelo>/… lo lee quien tiene acceso a ese modelo de ese vendedor.
create or replace function public.can_read_model_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.has_model_access(m.id)
    from public.models m
    where m.id = case when (string_to_array(p_name, '/'))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      then ((string_to_array(p_name, '/'))[2])::uuid end
      and m.user_id::text = (string_to_array(p_name, '/'))[1]), false);
$$;
revoke all on function public.can_read_model_file(text) from public, anon;
grant execute on function public.can_read_model_file(text) to authenticated;

drop policy if exists kubbo_model_files_buyers on storage.objects;
create policy kubbo_model_files_buyers on storage.objects for select to authenticated
  using (bucket_id = 'model-files' and public.can_read_model_file(name));

-- ───────────────────────── Filamentos de varios colores y fosforescentes ─────────────────────────
-- color_hex sigue siendo el color principal (con él se comparan los colores del laminador);
-- extra_colors son los demás de un filamento bicolor, tricolor o arcoíris, en orden.
-- glow: brilla en la oscuridad; las listas muestran su muestra con un brillo.

alter table public.filament_catalog add column if not exists extra_colors text[] not null default '{}';
alter table public.filament_catalog add column if not exists glow boolean not null default false;
alter table public.filaments add column if not exists extra_colors text[] not null default '{}';
alter table public.filaments add column if not exists glow boolean not null default false;

alter table public.filament_catalog drop constraint if exists filament_catalog_extra_colors_check;
alter table public.filament_catalog add constraint filament_catalog_extra_colors_check check (cardinality(extra_colors) <= 11);
alter table public.filaments drop constraint if exists filaments_extra_colors_check;
alter table public.filaments add constraint filaments_extra_colors_check check (cardinality(extra_colors) <= 11);

-- ───────────────────────── Cambio de moneda del taller ─────────────────────────
-- El dueño cambia la moneda y, si quiere, todo su dinero se convierte al tipo de cambio que la app le
-- mostró (p_factor = cuánto vale 1 de la moneda anterior en la nueva), en una sola transacción.
-- p_from evita convertir dos veces si la pantalla estaba vieja. Corre con los permisos del usuario.
create or replace function public.change_currency(p_from text, p_to text, p_factor numeric) returns void
language plpgsql set search_path = '' as $$
declare
  v_shop uuid := auth.uid();
  f numeric := p_factor;
begin
  if v_shop is null or public.current_shop() is distinct from v_shop then
    raise exception using errcode = 'P0001', message = 'Solo el dueño del taller cambia su moneda, desde su propio taller.';
  end if;
  if p_to !~ '^[A-Z]{3}$' then
    raise exception using errcode = 'P0001', message = 'Moneda no válida.';
  end if;
  if not exists (select 1 from public.profiles where id = v_shop and currency = p_from) then
    raise exception using errcode = 'P0001', message = 'Tu moneda ya cambió. Recarga la página e inténtalo de nuevo.';
  end if;
  if f is null then
    update public.profiles set currency = p_to where id = v_shop;
    return;
  end if;
  if not (f > 0) then
    raise exception using errcode = 'P0001', message = 'Tipo de cambio no válido.';
  end if;

  update public.profiles set
    currency = p_to,
    kwh_price = round(kwh_price * f, 4),
    overheads = coalesce((
      select jsonb_agg(case when jsonb_typeof(o -> 'amount') = 'number'
                            then jsonb_set(o, '{amount}', to_jsonb(round((o ->> 'amount')::numeric * f, 2))) else o end
                       order by i)
      from jsonb_array_elements(overheads) with ordinality as x (o, i)), '[]'::jsonb)
  where id = v_shop;

  update public.printers set hourly_cost = round(hourly_cost * f, 2), purchase_price = round(purchase_price * f, 2) where user_id = v_shop;
  update public.filaments set cost_per_kg = round(cost_per_kg * f, 2) where user_id = v_shop;
  update public.materials set cost_per_unit = round(cost_per_unit * f, 4) where user_id = v_shop;
  update public.channels set fixed_fee = round(fixed_fee * f, 2), shipping_cost = round(shipping_cost * f, 2) where user_id = v_shop;
  update public.packaging set cost = round(cost * f, 2) where user_id = v_shop;
  update public.carriers set
    prices = coalesce(array(select round(p * f, 2) from unnest(prices) with ordinality as x (p, i) order by i), '{}'),
    rates = coalesce((
      select jsonb_agg(coalesce((
               select jsonb_agg(case when jsonb_typeof(c) = 'number' then to_jsonb(round((c #>> '{}')::numeric * f, 2)) else c end order by j)
               from jsonb_array_elements(r) with ordinality as y (c, j)), '[]'::jsonb) order by i)
      from jsonb_array_elements(rates) with ordinality as x (r, i)), '[]'::jsonb)
  where user_id = v_shop;
  update public.products set
    extra_cost = round(extra_cost * f, 2),
    prices = coalesce((
      select jsonb_object_agg(k, case when jsonb_typeof(v) = 'number' then to_jsonb(round((v #>> '{}')::numeric * f, 2)) else v end)
      from jsonb_each(prices) as x (k, v)), '{}'::jsonb)
  where user_id = v_shop;
  update public.sales set
    unit_price = round(unit_price * f, 2),
    fees = round(fees * f, 2),
    shipping_cost = round(shipping_cost * f, 2),
    unit_cost = round(unit_cost * f, 2),
    packaging_cost = round(packaging_cost * f, 2),
    list_price = round(list_price * f, 2)
  where user_id = v_shop;
  update public.maintenance set cost = round(cost * f, 2) where user_id = v_shop;
  update public.printer_wear set amount = round(amount * f, 2) where user_id = v_shop;
  update public.print_job_filaments set cost = round(cost * f, 2) where user_id = v_shop;
  -- Sus triggers recalculan el costo real por gramo / unidad con los montos nuevos.
  update public.expenses set amount = round(amount * f, 2) where user_id = v_shop;
end $$;
revoke all on function public.change_currency(text, text, numeric) from public, anon;
grant execute on function public.change_currency(text, text, numeric) to authenticated;
