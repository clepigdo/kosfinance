"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToday } from "@/lib/useToday";

const supabase = createClient();

type Props = {
  billId: string;
  billName: string;
};

export default function DeactivateBillButton({ billId, billName }: Props) {
  const router = useRouter();
  const today = useToday();
  const submitting = useRef(false);

  const [opened, setOpened] = useState(false);
  const [stopDate, setStopDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDeactivate() {
    if (submitting.current) return;

    if (!today || !stopDate || stopDate < today) {
      setError("Pilih tanggal penghentian yang valid.");
      return;
    }

    submitting.current = true;
    setLoading(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "deactivate_fixed_bill",
        {
          p_bill_id: billId,
          p_stop_from_date: stopDate,
        },
      );

      if (rpcError) throw rpcError;

      if (data !== "deactivated" && data !== "already_stopped") {
        throw new Error("Respons penghentian tidak dikenal.");
      }

      setOpened(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal menonaktifkan tagihan.",
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {!opened ? (
        <button
          type="button"
          onClick={() => setOpened(true)}
          className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
        >
          Nonaktifkan
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold">Hentikan tagihan {billName}?</p>

          <p className="text-xs text-neutral-600">
            Jadwal sebelum tanggal penghentian tetap menjadi kewajiban.
            Pembayaran lama tidak dihapus.
          </p>

          <label className="block text-sm font-medium">
            Berhenti mulai tanggal
            <input
              type="date"
              min={today || undefined}
              value={stopDate}
              onChange={(e) => setStopDate(e.target.value)}
              disabled={loading}
              className="mt-2 w-full rounded-lg border border-neutral-300 bg-white p-2"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setOpened(false);
                setError("");
              }}
              disabled={loading}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm"
            >
              Batal
            </button>

            <button
              type="button"
              disabled={loading || !today || !stopDate}
              onClick={handleDeactivate}
              className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Memproses..." : "Ya, nonaktifkan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
