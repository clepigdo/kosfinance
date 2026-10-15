"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, ReceiptText, Trash2 } from "lucide-react";
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

type Pending = { row: TransactionRow; action: "edit" | "delete" } | null;

export default function TransactionList({ rows }: { rows: TransactionRow[] }) {
  const [pending, setPending] = useState<Pending>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const supabase = createClient();

  const close = () => {
    if (loading) return;
    setPending(null);
    setError("");
  };

  // Tutup dialog dengan tombol Escape
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        setPending(null);
        setError("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, loading]);

  const confirm = async () => {
    if (!pending) return;

    if (pending.action === "edit") {
      router.push(`/transactions/${pending.row.id}/edit`);
      return;
    }

    setLoading(true);
    setError("");
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", pending.row.id);
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setRemoved((prev) => new Set(prev).add(pending.row.id));
    setPending(null);
    router.refresh();
  };

  const visible = rows.filter((r) => !removed.has(r.id));

  if (visible.length === 0) {
    return (
      <div className="mt-5 flex flex-col items-center rounded-2xl border border-green-100 bg-white px-4 py-12 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-green-50 text-green-700">
          <ReceiptText size={26} />
        </span>
        <p className="mt-4 text-sm font-medium">Belum ada transaksi</p>
        <p className="mt-1 text-sm text-neutral-600">
          Catat pengeluaran atau pemasukan pertamamu.
        </p>
        <Link
          href="/transactions/new"
          className="mt-4 rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
        >
          Catat transaksi
        </Link>
      </div>
    );
  }

  const isDelete = pending?.action === "delete";

  return (
    <>
      <ul className="mt-5 space-y-3">
        {visible.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 rounded-2xl border border-green-100 bg-white p-3.5"
          >
            <CategoryIcon name={t.category} />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{t.title}</p>
              <p className="text-xs text-neutral-600">
                {t.category}, {t.dateLabel}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p
                className={`text-sm font-semibold tabular-nums ${
                  t.type === "income" ? "text-green-700" : "text-neutral-900"
                }`}
              >
                {t.type === "income" ? "+" : "-"}
                {rupiah(t.amount)}
              </p>
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setPending({ row: t, action: "edit" })}
                  aria-label={`Ubah transaksi ${t.title}`}
                  className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-700"
                >
                  <Pencil size={13} />
                  Ubah
                </button>
                <button
                  type="button"
                  onClick={() => setPending({ row: t, action: "delete" })}
                  aria-label={`Hapus transaksi ${t.title}`}
                  className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600"
                >
                  <Trash2 size={13} />
                  Hapus
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Dialog konfirmasi */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className={`grid h-11 w-11 place-items-center rounded-full ${
                isDelete
                  ? "bg-rose-100 text-rose-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {isDelete ? <Trash2 size={20} /> : <Pencil size={20} />}
            </span>

            <h2 id="confirm-title" className="mt-3 text-base font-bold">
              {isDelete ? "Hapus transaksi ini?" : "Ubah transaksi ini?"}
            </h2>
            <p className="mt-2 text-sm text-neutral-800">
              <span className="font-medium">{pending.row.title}</span>,{" "}
              {pending.row.type === "income" ? "+" : "-"}
              {rupiah(pending.row.amount)}
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              {isDelete
                ? "Transaksi akan dihapus permanen dan saldomu dihitung ulang."
                : "Kamu akan diarahkan ke halaman ubah transaksi."}
            </p>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
              >
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                autoFocus
                className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-800 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={loading}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
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
