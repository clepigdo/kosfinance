"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  House,
  Wallet,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { addDaysISO, toISO, useToday } from "@/lib/useToday";

const FREQUENCIES = [
  { value: "weekly", label: "Setiap minggu" },
  { value: "monthly", label: "Setiap bulan" },
];

const inputClass =
  "mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700";
const labelClass = "block text-sm font-medium";
const hintClass = "mt-1.5 text-xs text-neutral-600";

function Section({
  Icon,
  tile,
  title,
  hint,
  children,
}: {
  Icon: LucideIcon;
  tile: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-green-100 bg-white p-5">
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 place-items-center rounded-xl ${tile}`}
        >
          <Icon size={20} />
        </span>
        <div>
          <h2 className="text-base font-bold leading-tight">{title}</h2>
          {hint && <p className="text-xs text-neutral-600">{hint}</p>}
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function RpInput({
  id,
  value,
  onChange,
  placeholder,
  required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  const formatRupiah = (raw: string) => {
    const digits = raw.replace(/\D/g, "");

    if (!digits) return "";

    return Number(digits).toLocaleString("id-ID");
  };

  const handleChange = (input: string) => {
    const digits = input.replace(/\D/g, "");
    onChange(digits);
  };

  return (
    <div className="relative mt-1.5">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-neutral-500">
        Rp
      </span>

      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9.]*"
        value={formatRupiah(value)}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={formatRupiah(placeholder)}
        required={required}
        autoComplete="off"
        className="w-full rounded-xl border border-neutral-300 bg-white py-3 pl-10 pr-3.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
      />
    </div>
  );
}

type ScheduleType = "once" | "limited" | "ongoing";
type BillFrequency = "monthly" | "weekly";

type ExpenseCategory = {
  id: string;
  name: string;
};

type BillInput = {
  id: string;
  name: string;
  amount: string;
  categoryId: string;
  otherDescription: string;
  scheduleType: ScheduleType;
  frequency: BillFrequency;
  startDate: string;
  totalOccurrences: string;
};

const newBill = (): BillInput => ({
  id: crypto.randomUUID(),
  name: "",
  amount: "",
  categoryId: "",
  otherDescription: "",
  scheduleType: "once",
  frequency: "monthly",
  startDate: "",
  totalOccurrences: "2",
});
const supabase = createClient();
export default function OnboardingPage() {
  const [balance, setBalance] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [nextIncome, setNextIncome] = useState("");

  const [bills, setBills] = useState<BillInput[]>([
    {
      id: "initial-bill",
      name: "",
      amount: "",
      categoryId: "",
      otherDescription: "",
      scheduleType: "once",
      frequency: "monthly",
      startDate: "",
      totalOccurrences: "2",
    },
  ]);

  const addBill = () => {
    setBills((current) => [...current, newBill()]);
  };

  const updateBill = (id: string, changes: Partial<BillInput>) => {
    setBills((current) =>
      current.map((bill) => (bill.id === id ? { ...bill, ...changes } : bill)),
    );
  };

  const removeBill = (id: string) => {
    setBills((current) => current.filter((bill) => bill.id !== id));
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const router = useRouter();

  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(
    [],
  );

  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [categoriesError, setCategoriesError] = useState("");

  useEffect(() => {
    let active = true;

    const loadCategories = async () => {
      setCategoriesLoading(true);
      setCategoriesError("");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (authError || !user) {
        setCategoriesError("Sesi login tidak valid. Silakan login kembali.");
        setCategoriesLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("type", "expense")
        .eq("is_archived", false)
        .order("sort_order")
        .order("name");

      if (!active) return;

      if (error) {
        setCategoriesError(error.message);
      } else if (!data?.length) {
        setCategoriesError(
          "Belum ada kategori pengeluaran. " +
            "Silakan siapkan kategori terlebih dahulu.",
        );
      } else {
        setExpenseCategories(data);
      }

      setCategoriesLoading(false);
    };

    void loadCategories();

    return () => {
      active = false;
    };
  }, [supabase]);

  const fail = (msg: string) => {
    setError(msg);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);
    setError("");

    try {
      const today = toISO(new Date());

      const openingBalance = Number(balance);
      const income = Number(incomeAmount);

      if (
        !balance.trim() ||
        !incomeAmount.trim() ||
        !Number.isSafeInteger(openingBalance) ||
        !Number.isSafeInteger(income) ||
        openingBalance < 0 ||
        income < 0
      ) {
        throw new Error("Saldo atau nominal kiriman tidak valid.");
      }

      if (!nextIncome || nextIncome <= today) {
        throw new Error("Tanggal kiriman berikutnya harus setelah hari ini.");
      }

      const preparedBills = [];

      for (const bill of bills) {
        const isEmpty =
          !bill.name.trim() && !bill.amount.trim() && !bill.startDate;

        if (isEmpty) continue;

        const amount = Number(bill.amount);
        const count = Number(bill.totalOccurrences);

        if (
          !bill.name.trim() ||
          !bill.amount.trim() ||
          !Number.isSafeInteger(amount) ||
          amount <= 0
        ) {
          throw new Error(`Nama atau nominal tagihan tidak valid.`);
        }

        const date = bill.startDate;
        const parsedDate = new Date(`${date}T00:00:00Z`);

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(parsedDate.getTime()) ||
          parsedDate.toISOString().slice(0, 10) !== date
        ) {
          throw new Error(`Tanggal jatuh tempo ${bill.name} tidak valid.`);
        }

        if (
          bill.scheduleType === "limited" &&
          (!Number.isInteger(count) || count < 1 || count > 120)
        ) {
          throw new Error(`Jumlah pembayaran ${bill.name} harus 1–120 kali.`);
        }

        if (
          !bill.categoryId ||
          !expenseCategories.some((category) => category.id === bill.categoryId)
        ) {
          throw new Error(
            `Pilih kategori pengeluaran untuk tagihan "${bill.name}".`,
          );
        }

        const selectedCategory = expenseCategories.find(
          (category) => category.id === bill.categoryId,
        );

        const isOther =
          selectedCategory?.name.trim().toLowerCase() === "lainnya";

        const otherDescription = bill.otherDescription.trim();

        if (
          isOther &&
          (otherDescription.length === 0 || otherDescription.length > 120)
        ) {
          throw new Error(
            `Isi keterangan kategori Lainnya untuk tagihan "${bill.name}" (maksimal 120 karakter).`,
          );
        }

        preparedBills.push({
          name: bill.name.trim(),
          amount,
          category_id: bill.categoryId,
          other_description: isOther ? otherDescription : null,
          frequency: bill.frequency,
          schedule_type: bill.scheduleType,
          start_date: date,
          total_occurrences: bill.scheduleType === "limited" ? count : null,
        });
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Sesi login berakhir. Silakan login kembali.");
      }

      // Semua penyimpanan dilakukan oleh satu RPC.
      const { data, error: rpcError } = await supabase.rpc(
        "complete_onboarding",
        {
          p_opening_balance: openingBalance,
          p_income_amount: income,
          p_frequency: frequency,
          p_opening_date: today,
          p_next_income_date: nextIncome,
          p_bills: preparedBills,
        },
      );

      if (rpcError) throw rpcError;

      if (data !== "created" && data !== "already_complete") {
        throw new Error("Respons penyimpanan onboarding tidak dikenal.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menyimpan onboarding.",
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const today = useToday();
  const minNext = today ? addDaysISO(today, 1) : undefined;

  return (
    <main className="min-h-screen bg-[#f3f8f4] text-neutral-900">
      <div className="mx-auto max-w-lg px-5 py-8 md:py-12">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-green-700 text-white">
            <Wallet size={22} />
          </span>
          <span className="text-lg font-bold tracking-tight">KosFinance</span>
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight">
          Atur keuangan kosmu
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Isi dulu kondisi keuanganmu sekarang, nanti aplikasi bantu hitung
          jatah harian yang aman buat kamu.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Section
            Icon={Wallet}
            tile="bg-green-100 text-green-700"
            title="Saldo kamu sekarang"
            hint="Uang tunai dan saldo rekening yang kamu pegang."
          >
            <div>
              <label htmlFor="balance" className={labelClass}>
                Total saldo
              </label>
              <RpInput
                id="balance"
                value={balance}
                onChange={setBalance}
                placeholder="350000"
                required
              />
            </div>
          </Section>

          <Section
            Icon={Banknote}
            tile="bg-amber-100 text-amber-700"
            title="Uang kiriman"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="income" className={labelClass}>
                  Nominal
                </label>
                <RpInput
                  id="income"
                  value={incomeAmount}
                  onChange={setIncomeAmount}
                  placeholder="1500000"
                  required
                />
              </div>
              <div>
                <label htmlFor="freq" className={labelClass}>
                  Frekuensi Uang Kiriman
                </label>
                <select
                  id="freq"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className={inputClass}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className={hintClass}>
              Pilih jadwal kiriman yang paling sering kamu terima. Tanggal
              kiriman berikutnya tetap bisa diubah nanti.
            </p>
            <div>
              <label htmlFor="next" className={labelClass}>
                Kiriman berikutnya masuk tanggal berapa?
              </label>
              <input
                id="next"
                type="date"
                min={minNext}
                value={nextIncome}
                onChange={(e) => setNextIncome(e.target.value)}
                required
                className={inputClass}
              />
              <p className={hintClass}>
                Dipakai untuk menghitung sisa hari di siklus ini.
              </p>
            </div>
          </Section>

          <Section
            Icon={House}
            tile="bg-violet-100 text-violet-700"
            title="Tagihan rutin"
            hint="Tambahkan tagihan wajibmu. Bagian ini opsional."
          >
            {bills.map((bill, index) => (
              <div
                key={bill.id}
                className="space-y-4 rounded-xl border border-neutral-200 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Tagihan {index + 1}</h3>

                  <button
                    type="button"
                    onClick={() => removeBill(bill.id)}
                    className="flex items-center gap-1 text-xs text-rose-700"
                    aria-label={`Hapus tagihan ${index + 1}`}
                  >
                    <Trash2 size={15} />
                    Hapus
                  </button>
                </div>

                <div>
                  <label
                    htmlFor={`bill-name-${bill.id}`}
                    className={labelClass}
                  >
                    Nama tagihan
                  </label>
                  <input
                    id={`bill-name-${bill.id}`}
                    className={inputClass}
                    placeholder="Contoh: Sewa kos"
                    value={bill.name}
                    onChange={(e) =>
                      updateBill(bill.id, { name: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label
                    htmlFor={`bill-amount-${bill.id}`}
                    className={labelClass}
                  >
                    Nominal
                  </label>
                  <RpInput
                    id={`bill-amount-${bill.id}`}
                    value={bill.amount}
                    onChange={(value) => updateBill(bill.id, { amount: value })}
                    placeholder="800000"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`bill-category-${bill.id}`}
                    className={labelClass}
                  >
                    Kategori pengeluaran
                  </label>
                  <select
                    id={`bill-category-${bill.id}`}
                    className={inputClass}
                    value={bill.categoryId}
                    disabled={categoriesLoading || !!categoriesError}
                    onChange={(e) =>
                      updateBill(bill.id, {
                        categoryId: e.target.value,
                        otherDescription: "",
                      })
                    }
                  >
                    <option value="" disabled hidden>
                      {categoriesLoading
                        ? "Memuat kategori..."
                        : "Pilih kategori"}
                    </option>

                    {expenseCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>

                  <p className={hintClass}>
                    Saat tagihan dilunasi, pengeluaran akan dicatat menggunakan
                    kategori ini.
                  </p>
                  {expenseCategories
                    .find((category) => category.id === bill.categoryId)
                    ?.name.trim()
                    .toLowerCase() === "lainnya" && (
                    <div>
                      <label
                        htmlFor={`bill-other-${bill.id}`}
                        className={labelClass}
                      >
                        Jenis pengeluaran lainnya
                        <span className="ml-1 text-rose-600">*</span>
                      </label>

                      <input
                        id={`bill-other-${bill.id}`}
                        type="text"
                        maxLength={120}
                        required
                        value={bill.otherDescription}
                        onChange={(e) =>
                          updateBill(bill.id, {
                            otherDescription: e.target.value,
                          })
                        }
                        placeholder="Contoh: Iuran organisasi"
                        className={inputClass}
                      />

                      <p className={hintClass}>
                        Tuliskan jenis tagihan agar lebih mudah dikenali.
                        Kategorinya tetap Lainnya.
                      </p>
                    </div>
                  )}

                  {categoriesError && (
                    <p role="alert" className="mt-2 text-xs text-rose-700">
                      {categoriesError}
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor={`bill-type-${bill.id}`}
                      className={labelClass}
                    >
                      Jenis tagihan
                    </label>

                    <select
                      id={`bill-type-${bill.id}`}
                      className={inputClass}
                      value={bill.scheduleType}
                      onChange={(e) =>
                        updateBill(bill.id, {
                          scheduleType: e.target.value as ScheduleType,
                        })
                      }
                    >
                      <option value="once">Sekali bayar</option>
                      <option value="limited">Berulang dengan batas</option>
                      <option value="ongoing">Rutin tanpa batas</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor={`bill-start-${bill.id}`}
                      className={labelClass}
                    >
                      {bill.scheduleType === "once"
                        ? "Tanggal jatuh tempo"
                        : "Tanggal jatuh tempo pertama"}
                    </label>

                    <input
                      id={`bill-start-${bill.id}`}
                      type="date"
                      className={inputClass}
                      value={bill.startDate}
                      onChange={(e) =>
                        updateBill(bill.id, {
                          startDate: e.target.value,
                        })
                      }
                    />
                  </div>

                  {bill.scheduleType !== "once" && (
                    <div>
                      <label
                        htmlFor={`bill-frequency-${bill.id}`}
                        className={labelClass}
                      >
                        Frekuensi pembayaran
                      </label>

                      <select
                        id={`bill-frequency-${bill.id}`}
                        className={inputClass}
                        value={bill.frequency}
                        onChange={(e) =>
                          updateBill(bill.id, {
                            frequency: e.target.value as BillFrequency,
                          })
                        }
                      >
                        <option value="monthly">Setiap bulan</option>
                        <option value="weekly">Setiap minggu</option>
                      </select>
                    </div>
                  )}

                  {bill.scheduleType === "limited" && (
                    <div>
                      <label
                        htmlFor={`bill-count-${bill.id}`}
                        className={labelClass}
                      >
                        Jumlah pembayaran
                      </label>

                      <input
                        id={`bill-count-${bill.id}`}
                        type="number"
                        min={1}
                        max={120}
                        step={1}
                        className={inputClass}
                        value={bill.totalOccurrences}
                        onChange={(e) =>
                          updateBill(bill.id, {
                            totalOccurrences: e.target.value,
                          })
                        }
                      />
                      <p className={hintClass}>
                        Contoh: isi 3 untuk tiga kali pembayaran.
                      </p>
                    </div>
                  )}

                  <p className="rounded-lg bg-green-50 p-3 text-xs text-green-800">
                    {bill.scheduleType === "once"
                      ? "Tagihan hanya akan dijadwalkan satu kali."
                      : bill.scheduleType === "limited"
                        ? `Tagihan dijadwalkan ${
                            bill.totalOccurrences || "0"
                          } kali, lalu otomatis selesai.`
                        : "Tagihan berulang sampai kamu menonaktifkannya."}
                  </p>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addBill}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-green-500 px-4 py-3 text-sm font-semibold text-green-700 hover:bg-green-50"
            >
              <Plus size={18} />
              Tambah tagihan
            </button>
          </Section>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
            >
              Gagal menyimpan: {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 py-3.5 text-sm font-semibold text-white hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:opacity-50"
          >
            {loading ? "Menyimpan..." : "Simpan dan mulai"}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>
      </div>
    </main>
  );
}
