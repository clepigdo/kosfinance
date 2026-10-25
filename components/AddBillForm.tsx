"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type ScheduleType = "once" | "limited" | "ongoing";
type Frequency = "monthly" | "weekly";
type Category = { id: string; name: string };

const inputClass =
  "mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700";

const labelClass = "block text-sm font-medium text-neutral-800";

const supabase = createClient();

export default function AddBillForm() {
  const router = useRouter();
  const submittingRef = useRef(false);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [otherDescription, setOtherDescription] = useState("");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("once");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState("");
  const [totalOccurrences, setTotalOccurrences] = useState("2");

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCategories() {
      const { data: auth, error: authError } = await supabase.auth.getUser();

      if (!active) return;

      if (authError || !auth.user) {
        setCategoriesError("Sesi login tidak valid.");
        setCategoriesLoading(false);
        return;
      }

      const { data, error: queryError } = await supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", auth.user.id)
        .eq("type", "expense")
        .eq("is_archived", false)
        .order("sort_order")
        .order("name");

      if (!active) return;

      if (queryError) {
        setCategoriesError("Gagal memuat kategori pengeluaran.");
      } else if (!data?.length) {
        setCategoriesError("Belum ada kategori pengeluaran yang tersedia.");
      } else {
        setCategories(data);
      }

      setCategoriesLoading(false);
    }

    void loadCategories();

    return () => {
      active = false;
    };
  }, []);

  const selectedCategory = categories.find(
    (category) => category.id === categoryId,
  );

  const isOther = selectedCategory?.name.trim().toLowerCase() === "lainnya";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);
    setError("");

    try {
      const numericAmount = Number(amount);
      const count = Number(totalOccurrences);

      if (!name.trim() || name.trim().length > 120) {
        throw new Error("Nama tagihan harus berisi 1–120 karakter.");
      }

      if (
        !amount ||
        !Number.isSafeInteger(numericAmount) ||
        numericAmount <= 0
      ) {
        throw new Error("Nominal tagihan tidak valid.");
      }

      if (!selectedCategory) {
        throw new Error("Pilih kategori pengeluaran.");
      }

      if (
        isOther &&
        (!otherDescription.trim() || otherDescription.trim().length > 120)
      ) {
        throw new Error(
          "Isi keterangan kategori Lainnya (maksimal 120 karakter).",
        );
      }

      const parsedDate = new Date(`${startDate}T00:00:00Z`);

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== startDate
      ) {
        throw new Error("Tanggal pembayaran tidak valid.");
      }

      if (
        scheduleType === "limited" &&
        (!Number.isInteger(count) || count < 1 || count > 120)
      ) {
        throw new Error("Jumlah cicilan harus antara 1 dan 120 kali.");
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Sesi login berakhir. Silakan login kembali.");
      }

      const { error: rpcError } = await supabase.rpc("create_fixed_bill", {
        p_name: name.trim(),
        p_amount: numericAmount,
        p_category_id: categoryId,
        p_schedule_type: scheduleType,
        p_frequency: scheduleType === "once" ? "monthly" : frequency,
        p_start_date: startDate,
        p_total_occurrences: scheduleType === "limited" ? count : null,
        p_other_description: isOther ? otherDescription.trim() : null,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      router.replace("/bills");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan tagihan.");
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/bills"
          className="text-sm font-medium text-green-700 hover:underline"
        >
          ← Kembali ke Tagihan
        </Link>

        <h1 className="mt-4 text-2xl font-bold">Tambah Tagihan</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Tambahkan kewajiban baru tanpa mengurangi saldo sekarang.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-green-100 bg-white p-5"
      >
        <div>
          <label htmlFor="bill-name" className={labelClass}>
            Nama tagihan
          </label>
          <input
            id="bill-name"
            className={inputClass}
            placeholder="Contoh: Internet kos"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div>
          <label htmlFor="bill-amount" className={labelClass}>
            Nominal per pembayaran (Rp)
          </label>
          <input
            id="bill-amount"
            type="text"
            inputMode="numeric"
            className={inputClass}
            placeholder="Contoh: 200000"
            value={amount ? Number(amount).toLocaleString("id-ID") : ""}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            required
          />
        </div>

        <div>
          <label htmlFor="bill-category" className={labelClass}>
            Kategori pengeluaran
          </label>
          <select
            id="bill-category"
            className={inputClass}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setOtherDescription("");
            }}
            required
            disabled={categoriesLoading || Boolean(categoriesError)}
          >
            <option value="" disabled>
              {categoriesLoading ? "Memuat kategori..." : "Pilih kategori"}
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          {categoriesError && (
            <p role="alert" className="mt-2 text-sm text-rose-700">
              {categoriesError}
            </p>
          )}
        </div>

        {isOther && (
          <div>
            <label htmlFor="bill-other" className={labelClass}>
              Keterangan kategori lainnya
            </label>
            <input
              id="bill-other"
              className={inputClass}
              value={otherDescription}
              onChange={(e) => setOtherDescription(e.target.value)}
              maxLength={120}
              placeholder="Contoh: Langganan internet"
              required
            />
          </div>
        )}

        <div>
          <label htmlFor="bill-type" className={labelClass}>
            Jenis pembayaran
          </label>
          <select
            id="bill-type"
            className={inputClass}
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value as ScheduleType)}
          >
            <option value="once">Sekali bayar</option>
            <option value="limited">Cicilan terbatas</option>
            <option value="ongoing">Tagihan rutin</option>
          </select>
        </div>

        {scheduleType !== "once" && (
          <div>
            <label htmlFor="bill-frequency" className={labelClass}>
              Frekuensi pembayaran
            </label>
            <select
              id="bill-frequency"
              className={inputClass}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              <option value="monthly">Setiap bulan</option>
              <option value="weekly">Setiap minggu</option>
            </select>
          </div>
        )}

        <div>
          <label htmlFor="bill-date" className={labelClass}>
            {scheduleType === "once"
              ? "Tanggal jatuh tempo"
              : "Tanggal pembayaran pertama yang dicatat"}
          </label>
          <input
            id="bill-date"
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <p className="mt-1.5 text-xs text-neutral-500">
            Untuk tagihan yang sudah berjalan, gunakan tanggal kewajiban pertama
            yang ingin dilacak di KosFinance. Jadwal sebelumnya tidak otomatis
            dianggap lunas.
          </p>
        </div>

        {scheduleType === "limited" && (
          <div>
            <label htmlFor="bill-count" className={labelClass}>
              Jumlah pembayaran
            </label>
            <input
              id="bill-count"
              type="number"
              min={1}
              max={120}
              step={1}
              className={inputClass}
              value={totalOccurrences}
              onChange={(e) => setTotalOccurrences(e.target.value)}
              required
            />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/bills"
            className="rounded-xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium"
          >
            Batal
          </Link>

          <button
            type="submit"
            disabled={loading || categoriesLoading || Boolean(categoriesError)}
            className="rounded-xl bg-green-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Menyimpan..." : "Simpan tagihan"}
          </button>
        </div>
      </form>
    </div>
  );
}
