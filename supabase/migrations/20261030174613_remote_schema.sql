


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."complete_onboarding"("p_opening_balance" bigint, "p_income_amount" bigint, "p_frequency" "text", "p_opening_date" "date", "p_next_income_date" "date", "p_bills" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_onboarded boolean;
  v_bill jsonb;
  v_name text;
  v_amount bigint;
  v_type text;
  v_frequency text;
  v_start date;
  v_count integer;
  v_number text;
  v_category_text text;
  v_category_id uuid;
  v_category_name text;
  v_other_description text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak valid';
  END IF;

  IF p_opening_balance IS NULL
     OR p_opening_balance < 0
     OR p_income_amount IS NULL
     OR p_income_amount < 0 THEN
    RAISE EXCEPTION 'Nominal tidak valid';
  END IF;

  IF p_frequency IS NULL
     OR p_frequency NOT IN
       ('weekly', 'biweekly', 'monthly') THEN
    RAISE EXCEPTION 'Frekuensi pemasukan tidak valid';
  END IF;

  IF p_opening_date IS NULL
     OR p_next_income_date IS NULL
     OR p_next_income_date <= p_opening_date THEN
    RAISE EXCEPTION 'Tanggal kiriman tidak valid';
  END IF;

  IF p_bills IS NULL
     OR jsonb_typeof(p_bills) <> 'array'
     OR jsonb_array_length(p_bills) > 30 THEN
    RAISE EXCEPTION 'Daftar tagihan tidak valid';
  END IF;

  INSERT INTO public.profiles (id, onboarded)
  VALUES (v_user_id, false)
  ON CONFLICT (id) DO NOTHING;

  SELECT onboarded
  INTO v_onboarded
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_onboarded THEN
    RETURN 'already_complete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.income_plans
    WHERE user_id = v_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.fixed_bills
    WHERE user_id = v_user_id
  ) THEN
    RAISE EXCEPTION
      'Data onboarding lama ditemukan. Perlu pemeriksaan sebelum melanjutkan';
  END IF;

  -- Validasi seluruh tagihan sebelum menyimpan.
  FOR v_bill IN
    SELECT value FROM jsonb_array_elements(p_bills)
  LOOP
    IF jsonb_typeof(v_bill) <> 'object' THEN
      RAISE EXCEPTION 'Format tagihan tidak valid';
    END IF;

    v_name := trim(v_bill->>'name');
    v_number := v_bill->>'amount';
    v_type := v_bill->>'schedule_type';
    v_frequency := v_bill->>'frequency';
    v_category_text := v_bill->>'category_id';

    IF v_name IS NULL
       OR length(v_name) NOT BETWEEN 1 AND 150
       OR v_number IS NULL
       OR v_number !~ '^[0-9]{1,15}$' THEN
      RAISE EXCEPTION
        'Nama atau nominal tagihan tidak valid';
    END IF;

    v_amount := v_number::bigint;

    IF v_amount <= 0 THEN
      RAISE EXCEPTION
        'Nominal tagihan harus lebih dari nol';
    END IF;

    IF v_type IS NULL
       OR v_type NOT IN
         ('once', 'limited', 'ongoing') THEN
      RAISE EXCEPTION 'Jenis tagihan tidak valid';
    END IF;

    IF v_frequency IS NULL
       OR v_frequency NOT IN ('weekly', 'monthly') THEN
      RAISE EXCEPTION 'Frekuensi tagihan tidak valid';
    END IF;

    IF v_bill->>'start_date' IS NULL THEN
      RAISE EXCEPTION
        'Tanggal pertama tagihan wajib diisi';
    END IF;

    v_start := (v_bill->>'start_date')::date;

    IF v_category_text IS NULL
       OR v_category_text !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN
      RAISE EXCEPTION
        'Kategori tagihan wajib dipilih';
    END IF;

    v_category_id := v_category_text::uuid;

    -- Validasi kategori milik user sendiri.
    SELECT c.name
    INTO v_category_name
    FROM public.categories c
    WHERE c.id = v_category_id
      AND c.user_id = v_user_id
      AND c.type = 'expense'
      AND c.is_archived = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Kategori tagihan tidak valid atau bukan milik pengguna';
    END IF;

    v_other_description :=
      NULLIF(trim(v_bill->>'other_description'), '');

    IF lower(trim(v_category_name)) = 'lainnya' THEN
      IF v_other_description IS NULL
         OR length(v_other_description) > 120 THEN
        RAISE EXCEPTION
          'Kategori Lainnya wajib memiliki keterangan, maksimal 120 karakter';
      END IF;
    ELSE
      -- Keterangan khusus hanya berlaku untuk Lainnya.
      v_other_description := NULL;
    END IF;

    IF v_type = 'limited' THEN
      v_number := v_bill->>'total_occurrences';

      IF v_number IS NULL
         OR v_number !~ '^[0-9]{1,3}$' THEN
        RAISE EXCEPTION
          'Jumlah pembayaran tidak valid';
      END IF;

      v_count := v_number::integer;

      IF v_count < 1 OR v_count > 120 THEN
        RAISE EXCEPTION
          'Jumlah pembayaran harus 1 sampai 120';
      END IF;
    END IF;
  END LOOP;

  UPDATE public.profiles
  SET opening_balance = p_opening_balance,
      opening_date = p_opening_date
  WHERE id = v_user_id;

  INSERT INTO public.income_plans (
    user_id,
    source_name,
    amount,
    frequency,
    last_income_date,
    next_income_date,
    is_active
  )
  VALUES (
    v_user_id,
    'Uang kiriman',
    p_income_amount,
    p_frequency,
    p_opening_date,
    p_next_income_date,
    true
  );

  FOR v_bill IN
    SELECT value FROM jsonb_array_elements(p_bills)
  LOOP
    v_start := (v_bill->>'start_date')::date;
    v_type := v_bill->>'schedule_type';

    v_category_id :=
      (v_bill->>'category_id')::uuid;

    SELECT c.name
    INTO v_category_name
    FROM public.categories c
    WHERE c.id = v_category_id
      AND c.user_id = v_user_id
      AND c.type = 'expense'
      AND c.is_archived = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Kategori tagihan tidak lagi tersedia';
    END IF;

    v_other_description :=
      CASE
        WHEN lower(trim(v_category_name)) = 'lainnya'
        THEN NULLIF(
          trim(v_bill->>'other_description'),
          ''
        )
        ELSE NULL
      END;

    INSERT INTO public.fixed_bills (
      user_id,
      name,
      amount,
      category_id,
      other_description,
      frequency,
      schedule_type,
      start_date,
      total_occurrences,
      due_day,
      due_weekday,
      is_active
    )
    VALUES (
      v_user_id,
      trim(v_bill->>'name'),
      (v_bill->>'amount')::bigint,
      v_category_id,
      v_other_description,
      v_bill->>'frequency',
      v_type,
      v_start,
      CASE
        WHEN v_type = 'limited'
        THEN (v_bill->>'total_occurrences')::integer
        ELSE NULL
      END,
      EXTRACT(DAY FROM v_start)::integer,
      EXTRACT(DOW FROM v_start)::integer,
      true
    );
  END LOOP;

  UPDATE public.profiles
  SET onboarded = true
  WHERE id = v_user_id;

  RETURN 'created';
