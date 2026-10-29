import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { relativeDay, todayISO } from "@/lib/finance";
import TransactionList, {
  type TransactionRow,
} from "@/components/TransactionList";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: cats }, { data: txs }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("user_id", user.id),
    supabase
      .from("transactions")
      .select("id, type, amount, category_id, note, occurred_on")
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const { data: billPayments, error: billPaymentsError } = await supabase
    .from("bill_payments")
    .select("transaction_id")
    .eq("user_id", user.id);

  if (billPaymentsError) {
    throw new Error("Gagal membaca relasi pembayaran tagihan.");
  }

  const billPaymentIds = new Set(
    (billPayments ?? []).map((payment) => payment.transaction_id),
  );

  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const today = todayISO();

  const rows: TransactionRow[] = (txs ?? []).map((t) => {
    const category = catName.get(t.category_id) ?? "Tanpa kategori";
    return {
      id: t.id,
      title: t.note || category,
      category,
      isBillPayment: billPaymentIds.has(t.id),
      dateLabel: relativeDay(t.occurred_on, today),
      amount: Number(t.amount),
      type: t.type,
    };
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Semua transaksi</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Pakai tombol Ubah atau Hapus untuk merapikan catatanmu.
      </p>

      <TransactionList rows={rows} />
    </div>
  );
}
