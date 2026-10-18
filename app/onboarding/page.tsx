"use client";

import { useState } from "react";
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
  { value: "biweekly", label: "Setiap 2 minggu" },
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

type BillInput = {
  id: string;
  name: string;
  amount: string;
  frequency: "monthly" | "weekly";
  dueDay: string;
  dueWeekday: string;
};

const newBill = (): BillInput => ({
  id: crypto.randomUUID(),
  name: "",
  amount: "",
  frequency: "monthly",
  dueDay: "1",
  dueWeekday: "1",
});

export default function OnboardingPage() {
  const [balance, setBalance] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [nextIncome, setNextIncome] = useState("");

  const [bills, setBills] = useState<BillInput[]>([
    {
      id: "initial-bill",
      name: "Sewa kos",
      amount: "",
      frequency: "monthly",
      dueDay: "1",
      dueWeekday: "1",
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

  const router = useRouter();
  const supabase = createClient();

  const fail = (msg: string) => {
    setError(msg);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const todayISO = toISO(new Date());
    if (nextIncome <= todayISO) {
      return setError("Tanggal kiriman berikutnya harus setelah hari ini.");
    }

    const preparedBills = [];

    for (const bill of bills) {
      // Baris kosong boleh dilewati.
      if (!bill.name.trim() && !bill.amount.trim()) continue;

      const amount = Number(bill.amount);

      if (
        !bill.name.trim() ||
        !bill.amount.trim() ||
        !Number.isSafeInteger(amount) ||
        amount <= 0
      ) {
        return setError(
          "Setiap tagihan harus memiliki nama dan nominal yang valid.",
        );
      }

      preparedBills.push({
        name: bill.name.trim(),
        amount,
        frequency: bill.frequency,
        due_day: bill.frequency === "monthly" ? Number(bill.dueDay) : null,
        due_weekday:
          bill.frequency === "weekly" ? Number(bill.dueWeekday) : null,
      });
    }

    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    // 1. Profil: saldo awal. onboarded baru di-true-kan di langkah terakhir.
    const profile = await supabase.from("profiles").upsert({
      id: user.id,
      opening_balance: Number(balance) || 0,
      opening_date: todayISO,
      onboarded: false,
    });
    if (profile.error) return fail(profile.error.message);

    // 2. Rencana pemasukan (hapus dulu supaya aman kalau form dikirim ulang)
    await supabase.from("income_plans").delete().eq("user_id", user.id);
    const plan = await supabase.from("income_plans").insert({
      user_id: user.id,
      source_name: "Uang kiriman",
      amount: Number(incomeAmount) || 0,
      frequency,
      last_income_date: todayISO,
      next_income_date: nextIncome,
    });
    if (plan.error) return fail(plan.error.message);

    // 3. Tagihan tetap (opsional)
    await supabase.from("fixed_bills").delete().eq("user_id", user.id);

    // Simpan seluruh tagihan yang diisi.
    // Jangan menghapus baris tagihan lama di sini.
    if (preparedBills.length > 0) {
      const { error: billsError } = await supabase.from("fixed_bills").insert(
        preparedBills.map((bill) => ({
          ...bill,
          user_id: user.id,
        })),
      );

      if (billsError) {
        return fail(billsError.message);
      }
    }

    // 4. Tandai selesai
    const done = await supabase
      .from("profiles")
      .update({ onboarded: true })
      .eq("id", user.id);
    if (done.error) return fail(done.error.message);

    router.push("/dashboard");
    router.refresh();
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
                  Seberapa sering
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
            <div>
              <label htmlFor="next" className={labelClass}>
                Kiriman berikutnya masuk tanggal
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`bill-frequency-${bill.id}`}
                      className={labelClass}
                    >
                      Frekuensi
                    </label>
                    <select
                      id={`bill-frequency-${bill.id}`}
                      className={inputClass}
                      value={bill.frequency}
                      onChange={(e) =>
                        updateBill(bill.id, {
                          frequency: e.target.value as BillInput["frequency"],
                        })
                      }
                    >
                      <option value="monthly">Setiap bulan</option>
                      <option value="weekly">Setiap minggu</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor={`bill-due-${bill.id}`}
                      className={labelClass}
                    >
                      Jatuh tempo
                    </label>

                    {bill.frequency === "monthly" ? (
                      <select
                        id={`bill-due-${bill.id}`}
                        className={inputClass}
                        value={bill.dueDay}
                        onChange={(e) =>
                          updateBill(bill.id, { dueDay: e.target.value })
                        }
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(
                          (day) => (
                            <option key={day} value={day}>
                              Tanggal {day}
                            </option>
                          ),
                        )}
                      </select>
                    ) : (
                      <select
                        id={`bill-due-${bill.id}`}
                        className={inputClass}
                        value={bill.dueWeekday}
                        onChange={(e) =>
                          updateBill(bill.id, { dueWeekday: e.target.value })
                        }
                      >
                        {[
                          "Minggu",
                          "Senin",
                          "Selasa",
                          "Rabu",
                          "Kamis",
                          "Jumat",
                          "Sabtu",
                        ].map((day, index) => (
                          <option key={day} value={index}>
                            {day}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
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
