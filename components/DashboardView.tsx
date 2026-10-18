"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Pencil,
  X,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  OctagonAlert,
  ReceiptText,
  TrendingDown,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { rupiah } from "@/lib/format";
import CategoryIcon from "@/components/CategoryIcon";
import { createClient } from "@/utils/supabase/client";
import { todayISO, shortDate } from "@/lib/finance";
import { useRouter } from "next/navigation";

export type DashboardData = {
  name: string;
  categoryPeriodLabel: string;
  balance: number;
  safePerDay: number;
  planId: string;
  nextIncomeDate: string;
  cycleStart: string;
  cycleDay: number; // hari ke-berapa di siklus berjalan
  cycleTotalDays: number;
  daysLeft: number;
  nextIncomeLabel: string; // contoh: "6 Okt"
  spentThisCycle: number;
  avgDaily: number;
  warning: { level: "ok" | "caution" | "danger"; message: string };
  categories: {
    name: string;
    spent: number;
    budget?: number;
    warnAt?: number;
  }[];
  recent: {
    id: string;
    note: string;
    category: string;
    dateLabel: string;
    amount: number;
    type: "income" | "expense";
  }[];
};

const notice = {
  ok: {
    box: "border-green-200 bg-green-50 text-green-900",
    Icon: CircleCheck,
    icon: "text-green-700",
  },
  caution: {
    box: "border-amber-200 bg-amber-50 text-amber-900",
    Icon: TriangleAlert,
    icon: "text-amber-600",
  },
  danger: {
    box: "border-rose-200 bg-rose-50 text-rose-900",
    Icon: OctagonAlert,
    icon: "text-rose-600",
  },
};

function barColor(spent: number, budget?: number, warnAt = 80) {
  if (!budget) return "bg-neutral-400";
  const ratio = (spent / budget) * 100;
  if (ratio >= 100) return "bg-rose-600";
  if (ratio >= warnAt) return "bg-amber-500";
  return "bg-green-600";
}

const card = "rounded-2xl border border-green-100 bg-white";
const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700";

const quickActions: {
  href: string;
  label: string;
  Icon: LucideIcon;
  tile: string;
}[] = [
  {
    href: "/transactions/new",
    label: "Catat pengeluaran",
    Icon: ArrowUpRight,
    tile: "bg-rose-100 text-rose-700",
  },
  {
    href: "/transactions/new?type=income",
    label: "Catat pemasukan",
    Icon: ArrowDownLeft,
    tile: "bg-green-100 text-green-700",
  },
  {
    href: "/transactions",
    label: "Semua transaksi",
    Icon: ReceiptText,
    tile: "bg-sky-100 text-sky-700",
  },
];

function Stat({
  Icon,
  tile,
  label,
  value,
  hint,
  action,
}: {
  Icon: LucideIcon;
  tile: string;
  label: string;
  value: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${card} p-4 flex flex-col justify-between`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tile}`}>
          <Icon size={18} />
        </span>
        {action && <div>{action}</div>}
      </div>

      <div className="mt-3">
        <p className="text-xs text-neutral-600">{label}</p>
        <p className="mt-0.5 text-base font-bold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-neutral-600">{hint}</p>}
      </div>
    </div>
  );
}

type Props = {
  planId: string;
  currentDate: string;
  cycleStart: string;
};

