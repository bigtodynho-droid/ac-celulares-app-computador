-- AC V5.7: permitir marcar a parcela anterior como juros recebidos.
-- Alteração aditiva: não apaga nem modifica registros existentes.
BEGIN;
ALTER TABLE public.installments DROP CONSTRAINT IF EXISTS installments_status_check;
ALTER TABLE public.installments
  ADD CONSTRAINT installments_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'partial'::text, 'paid'::text, 'late'::text, 'interest_only'::text]));
COMMIT;
