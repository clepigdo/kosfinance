import { redirect } from "next/navigation";
import TransactionForm from "@/components/TransactionForm";
import { createClient } from "@/utils/supabase/server";

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, type, keywords")
    .eq("user_id", user.id)
    .eq("is_archived", false)
    .order("sort_order");

  return (
    <TransactionForm
      categories={categories ?? []}
      userId={user.id}
      defaultType={type === "income" ? "income" : "expense"}
    />
  );
}
