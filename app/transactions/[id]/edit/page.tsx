import { notFound, redirect } from "next/navigation";
import TransactionForm from "@/components/TransactionForm";
import { createClient } from "@/utils/supabase/server";

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: tx }, { data: categories }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, type, amount, category_id, note, occurred_on")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, name, type, keywords")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("sort_order"),
  ]);

  if (!tx) notFound();

  const { data: linkedPayment, error: paymentError } = await supabase
    .from("bill_payments")
    .select("transaction_id")
    .eq("user_id", user.id)
    .eq("transaction_id", tx.id)
    .maybeSingle();

  if (paymentError) {
    throw new Error("Gagal memverifikasi status transaksi.");
  }

  if (linkedPayment) {
    redirect("/transactions");
  }

  return (
    <TransactionForm
      categories={categories ?? []}
      userId={user.id}
      initial={{
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        category_id: tx.category_id,
        note: tx.note,
        occurred_on: tx.occurred_on,
      }}
    />
  );
}