function EditNextIncome({ planId, currentDate, cycleStart }: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(currentDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const today = todayISO();

  const close = () => {
    if (loading) return;

    setOpen(false);
    setDate(currentDate);
    setError("");
  };

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    setError("");

    if (!date || date <= today || date <= cycleStart) {
      setError("Pilih tanggal setelah hari ini dan awal siklus.");
      return;
    }

    if (date === currentDate) {
      close();
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Sesi login berakhir. Silakan login kembali.");
      }

      const { data, error: updateError } = await supabase
        .from("income_plans")
        .update({
          next_income_date: date,
        })
        .eq("id", planId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;

      if (!data) {
        throw new Error(
          "Rencana pemasukan tidak ditemukan atau tidak dapat diperbarui.",
        );
      }

      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal memperbarui tanggal kiriman.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDate(currentDate);
          setError("");
          setOpen(true);
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-green-200 px-3 py-2 text-xs font-semibold text-green-700 transition hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-700"
      >
        <Pencil size={14} />
        Ubah
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="income-dialog-title"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-green-100 text-green-700">
                <CalendarClock size={23} />
              </span>

              <button
                type="button"
                onClick={close}
                disabled={loading}
                aria-label="Tutup dialog"
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <h2
              id="income-dialog-title"
              className="mt-5 text-lg font-bold text-neutral-900"
            >
              Ubah estimasi kiriman
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Perbarui tanggal perkiraan uang kiriman berikutnya. Jatah harianmu
              akan dihitung ulang secara otomatis.
            </p>

            <form onSubmit={save} className="mt-5">
              <label
                htmlFor="next-income-date"
                className="block text-sm font-semibold text-neutral-800"
              >
                Tanggal kiriman berikutnya
              </label>

              <input
                id="next-income-date"
                type="date"
                required
                min={today}
                value={date}
                disabled={loading}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-green-700 disabled:opacity-50"
              />

              <p className="mt-2 text-xs text-neutral-500">
                Tanggal sebelumnya: {shortDate(currentDate)}
              </p>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700"
                >
                  {error}
                </p>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={loading}
                  className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {loading ? "Menyimpan..." : "Simpan tanggal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function DashboardView({ data }: { data: DashboardData }) {
  const cyclePct = Math.min((data.cycleDay / data.cycleTotalDays) * 100, 100);
  const maxSpent = Math.max(...data.categories.map((c) => c.spent), 1);
  const n = notice[data.warning.level];

  return (
    <div className="space-y-5">
      {/* Sapaan */}
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-green-100 text-lg font-bold text-green-800">
          {data.name.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="text-lg font-bold leading-tight">Halo, {data.name}</h1>
          <p className="text-sm text-neutral-600">
            Ini kondisi uangmu hari ini
          </p>
        </div>
      </div>

      {/* Jatah aman */}
      <section
        aria-labelledby="aman-title"
        className="relative overflow-hidden rounded-3xl bg-green-700 p-6 text-white md:p-8"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-green-600/60"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-16 right-20 h-40 w-40 rounded-full bg-green-800/40"
        />

        <div className="relative">
          <h2 id="aman-title" className="text-sm font-medium text-green-50">
            Jatah aman kamu hari ini
          </h2>
          <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums md:text-6xl">
            {rupiah(data.safePerDay)}
          </p>
          <p className="mt-2 text-sm text-green-50">
            {data.daysLeft > 0
              ? `Dihitung sampai kiriman ${data.nextIncomeLabel}, ${data.daysLeft} hari lagi.`
              : "Kiriman berikutnya jatuh hari ini atau sudah lewat."}
          </p>

          <div className="mt-6">
            <div
              className="h-2.5 w-full rounded-full bg-white/25"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={data.cycleTotalDays}
              aria-valuenow={data.cycleDay}
              aria-label="Posisi hari di siklus kiriman"
            >
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${cyclePct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-green-50">
              <span>
                Hari ke-{data.cycleDay} dari {data.cycleTotalDays}
              </span>
              <span>Kiriman {data.nextIncomeLabel}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Aksi cepat */}
      <nav aria-label="Aksi cepat" className="grid grid-cols-3 gap-3">
        {quickActions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={`${card} flex flex-col items-center gap-2 p-3 text-center text-xs font-medium text-neutral-800 hover:border-green-300 ${focus}`}
          >
            <span
              className={`grid h-11 w-11 place-items-center rounded-full ${a.tile}`}
            >
              <a.Icon size={22} />
            </span>
            {a.label}
          </Link>
        ))}
      </nav>

      {/* Peringatan */}
      <p
        className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${n.box}`}
        role={data.warning.level === "ok" ? "status" : "alert"}
      >
        <n.Icon size={20} className={`mt-0.5 shrink-0 ${n.icon}`} />
        {data.warning.message}
      </p>

      {/* Ringkasan */}
      <section
        aria-label="Ringkasan siklus"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <Stat
          Icon={Wallet}
          tile="bg-green-100 text-green-700"
          label="Saldo sekarang"
          value={rupiah(data.balance)}
          action={
            <Link
              href="/transactions/new"
              className="inline-flex items-center gap-1.5 rounded-xl
        border border-green-200 px-3 py-2 text-xs
        font-semibold text-green-700 transition
        hover:bg-green-50"
            >
              <Pencil size={14} />
              Koreksi
            </Link>
          }
        />
        <Stat
          Icon={TrendingDown}
          tile="bg-rose-100 text-rose-700"
          label="Pengeluaran siklus ini"
          value={rupiah(data.spentThisCycle)}
        />
        <Stat
          Icon={CalendarDays}
          tile="bg-sky-100 text-sky-700"
          label="Rata-rata per hari"
          value={rupiah(data.avgDaily)}
          hint="7 hari terakhir"
        />
        <Stat
          Icon={CalendarClock}
          tile="bg-amber-100 text-amber-700"
          label="Kiriman berikutnya"
          value={data.nextIncomeLabel}
          hint={data.daysLeft > 0 ? `${data.daysLeft} hari lagi` : "Hari ini"}
          action={
            <EditNextIncome
              planId={data.planId}
              currentDate={data.nextIncomeDate}
              cycleStart={data.cycleStart}
            />
          }
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Per kategori */}
        <section className={`${card} p-5`} aria-labelledby="kategori-title">
          <h2 id="kategori-title" className="text-base font-bold">
            Pengeluaran per kategori
          </h2>

          <p className="mt-1 text-xs text-neutral-500">
            Periode {data.categoryPeriodLabel}
          </p>

          {data.categories.length === 0 ? (
            <div className="mt-4 flex flex-col items-center rounded-xl bg-green-50 px-4 py-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-green-700">
                <ReceiptText size={22} />
              </span>
              <p className="mt-3 text-sm font-medium">
                Belum ada pengeluaran di siklus ini
              </p>
              <Link
                href="/transactions/new"
                className={`mt-2 text-sm font-semibold text-green-800 underline underline-offset-4 ${focus}`}
              >
                Catat yang pertama
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {data.categories.map((c) => {
                const pct = c.budget
                  ? Math.min((c.spent / c.budget) * 100, 100)
                  : (c.spent / maxSpent) * 100;
                return (
                  <li key={c.name} className="flex items-center gap-3">
                    <CategoryIcon name={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {rupiah(c.spent)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full rounded-full bg-neutral-100">
                        <div
                          className={`h-full rounded-full ${barColor(c.spent, c.budget, c.warnAt)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {c.budget ? (
                        <p className="mt-1 text-right text-xs tabular-nums text-neutral-600">
                          dari {rupiah(c.budget)}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Transaksi terbaru */}
        <section className={`${card} p-5`} aria-labelledby="recent-title">
          <div className="flex items-center justify-between">
            <h2 id="recent-title" className="text-base font-bold">
              Transaksi terbaru
            </h2>
            <Link
              href="/transactions"
              className={`flex items-center text-sm font-semibold text-green-800 ${focus}`}
            >
              Lihat semua
              <ChevronRight size={16} />
            </Link>
          </div>

          {data.recent.length === 0 ? (
            <p className="mt-4 rounded-xl bg-green-50 px-4 py-8 text-center text-sm text-neutral-700">
              Belum ada transaksi. Catat pengeluaran pertamamu lewat tombol
              Catat.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-neutral-100">
              {data.recent.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <CategoryIcon name={t.category} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {t.note || t.category}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {t.category}, {t.dateLabel}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      t.type === "income"
                        ? "text-green-700"
                        : "text-neutral-900"
                    }`}
                  >
                    {t.type === "income" ? "+" : "-"}
                    {rupiah(t.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
