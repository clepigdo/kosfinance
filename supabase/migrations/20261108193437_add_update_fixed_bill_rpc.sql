
-- KF-03: Edit tagihan yang belum memiliki pembayaran.

CREATE OR REPLACE FUNCTION public.update_fixed_bill(
    p_bill_id uuid,
    p_name text,
    p_amount bigint,
    p_category_id uuid,
    p_schedule_type text,
    p_frequency text,
    p_start_date date,
    p_total_occurrences integer DEFAULT NULL,
    p_other_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := (SELECT auth.uid());
    v_bill public.fixed_bills%ROWTYPE;
    v_category_name text;
    v_description text;
BEGIN
    -- Autentikasi.
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Silakan login terlebih dahulu';
    END IF;

    IF p_bill_id IS NULL THEN
        RAISE EXCEPTION 'ID tagihan tidak valid';
    END IF;

    -- Kunci tagihan untuk mencegah perubahan bersamaan.
    SELECT *
    INTO v_bill
    FROM public.fixed_bills
    WHERE id = p_bill_id
      AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tagihan tidak ditemukan';
    END IF;

    -- Hanya tagihan aktif yang boleh diedit.
    IF NOT v_bill.is_active
       OR v_bill.stop_from_date IS NOT NULL THEN
        RAISE EXCEPTION 'Tagihan yang sudah dihentikan tidak dapat diedit';
    END IF;

    -- Jangan mengubah tagihan yang sudah pernah dibayar.
    IF EXISTS (
        SELECT 1
        FROM public.bill_payments
        WHERE bill_id = p_bill_id
    ) THEN
        RAISE EXCEPTION
            'Tagihan yang sudah memiliki pembayaran belum dapat diedit';
    END IF;

    -- Validasi nama dan nominal.
    IF p_name IS NULL
       OR length(trim(p_name)) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'Nama tagihan harus berisi 1-120 karakter';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Nominal harus lebih dari nol';
    END IF;

    -- Validasi jenis dan frekuensi.
    IF p_schedule_type IS NULL
       OR p_schedule_type NOT IN ('once', 'limited', 'ongoing') THEN
        RAISE EXCEPTION 'Jenis tagihan tidak valid';
    END IF;

    IF p_frequency IS NULL
       OR p_frequency NOT IN ('weekly', 'monthly') THEN
        RAISE EXCEPTION 'Frekuensi tagihan tidak valid';
    END IF;

    IF p_schedule_type = 'once'
       AND p_frequency <> 'monthly' THEN
        RAISE EXCEPTION
            'Tagihan sekali bayar harus menggunakan monthly';
    END IF;

    IF p_start_date IS NULL THEN
        RAISE EXCEPTION 'Tanggal pertama tagihan wajib diisi';
    END IF;

    -- Validasi jumlah cicilan.
    IF p_schedule_type = 'limited' THEN
        IF p_total_occurrences IS NULL
           OR p_total_occurrences NOT BETWEEN 1 AND 120 THEN
            RAISE EXCEPTION 'Jumlah cicilan harus 1-120 kali';
        END IF;
    ELSIF p_total_occurrences IS NOT NULL THEN
        RAISE EXCEPTION
            'Jumlah cicilan hanya berlaku untuk tagihan terbatas';
    END IF;

    -- Pastikan kategori valid dan milik pengguna.
    SELECT name
    INTO v_category_name
    FROM public.categories
    WHERE id = p_category_id
      AND user_id = v_user_id
      AND type = 'expense'
      AND is_archived = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kategori pengeluaran tidak valid';
    END IF;

    -- Validasi kategori Lainnya.
    v_description := NULLIF(trim(p_other_description), '');

    IF lower(trim(v_category_name)) = 'lainnya' THEN
        IF v_description IS NULL
           OR length(v_description) > 120 THEN
            RAISE EXCEPTION
                'Kategori Lainnya membutuhkan keterangan maksimal 120 karakter';
        END IF;
    ELSE
        v_description := NULL;
    END IF;

    -- Simpan perubahan yang sudah divalidasi.
    UPDATE public.fixed_bills
    SET
        name = trim(p_name),
        amount = p_amount,
        category_id = p_category_id,
        schedule_type = p_schedule_type,
        frequency = p_frequency,
        start_date = p_start_date,
        total_occurrences = p_total_occurrences,
        other_description = v_description,
        due_day = CASE
            WHEN p_frequency = 'monthly'
            THEN EXTRACT(DAY FROM p_start_date)::smallint
            ELSE NULL
        END,
        due_weekday = CASE
            WHEN p_frequency = 'weekly'
            THEN EXTRACT(DOW FROM p_start_date)::smallint
            ELSE NULL
        END
    WHERE id = p_bill_id
      AND user_id = v_user_id;

    RETURN p_bill_id;
END;
$$;

-- Hanya pengguna terautentikasi yang boleh memanggil RPC.
REVOKE ALL ON FUNCTION public.update_fixed_bill(
    uuid, text, bigint, uuid, text, text, date, integer, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_fixed_bill(
    uuid, text, bigint, uuid, text, text, date, integer, text
) TO authenticated;
