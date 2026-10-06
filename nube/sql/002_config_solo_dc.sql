-- Los datos fiscales los carga Digital Carmelo (no el cliente desde la app): se quitan los permisos de escritura.
drop policy if exists "arca_config: crear la propia" on public.arca_config;
drop policy if exists "arca_config: editar la propia" on public.arca_config;
