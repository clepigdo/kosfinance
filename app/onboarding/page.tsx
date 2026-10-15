"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  House,
  Wallet,
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
  return (
    <div className="relative mt-1.5">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-neutral-500">
        Rp
      </span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-neutral-300 bg-white py-3 pl-10 pr-3.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
      />
    </div>
  );
}

export default function OnboardingPage() {
  const [balance, setBalance] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [nextIncome, setNextIncome] = useState("");
  const [billName, setBillName] = useState("Sewa kos");
  const [billAmount, setBillAmount] = useState("");
  const [billDay, setBillDay] = useState("1");
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
    if (Number(billAmount) > 0) {
      const bill = await supabase.from("fixed_bills").insert({
        user_id: user.id,
        name: billName.trim() || "Tagihan",
        amount: Number(billAmount),
        frequency: "monthly",
        due_day: Number(billDay),
      });
      if (bill.error) return fail(bill.error.message);
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
            title="Tagihan tetap bulanan"
            hint="Opsional. Kosongkan nominal kalau belum mau diisi."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="billName" className={labelClass}>
                  Nama
                </label>
                <input
                  id="billName"
                  type="text"
                  value={billName}
                  onChange={(e) => setBillName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="billAmount" className={labelClass}>
                  Nominal
                </label>
                <RpInput
                  id="billAmount"
                  value={billAmount}
                  onChange={setBillAmount}
                  placeholder="800000"
                />
              </div>
              <div>
                <label htmlFor="billDay" className={labelClass}>
                  Jatuh tempo
                </label>
                <select
                  id="billDay"
                  value={billDay}
                  onChange={(e) => setBillDay(e.target.value)}
                  className={inputClass}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      Tanggal {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
