"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, X, AlertCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type Props = {
  billId: string;
  dueDate: string;
  billName: string;
  amount: number;
};

export default function PayBillButton({
  billId,
  dueDate,
  billName,
  amount,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  const rupiah = (value: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);

  const formattedDate = new Date(`${dueDate}T00:00:00Z`).toLocaleDateString(
    "id-ID",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );

  const close = () => {
    if (submitting.current) return;
    setOpen(false);
    setError("");
  };

  useEffect(() => {
    if (!open) return;

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting.current) {
        setOpen(false);
        setError("");
      }
    };

    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open]);

  const handleConfirm = async () => {
    if (submitting.current) return;

    submitting.current = true;
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const { data, error: rpcError } = await supabase.rpc(
        "pay_bill_occurrence",
        {
          p_bill_id: billId,
          p_due_date: dueDate,
        },
      );

      if (rpcError) throw rpcError;

      if (data !== "paid" && data !== "already_paid") {
        throw new Error("Respons pembayaran tidak dikenal.");
      }

      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mencatat pembayaran.",
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800"
      >
        <CheckCircle2 size={16} />
        Tandai lunas
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-bill-title"
            aria-describedby="pay-bill-description"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-green-100 text-green-700">
                <CheckCircle2 size={24} />
              </span>

              <button
                type="button"
                onClick={close}
                disabled={loading}
                aria-label="Tutup"
                className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <h2 id="pay-bill-title" className="mt-5 text-xl font-bold">
              Konfirmasi pelunasan
            </h2>

            <p
              id="pay-bill-description"
              className="mt-2 text-sm text-neutral-600"
            >
              Pastikan tagihan berikut benar-benar sudah kamu bayar.
            </p>

            <div className="mt-5 space-y-3 rounded-2xl bg-neutral-50 p-4">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-neutral-500">Tagihan</span>
                <span className="text-right font-semibold">{billName}</span>
              </div>

              <div className="flex justify-between gap-3 text-sm">
                <span className="text-neutral-500">Jatuh tempo</span>
                <span className="font-medium">{formattedDate}</span>
              </div>

              <div className="border-t border-neutral-200 pt-3">
                <p className="text-xs text-neutral-500">Total pembayaran</p>
                <p className="mt-1 text-2xl font-bold text-neutral-900">
                  {rupiah(amount)}
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-neutral-500">
              Setelah dikonfirmasi, pembayaran akan tercatat sebagai pengeluaran
              dan mengurangi saldo kamu.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
              >
                <AlertCircle size={17} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
              >
                {loading ? "Menyimpan..." : "Ya, sudah dibayar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
