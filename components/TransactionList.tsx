"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { rupiah } from "@/lib/format";
import CategoryIcon from "@/components/CategoryIcon";

export type TransactionRow = {
  id: string;
  title: string;
  category: string;
  dateLabel: string;
  amount: number;
  type: "income" | "expense";
};

type Pending = {
  row: TransactionRow;
  action: "edit" | "delete";
} | null;

export default function TransactionList({ rows }: { rows: TransactionRow[] }) {
  const router = useRouter();

  const [pending, setPending] = useState<Pending>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const visible = rows.filter((row) => !removed.has(row.id));

  const close = () => {
    if (loading) return;
    setPending(null);
    setError("");
  };

  useEffect(() => {
    if (!pending) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) {
        setPending(null);
        setError("");
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pending, loading]);

  const confirm = async () => {
    if (!pending || loading) return;

    if (pending.action === "edit") {
      router.push(`/transactions/${pending.row.id}/edit`);
      setPending(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Sesi login berakhir. Silakan login kembali.");
      }

      const { error: deleteError } = await supabase
        .from("transactions")
        .delete()
        .eq("id", pending.row.id)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      setRemoved((prev) => {
        const next = new Set(prev);
        next.add(pending.row.id);
        return next;
      });

      setPending(null);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal menghapus transaksi. Coba lagi.",
      );
    } finally {
      setLoading(false);
    }
  };

  const isDelete = pending?.action === "delete";

  return (
    <>
      <section className="mt-5 space-y-4">
        {/* Header daftar */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900">
              Riwayat transaksi
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              {visible.length} transaksi tercatat
            </p>
          </div>

          <Link
            href="/transactions/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
          >
            <Plus size={16} />
            Tambah
          </Link>
        </div>

        {/* Empty state */}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-green-100 bg-white px-5 py-14 text-center shadow-sm">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-green-50 text-green-700">
              <ReceiptText size={28} />
            </div>

            <h3 className="mt-5 text-base font-bold text-neutral-900">
              Belum ada transaksi
            </h3>

            <p className="mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">
              Mulai catat pemasukan dan pengeluaran agar kondisi keuanganmu
              lebih mudah dipantau.
            </p>

            <Link
              href="/transactions/new"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-800"
            >
              <Plus size={17} />
              Catat transaksi pertama
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {visible.map((t) => {
              const isIncome = t.type === "income";

              return (
                <li
                  key={t.id}
                  className="group overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm transition-all duration-200 hover:border-green-200 hover:shadow-md"
                >
                  {/* Informasi transaksi */}
                  <div className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
                    <div className="shrink-0">
                      <CategoryIcon name={t.category} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-900 sm:text-base">
                        {t.title}
                      </p>

                      <p className="mt-1 truncate text-xs font-medium text-neutral-500">
                        {t.category}
                      </p>

                      <div className="mt-2 flex items-center gap-1 text-xs text-neutral-400">
                        <CalendarDays size={12} />
                        <span>{t.dateLabel}</span>
                      </div>
                    </div>

                    {/* Nominal */}
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-sm font-bold tabular-nums sm:text-base ${
                          isIncome ? "text-green-700" : "text-rose-700"
                        }`}
                      >
                        {isIncome ? "+" : "-"}
                        {rupiah(t.amount)}
                      </p>

                      <div
                        className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                          isIncome
                            ? "bg-green-50 text-green-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {isIncome ? (
                          <ArrowDownLeft size={12} />
                        ) : (
                          <ArrowUpRight size={12} />
                        )}

                        {isIncome ? "Pemasukan" : "Pengeluaran"}
                      </div>
                    </div>
                  </div>

                  {/* Aksi transaksi */}
                  <div className="flex items-center justify-end gap-2 border-t border-neutral-100 bg-neutral-50/60 px-4 py-2.5 sm:px-5">
                    <button
                      type="button"
                      onClick={() =>
                        setPending({
                          row: t,
                          action: "edit",
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-neutral-600 transition hover:bg-green-50 hover:text-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-700"
                      aria-label={`Ubah transaksi ${t.title}`}
                    >
                      <Pencil size={14} />
                      Ubah
                    </button>

                    <span className="h-4 w-px bg-neutral-200" />

                    <button
                      type="button"
                      onClick={() =>
                        setPending({
                          row: t,
                          action: "delete",
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600"
                      aria-label={`Hapus transaksi ${t.title}`}
                    >
                      <Trash2 size={14} />
                      Hapus
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Dialog konfirmasi */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/50 p-3 backdrop-blur-[3px] sm:items-center sm:p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div
                className={`grid h-12 w-12 place-items-center rounded-2xl ${
                  isDelete
                    ? "bg-rose-50 text-rose-700"
                    : "bg-green-50 text-green-700"
                }`}
              >
                {isDelete ? <Trash2 size={22} /> : <Pencil size={22} />}
              </div>

              <button
                type="button"
                onClick={close}
                disabled={loading}
                aria-label="Tutup dialog"
                className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <h2
              id="confirm-title"
              className="mt-5 text-lg font-bold text-neutral-900"
            >
              {isDelete ? "Hapus transaksi ini?" : "Ubah transaksi ini?"}
            </h2>

            <p
              id="confirm-description"
              className="mt-2 text-sm leading-relaxed text-neutral-500"
            >
              {isDelete
                ? "Transaksi yang dihapus tidak dapat dikembalikan. Saldo dan perhitungan keuanganmu akan diperbarui."
                : "Kamu akan diarahkan ke halaman untuk mengubah detail transaksi ini."}
            </p>

            {/* Ringkasan transaksi */}
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
              <CategoryIcon name={pending.row.category} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {pending.row.title}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {pending.row.category} · {pending.row.dateLabel}
                </p>
              </div>

              <p
                className={`shrink-0 text-sm font-bold tabular-nums ${
                  pending.row.type === "income"
                    ? "text-green-700"
                    : "text-rose-700"
                }`}
              >
                {pending.row.type === "income" ? "+" : "-"}
                {rupiah(pending.row.amount)}
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              >
                {error}
              </p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                autoFocus
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={confirm}
                disabled={loading}
                className={`rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDelete
                    ? "bg-rose-700 hover:bg-rose-800"
                    : "bg-green-700 hover:bg-green-800"
                }`}
              >
                {loading ? "Menghapus..." : isDelete ? "Ya, hapus" : "Ya, ubah"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
