-- Facturador ARCA · tablas para los datos fiscales y los comprobantes emitidos.
-- NO aplicado todavía: lo aplica Alexis en el proyecto de Supabase cuando esté todo listo.

-- 1) Producto nuevo (fuera de la Suite salvo que se active ARCA_EN_SUITE en la función)
insert into public.products (product_slug, public_name, short_description, app_url, category, is_active, display_order, allows_trial, default_free_usage)
values ('facturador-arca', 'Facturador ARCA', 'Factura electrónica C para monotributistas, conectada a ARCA.', 'https://facturador-arca.digitalcarmelo.com/', 'herramientas', true, 65, true, 1)
on conflict (product_slug) do nothing;

-- 2) Datos fiscales de cada usuario (los carga desde la app)
create table if not exists public.arca_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cuit text not null check (cuit ~ '^[0-9]{11}$'),
  razon_social text not null,
  domicilio text not null,
  iibb text,
  inicio_actividades date,
  pto_vta integer not null check (pto_vta between 1 and 99998),
  condicion text not null default 'monotributo',
  verificado_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.arca_config enable row level security;
create policy "arca_config: ver la propia" on public.arca_config for select using (auth.uid() = user_id);
create policy "arca_config: crear la propia" on public.arca_config for insert with check (auth.uid() = user_id);
create policy "arca_config: editar la propia" on public.arca_config for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) Comprobantes emitidos (solo los escribe la función, con la clave de servicio)
create table if not exists public.arca_comprobantes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  ambiente text not null check (ambiente in ('dev', 'prod')),
  cuit text not null,
  pto_vta integer not null,
  cbte_tipo integer not null,           -- 11 Factura C · 13 Nota de Crédito C
  cbte_nro integer not null,
  cbte_fch date not null,
  concepto integer not null,            -- 1 productos · 2 servicios · 3 ambos
  doc_tipo integer not null,            -- 80 CUIT · 86 CUIL · 96 DNI · 99 consumidor final
  doc_nro text not null,
  receptor_nombre text,
  receptor_domicilio text,
  condicion_iva_receptor integer not null,
  imp_total numeric(14,2) not null,
  descuento numeric(14,2) not null default 0,
  items jsonb not null,
  servicio jsonb,
  asociado jsonb,                       -- en la nota de crédito: la factura que anula
  venta_ref text,                       -- id de la venta en la app
  cae text not null,
  cae_vto date not null,
  observaciones jsonb,
  unique (ambiente, cuit, pto_vta, cbte_tipo, cbte_nro)
);
create index if not exists arca_comprobantes_user on public.arca_comprobantes (user_id, created_at desc);
alter table public.arca_comprobantes enable row level security;
create policy "arca_comprobantes: ver los propios" on public.arca_comprobantes for select using (auth.uid() = user_id);
-- sin políticas de insert/update/delete: los comprobantes emitidos no se tocan desde el navegador