END;
$_$;


ALTER FUNCTION "public"."complete_onboarding"("p_opening_balance" bigint, "p_income_amount" bigint, "p_frequency" "text", "p_opening_date" "date", "p_next_income_date" "date", "p_bills" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_fixed_bill"("p_name" "text", "p_amount" bigint, "p_category_id" "uuid", "p_schedule_type" "text", "p_frequency" "text", "p_start_date" "date", "p_total_occurrences" integer DEFAULT NULL::integer, "p_other_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_category_name text;
  v_due_day smallint;
  v_due_weekday smallint;
  v_bill_id uuid;
BEGIN
  -- 1. Pengguna harus login.
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Pengguna belum login.';
  END IF;

  -- 2. Validasi nama dan nominal.
  IF p_name IS NULL
     OR length(trim(p_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION
      'Nama tagihan harus berisi 1-120 karakter.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal tagihan harus lebih dari 0.';
  END IF;

  -- 3. Validasi jenis dan frekuensi.
  IF p_schedule_type IS NULL
     OR p_schedule_type NOT IN
       ('once', 'limited', 'ongoing') THEN
    RAISE EXCEPTION 'Jenis tagihan tidak valid.';
  END IF;

  IF p_frequency IS NULL
     OR p_frequency NOT IN ('weekly', 'monthly') THEN
    RAISE EXCEPTION 'Frekuensi tidak valid.';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal mulai wajib diisi.';
  END IF;

  -- Tagihan sekali bayar menggunakan frekuensi monthly
  -- sebagai representasi teknis dalam skema sekarang.
  IF p_schedule_type = 'once'
     AND p_frequency <> 'monthly' THEN
    RAISE EXCEPTION
      'Tagihan sekali bayar harus menggunakan monthly.';
  END IF;

  -- 4. Validasi jumlah cicilan.
  IF p_schedule_type = 'limited' THEN
    IF p_total_occurrences IS NULL
       OR p_total_occurrences NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION
        'Jumlah cicilan harus 1-120 kali.';
    END IF;
  ELSIF p_total_occurrences IS NOT NULL THEN
    RAISE EXCEPTION
      'Jumlah cicilan hanya berlaku untuk cicilan terbatas.';
  END IF;

  -- 5. Pastikan kategori pengeluaran milik pengguna.
  SELECT c.name
  INTO v_category_name
  FROM public.categories AS c
  WHERE c.id = p_category_id
    AND c.user_id = v_user_id
    AND c.type = 'expense'
    AND c.is_archived = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Kategori pengeluaran tidak valid.';
  END IF;

  -- 6. Validasi keterangan kategori Lainnya.
  IF lower(trim(v_category_name)) = 'lainnya' THEN
    IF p_other_description IS NULL
       OR length(trim(p_other_description))
          NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION
        'Keterangan kategori Lainnya wajib diisi.';
    END IF;
  END IF;

  -- 7. Tentukan tanggal atau hari jatuh tempo.
  IF p_frequency = 'monthly' THEN
    v_due_day := extract(day FROM p_start_date)::smallint;
    v_due_weekday := NULL;
  ELSE
    v_due_day := NULL;
    v_due_weekday := extract(dow FROM p_start_date)::smallint;
  END IF;

  -- 8. Simpan satu tagihan.
  INSERT INTO public.fixed_bills (
    user_id,
    name,
    amount,
    category_id,
    other_description,
    frequency,
    due_day,
    due_weekday,
    schedule_type,
    start_date,
    total_occurrences,
    is_active
  )
  VALUES (
    v_user_id,
    trim(p_name),
    p_amount,
    p_category_id,
    CASE
      WHEN lower(trim(v_category_name)) = 'lainnya'
      THEN trim(p_other_description)
      ELSE NULL
    END,
    p_frequency,
    v_due_day,
    v_due_weekday,
    p_schedule_type,
    p_start_date,
    p_total_occurrences,
    true
  )
  RETURNING id INTO v_bill_id;

  RETURN v_bill_id;
END;
$$;


ALTER FUNCTION "public"."create_fixed_bill"("p_name" "text", "p_amount" bigint, "p_category_id" "uuid", "p_schedule_type" "text", "p_frequency" "text", "p_start_date" "date", "p_total_occurrences" integer, "p_other_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_fixed_bill"("p_bill_id" "uuid", "p_stop_from_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_bill public.fixed_bills%ROWTYPE;
  v_today date :=
    (now() AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
  -- 1. Pengguna wajib login.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu';
  END IF;

  IF p_bill_id IS NULL OR p_stop_from_date IS NULL THEN
    RAISE EXCEPTION
      'Tagihan dan tanggal penghentian wajib diisi';
  END IF;

  -- 2. Tidak mengizinkan penghentian tanggal lampau.
  IF p_stop_from_date < v_today THEN
    RAISE EXCEPTION
      'Tanggal penghentian tidak boleh di masa lalu';
  END IF;

  -- 3. Kunci dan validasi kepemilikan tagihan.
  SELECT *
  INTO v_bill
  FROM public.fixed_bills
  WHERE id = p_bill_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan';
  END IF;

  -- 4. Hanya untuk tagihan rutin.
  IF v_bill.schedule_type IS DISTINCT FROM 'ongoing' THEN
    RAISE EXCEPTION
      'Penghentian hanya tersedia untuk tagihan rutin';
  END IF;

  -- 5. Cegah penghentian ulang.
  IF v_bill.stop_from_date IS NOT NULL THEN
    IF v_bill.stop_from_date = p_stop_from_date
       AND v_bill.is_active = false THEN
      RETURN 'already_stopped';
    END IF;

    RAISE EXCEPTION
      'Tagihan sudah memiliki tanggal penghentian';
  END IF;

  IF v_bill.is_active = false THEN
    RAISE EXCEPTION
      'Tagihan sudah nonaktif tanpa tanggal penghentian';
  END IF;

  -- 6. Jangan batalkan periode yang sudah dibayar.
  IF EXISTS (
    SELECT 1
    FROM public.bill_payments AS bp
    WHERE bp.bill_id = v_bill.id
      AND bp.user_id = v_user_id
      AND bp.due_date >= p_stop_from_date
  ) THEN
    RAISE EXCEPTION
      'Ada pembayaran tercatat pada atau setelah tanggal penghentian';
  END IF;

  -- 7. Simpan penghentian.
  -- Riwayat pembayaran dan transaksi tidak dihapus.
  UPDATE public.fixed_bills
  SET
    stop_from_date = p_stop_from_date,
    is_active = false,
    updated_at = now()
  WHERE id = v_bill.id
    AND user_id = v_user_id;

  RETURN 'deactivated';
END;
$$;


ALTER FUNCTION "public"."deactivate_fixed_bill"("p_bill_id" "uuid", "p_stop_from_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );

  insert into public.categories (user_id, name, type, icon, keywords, sort_order) values
    (new.id, 'Makanan',        'expense', 'utensils',      '{makan,nasi,ayam,warteg,kopi,jajan,gofood,grabfood}', 1),
    (new.id, 'Transportasi',   'expense', 'bus',           '{bensin,parkir,ojek,gojek,grab,angkot,tol}',          2),
    (new.id, 'Kos',            'expense', 'home',          '{kos,sewa}',                                          3),
    (new.id, 'Laundry',        'expense', 'shirt',         '{laundry,cuci,setrika}',                              4),
    (new.id, 'Pulsa & Internet','expense','wifi',          '{pulsa,paket,data,wifi,internet}',                    5),
    (new.id, 'Hiburan',        'expense', 'gamepad',       '{nonton,netflix,spotify,game,bioskop}',               6),
    (new.id, 'Belanja',        'expense', 'shopping-bag',  '{beli,belanja,shopee,tokopedia,indomaret,alfamart}',  7),
    (new.id, 'Pendidikan',     'expense', 'book',          '{buku,fotokopi,print,ukt,kuliah}',                    8),
    (new.id, 'Kesehatan',      'expense', 'heart-pulse',   '{obat,dokter,apotek,vitamin}',                        9),
    (new.id, 'Lainnya',        'expense', 'ellipsis',      '{}',                                                  10),
    (new.id, 'Uang kiriman',   'income',  'wallet',        '{kiriman,transfer,ortu}',                             1),
    (new.id, 'Penghasilan sendiri','income','briefcase',   '{gaji,freelance,honor}',                              2),
    (new.id, 'Lainnya',        'income',  'ellipsis',      '{}',                                                  3);

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_bill_occurrence"("p_bill_id" "uuid", "p_due_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_bill public.fixed_bills%ROWTYPE;
  v_transaction_id uuid;
  v_payment_date date :=
    (now() AT TIME ZONE 'Asia/Jakarta')::date;

  v_valid_due_date boolean := false;
  v_index integer;
  v_candidate date;
  v_month_start date;
  v_last_day integer;
BEGIN
  -- Pengguna wajib terautentikasi.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu';
  END IF;

  IF p_bill_id IS NULL OR p_due_date IS NULL THEN
    RAISE EXCEPTION 'Tagihan dan tanggal wajib diisi';
  END IF;

  -- Kunci tagihan milik pengguna.
  SELECT *
  INTO v_bill
  FROM public.fixed_bills
  WHERE id = p_bill_id
    AND user_id = v_user_id
    AND (
      is_active = true
      OR stop_from_date IS NOT NULL
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan';
  END IF;

  -- Pembayaran yang sudah ada tidak dicatat dua kali.
  IF EXISTS (
    SELECT 1
    FROM public.bill_payments
    WHERE bill_id = p_bill_id
      AND user_id = v_user_id
      AND due_date = p_due_date
  ) THEN
    RETURN 'already_paid';
  END IF;

  -- Tidak boleh membayar periode setelah penghentian.
  IF v_bill.stop_from_date IS NOT NULL
     AND p_due_date >= v_bill.stop_from_date THEN
    RAISE EXCEPTION
      'Jadwal ini sudah tidak berlaku karena tagihan dihentikan';
  END IF;

  -- Sekali bayar.
  IF v_bill.schedule_type = 'once' THEN
    v_valid_due_date :=
      p_due_date = v_bill.start_date;

  -- Cicilan terbatas.
  ELSIF v_bill.schedule_type = 'limited' THEN
    IF v_bill.start_date IS NULL
       OR v_bill.total_occurrences IS NULL
       OR v_bill.total_occurrences < 1 THEN
      RAISE EXCEPTION 'Jadwal cicilan tidak lengkap';
    END IF;

    FOR v_index IN 0..v_bill.total_occurrences - 1 LOOP
      IF v_bill.frequency = 'weekly' THEN
        v_candidate :=
          v_bill.start_date + (v_index * 7);
      ELSE
        v_month_start :=
          (
            date_trunc('month', v_bill.start_date)
            + make_interval(months => v_index)
          )::date;

        v_last_day :=
          EXTRACT(
            DAY FROM (
              v_month_start
              + INTERVAL '1 month'
              - INTERVAL '1 day'
            )
          )::integer;

        v_candidate :=
          v_month_start
          + (
            LEAST(
              EXTRACT(DAY FROM v_bill.start_date)::integer,
              v_last_day
            ) - 1
          );
      END IF;

      IF v_candidate = p_due_date THEN
        v_valid_due_date := true;
        EXIT;
      END IF;
    END LOOP;

  -- Tagihan rutin.
  ELSIF v_bill.schedule_type = 'ongoing' THEN
    IF v_bill.start_date IS NULL
       OR p_due_date >= v_bill.start_date THEN

      IF v_bill.frequency = 'weekly' THEN
        v_valid_due_date :=
          EXTRACT(DOW FROM p_due_date)::integer
          = v_bill.due_weekday;

      ELSIF v_bill.frequency = 'monthly' THEN
        v_valid_due_date :=
          EXTRACT(DAY FROM p_due_date)::integer
          = LEAST(
            v_bill.due_day,
            EXTRACT(
              DAY FROM (
                date_trunc('month', p_due_date)
                + INTERVAL '1 month'
                - INTERVAL '1 day'
              )
            )::integer
          );
      END IF;
    END IF;
  END IF;

  IF NOT v_valid_due_date THEN
    RAISE EXCEPTION
      'Tanggal tersebut bukan jadwal tagihan yang valid';
  END IF;

  -- Catat pengeluaran aktual.
  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    category_id,
    note,
    occurred_on,
    source
  )
  VALUES (
    v_user_id,
    'expense',
    v_bill.amount,
    v_bill.category_id,
    'Pembayaran tagihan: ' || v_bill.name,
    v_payment_date,
    'manual'
  )
  RETURNING id INTO v_transaction_id;

  -- Hubungkan pengeluaran dengan jadwal yang dibayar.
  INSERT INTO public.bill_payments (
    user_id,
    bill_id,
    due_date,
    transaction_id
  )
  VALUES (
    v_user_id,
    p_bill_id,
    p_due_date,
    v_transaction_id
  );

  RETURN 'paid';
END;
$$;


ALTER FUNCTION "public"."pay_bill_occurrence"("p_bill_id" "uuid", "p_due_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_bill_payment_transaction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."protect_bill_payment_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bill_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bill_id" "uuid" NOT NULL,
    "due_date" "date" NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bill_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "amount" bigint NOT NULL,
    "warn_at" smallint DEFAULT 80 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "budgets_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "budgets_warn_at_check" CHECK ((("warn_at" >= 1) AND ("warn_at" <= 100)))
);


ALTER TABLE "public"."budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "icon" "text",
    "keywords" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "categories_type_check" CHECK (("type" = ANY (ARRAY['expense'::"text", 'income'::"text"])))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fixed_bills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "category_id" "uuid",
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "due_day" smallint,
    "due_weekday" smallint,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "schedule_type" "text" DEFAULT 'ongoing'::"text",
    "start_date" "date",
    "total_occurrences" integer,
    "other_description" "text",
    "stop_from_date" "date",
    CONSTRAINT "fixed_bills_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "fixed_bills_check" CHECK (((("frequency" = 'monthly'::"text") AND ("due_day" IS NOT NULL)) OR (("frequency" = 'weekly'::"text") AND ("due_weekday" IS NOT NULL)))),
    CONSTRAINT "fixed_bills_due_day_check" CHECK ((("due_day" >= 1) AND ("due_day" <= 31))),
    CONSTRAINT "fixed_bills_due_weekday_check" CHECK ((("due_weekday" >= 0) AND ("due_weekday" <= 6))),
    CONSTRAINT "fixed_bills_frequency_check" CHECK (("frequency" = ANY (ARRAY['weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "fixed_bills_occurrences_check" CHECK ((("total_occurrences" IS NULL) OR ("total_occurrences" > 0))),
    CONSTRAINT "fixed_bills_other_description_length_check" CHECK ((("other_description" IS NULL) OR (("length"(TRIM(BOTH FROM "other_description")) >= 1) AND ("length"(TRIM(BOTH FROM "other_description")) <= 120)))),
    CONSTRAINT "fixed_bills_schedule_type_check" CHECK (("schedule_type" = ANY (ARRAY['once'::"text", 'limited'::"text", 'ongoing'::"text"])))
);


ALTER TABLE "public"."fixed_bills" OWNER TO "postgres";


COMMENT ON COLUMN "public"."fixed_bills"."stop_from_date" IS 'Tanggal mulai penghentian jadwal. Occurrence dengan due_date >= stop_from_date tidak lagi menjadi kewajiban terjadwal. NULL berarti belum ada tanggal penghentian.';



CREATE TABLE IF NOT EXISTS "public"."income_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_name" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "frequency" "text" NOT NULL,
    "interval_days" integer,
    "last_income_date" "date" NOT NULL,
    "next_income_date" "date" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "income_plans_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "income_plans_check" CHECK ((("frequency" <> 'custom'::"text") OR ("interval_days" IS NOT NULL))),
    CONSTRAINT "income_plans_check1" CHECK (("next_income_date" > "last_income_date")),
    CONSTRAINT "income_plans_frequency_check" CHECK (("frequency" = ANY (ARRAY['weekly'::"text", 'biweekly'::"text", 'monthly'::"text", 'custom'::"text"]))),
    CONSTRAINT "income_plans_interval_days_check" CHECK (("interval_days" > 0))
);


ALTER TABLE "public"."income_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "currency" "text" DEFAULT 'IDR'::"text" NOT NULL,
    "opening_balance" bigint DEFAULT 0 NOT NULL,
    "opening_date" "date",
    "onboarded" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "category_id" "uuid",
    "note" "text",
    "occurred_on" "date" NOT NULL,
    "payment_method" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transactions_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "transactions_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'text'::"text", 'ocr'::"text"]))),
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['expense'::"text", 'income'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_balance" WITH ("security_invoker"='true') AS
 SELECT "p"."id" AS "user_id",
    (("p"."opening_balance")::numeric + COALESCE("sum"(
        CASE
            WHEN ("t"."type" = 'income'::"text") THEN "t"."amount"
            ELSE (- "t"."amount")
        END), (0)::numeric)) AS "balance"
   FROM ("public"."profiles" "p"
     LEFT JOIN "public"."transactions" "t" ON ((("t"."user_id" = "p"."id") AND (("p"."opening_date" IS NULL) OR ("t"."occurred_on" >= "p"."opening_date")))))
  GROUP BY "p"."id", "p"."opening_balance";


ALTER VIEW "public"."v_balance" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bill_payments"
    ADD CONSTRAINT "bill_payments_bill_id_due_date_key" UNIQUE ("bill_id", "due_date");



ALTER TABLE ONLY "public"."bill_payments"
    ADD CONSTRAINT "bill_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_user_id_category_id_key" UNIQUE ("user_id", "category_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_type_name_key" UNIQUE ("user_id", "type", "name");



ALTER TABLE ONLY "public"."fixed_bills"
    ADD CONSTRAINT "fixed_bills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."income_plans"
    ADD CONSTRAINT "income_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "one_active_income_plan_per_user" ON "public"."income_plans" USING "btree" ("user_id") WHERE "is_active";



CREATE INDEX "transactions_user_category_idx" ON "public"."transactions" USING "btree" ("user_id", "category_id", "occurred_on");



CREATE INDEX "transactions_user_date_idx" ON "public"."transactions" USING "btree" ("user_id", "occurred_on" DESC);



CREATE OR REPLACE TRIGGER "protect_linked_bill_payment" BEFORE DELETE OR UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."protect_bill_payment_transaction"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."budgets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."fixed_bills" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."income_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."bill_payments"
    ADD CONSTRAINT "bill_payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "public"."fixed_bills"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bill_payments"
    ADD CONSTRAINT "bill_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bill_payments"
    ADD CONSTRAINT "bill_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fixed_bills"
    ADD CONSTRAINT "fixed_bills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fixed_bills"
    ADD CONSTRAINT "fixed_bills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."income_plans"
    ADD CONSTRAINT "income_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."bill_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fixed_bills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."income_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own profile" ON "public"."profiles" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own rows" ON "public"."bill_payments" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own rows" ON "public"."budgets" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own rows" ON "public"."categories" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own rows" ON "public"."fixed_bills" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own rows" ON "public"."income_plans" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own rows" ON "public"."transactions" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_onboarding"("p_opening_balance" bigint, "p_income_amount" bigint, "p_frequency" "text", "p_opening_date" "date", "p_next_income_date" "date", "p_bills" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_onboarding"("p_opening_balance" bigint, "p_income_amount" bigint, "p_frequency" "text", "p_opening_date" "date", "p_next_income_date" "date", "p_bills" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_onboarding"("p_opening_balance" bigint, "p_income_amount" bigint, "p_frequency" "text", "p_opening_date" "date", "p_next_income_date" "date", "p_bills" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_fixed_bill"("p_name" "text", "p_amount" bigint, "p_category_id" "uuid", "p_schedule_type" "text", "p_frequency" "text", "p_start_date" "date", "p_total_occurrences" integer, "p_other_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_fixed_bill"("p_name" "text", "p_amount" bigint, "p_category_id" "uuid", "p_schedule_type" "text", "p_frequency" "text", "p_start_date" "date", "p_total_occurrences" integer, "p_other_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_fixed_bill"("p_name" "text", "p_amount" bigint, "p_category_id" "uuid", "p_schedule_type" "text", "p_frequency" "text", "p_start_date" "date", "p_total_occurrences" integer, "p_other_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."deactivate_fixed_bill"("p_bill_id" "uuid", "p_stop_from_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deactivate_fixed_bill"("p_bill_id" "uuid", "p_stop_from_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_fixed_bill"("p_bill_id" "uuid", "p_stop_from_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_bill_occurrence"("p_bill_id" "uuid", "p_due_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_bill_occurrence"("p_bill_id" "uuid", "p_due_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_bill_occurrence"("p_bill_id" "uuid", "p_due_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_bill_payment_transaction"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_bill_payment_transaction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_bill_payment_transaction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."bill_payments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."bill_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."bill_payments" TO "service_role";



GRANT ALL ON TABLE "public"."budgets" TO "anon";
GRANT ALL ON TABLE "public"."budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."budgets" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."fixed_bills" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."fixed_bills" TO "authenticated";
GRANT ALL ON TABLE "public"."fixed_bills" TO "service_role";



GRANT ALL ON TABLE "public"."income_plans" TO "anon";
GRANT ALL ON TABLE "public"."income_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."income_plans" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."v_balance" TO "anon";
GRANT ALL ON TABLE "public"."v_balance" TO "authenticated";
GRANT ALL ON TABLE "public"."v_balance" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







