
CREATE OR REPLACE FUNCTION public.protect_bill_payment_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bill_payments AS bp
    WHERE bp.transaction_id = OLD.id
  ) THEN
    RAISE EXCEPTION
      'Transaksi pelunasan tagihan tidak dapat diubah atau dihapus langsung'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_linked_bill_payment
ON public.transactions;

CREATE TRIGGER protect_linked_bill_payment
BEFORE UPDATE OR DELETE
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.protect_bill_payment_transaction();
