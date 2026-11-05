-- Execute no SQL Editor do Supabase para permitir fotos nos celulares já cadastrados.
-- Não apaga nem recria os registros existentes.
alter table public.phones add column if not exists image_data text;
