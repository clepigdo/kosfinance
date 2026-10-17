"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { todayISO, shortDate } from "@/lib/finance";

type Props = {
  planId: string;
  currentDate: string;
  cycleStart: string;
};

export default function EditNextIncome({
  planId,
  currentDate,
  cycleStart,
}: Props) {
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
      <section className="rounded-2xl border border-green-100 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <CalendarClock size={21} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-neutral-500">
              Estimasi kiriman berikutnya
            </p>

            <p className="mt-1 text-lg font-bold text-neutral-900">
              {shortDate(currentDate)}
            </p>

            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
              Tanggal ini bisa diubah jika jadwal kirimanmu bergeser.
            </p>
          </div>

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
        </div>
      </section>

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
