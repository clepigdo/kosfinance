"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  Trash2,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import CategoryIcon from "@/components/CategoryIcon";
import { useToday } from "@/lib/useToday";

type Category = {
  id: string;
  name: string;
  type: "expense" | "income";
  keywords: string[];
};

export type TransactionInitial = {
  id: string;
  type: "expense" | "income";
  amount: number;
  category_id: string | null;
  note: string | null;
  occurred_on: string;
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700";
const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700";

export default function TransactionForm({
  categories,
  userId,
  initial,
  defaultType,
}: {
  categories: Category[];
  userId: string;
  initial?: TransactionInitial;
  defaultType?: "expense" | "income";
}) {
  const isEdit = !!initial;

  const [type, setType] = useState<"expense" | "income">(
    initial?.type ?? defaultType ?? "expense",
  );
  const [digits, setDigits] = useState(initial ? String(initial.amount) : "");
  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.category_id ?? null,
  );
  // Saat edit, kategori yang sudah ada dianggap pilihan user (tidak ditebak ulang)
  const [pickedByUser, setPickedByUser] = useState(isEdit);
  const [note, setNote] = useState(initial?.note ?? "");
  const today = useToday();
  const [pickedDate, setPickedDate] = useState<string | null>(
    initial?.occurred_on ?? null,
  );
  const date = pickedDate ?? today;
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const supabase = createClient();
  const visible = categories.filter((c) => c.type === type);

  const switchType = (t: "expense" | "income") => {
    if (t === type) return;
    setType(t);
    setCategoryId(null);
    setPickedByUser(false);
  };

  // Tebak kategori dari catatan, selama user belum memilih sendiri
  const onNote = (value: string) => {
    setNote(value);
    if (pickedByUser) return;
    const q = value.toLowerCase();
    const hit = visible.find((c) => c.keywords.some((k) => q.includes(k)));
    setCategoryId(hit ? hit.id : null);
  };

  const pick = (id: string) => {
    setPickedByUser(true);
    setCategoryId(categoryId === id ? null : id);
  };

  const finish = () => {
    router.push(isEdit ? "/transactions" : "/dashboard");
    router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const amount = Number(digits);
    if (!amount) return setError("Isi nominalnya dulu ya.");
    if (!date) return setError("Pilih tanggalnya dulu ya.");

    setLoading(true);
    const fields = {
      type,
      amount,
      category_id: categoryId,
      note: note.trim() || null,
      occurred_on: date,
    };

    const { error } = isEdit
      ? await supabase
          .from("transactions")
          .update(fields)
          .eq("id", initial!.id)
          .eq("user_id", userId)
      : await supabase
          .from("transactions")
          .insert({ ...fields, user_id: userId, source: "manual" });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    finish();
  };

  const handleDelete = async () => {
    if (!initial) return;
    setError("");
    setLoading(true);
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", initial.id)
      .eq("user_id", userId);

    if (error) {
      setError(error.message);
      setLoading(false);
      setConfirmDelete(false);
      return;
    }
    finish();
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* Bar atas: tombol kembali, judul di tengah */}
      <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center">
        <Link
          href={isEdit ? "/transactions" : "/dashboard"}
          aria-label="Kembali"
          className={`grid h-10 w-10 place-items-center rounded-full border border-green-100 bg-white text-green-800 hover:bg-green-50 ${focus}`}
        >
          <ChevronLeft size={22} />
        </Link>
        <h1 className="text-center text-lg font-bold tracking-tight">
          {isEdit ? "Ubah transaksi" : "Catat transaksi"}
        </h1>
        <span aria-hidden="true" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-5 space-y-6 rounded-3xl border border-green-100 bg-white p-5 md:p-7"
      >
        {/* Jenis */}
        <div
          className="grid grid-cols-2 gap-1 rounded-2xl bg-green-50 p-1"
          role="group"
          aria-label="Jenis transaksi"
        >
          {(
            [
              {
                value: "expense",
                label: "Pengeluaran",
                Icon: ArrowUpRight,
                on: "text-rose-700",
              },
              {
                value: "income",
                label: "Pemasukan",
                Icon: ArrowDownLeft,
                on: "text-green-700",
              },
            ] as const
          ).map(({ value, label, Icon, on }) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              onClick={() => switchType(value)}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${focus} ${
                type === value ? `bg-white shadow-sm ${on}` : "text-neutral-600"
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>

        {/* Nominal */}
        <div>
          <label htmlFor="amount" className="block text-sm font-medium">
            Nominal
          </label>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-neutral-500">
              Rp
            </span>
            <input
              id="amount"
              type="text"
              inputMode="numeric"
              autoFocus={!isEdit}
              value={digits ? Number(digits).toLocaleString("id-ID") : ""}
              onChange={(e) =>
                setDigits(e.target.value.replace(/\D/g, "").slice(0, 12))
              }
              placeholder="15.000"
              className="w-full rounded-xl border border-neutral-300 bg-white py-3 pl-14 pr-4 text-3xl font-bold tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
            />
          </div>
        </div>

        {/* Catatan */}
        <div>
          <label htmlFor="note" className="block text-sm font-medium">
            Catatan (opsional)
          </label>
          <input
            id="note"
            type="text"
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Nasi goreng"
            className={inputClass}
          />
        </div>

        {/* Kategori */}
        <div>
          <p className="text-sm font-medium">Kategori</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {visible.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categoryId === c.id}
                onClick={() => pick(c.id)}
                className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-sm font-medium ${focus} ${
                  categoryId === c.id
                    ? "border-green-700 bg-green-700 text-white"
                    : "border-neutral-200 bg-white text-neutral-800 hover:border-green-300"
                }`}
              >
                <CategoryIcon name={c.name} size="sm" />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Tanggal */}
        <div>
          <label htmlFor="date" className="block text-sm font-medium">
            Tanggal
          </label>
          <input
            id="date"
            type="date"
            max={today || undefined}
            value={date}
            onChange={(e) => setPickedDate(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 py-3.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50 ${focus}`}
        >
          <Check size={18} />
          {loading ? "Menyimpan..." : isEdit ? "Simpan perubahan" : "Simpan"}
        </button>
      </form>

      {/* Hapus (hanya saat edit) */}
      {isEdit && (
        <div className="mt-6">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={loading}
              className={`flex items-center gap-2 rounded-lg text-sm font-semibold text-rose-700 hover:underline disabled:opacity-50 ${focus}`}
            >
              <Trash2 size={16} />
              Hapus transaksi ini
            </button>
          ) : (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm text-rose-900">
                Transaksi ini akan dihapus permanen dan saldomu ikut dihitung
                ulang. Lanjut?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
                >
                  {loading ? "Menghapus..." : "Ya, hapus"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={loading}
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
