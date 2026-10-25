
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AddBillForm from "@/components/AddBillForm";


export default async function NewBillPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl py-6">
      <AddBillForm />
    </main>
  );
}
