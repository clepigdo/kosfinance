import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { addDays, dueDates, shortDate, todayISO } from "@/lib/finance";

export default async function BillsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const today = todayISO();
  const end = addDays(today, 45);

  const [billsResult, paymentsResult] = await Promise.all([
    supabase
      .from("fixed_bills")
      .select(
        "id, name, amount, frequency, due_day, due_weekday, schedule_type, start_date, total_occurrences",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at"),

    supabase
      .from("bill_payments")
      .select("bill_id, due_date")
      .eq("user_id", user.id)
      .gte("due_date", today)
      .lt("due_date", end),
  ]);

  if (billsResult.error || paymentsResult.error) {
    return <p role="alert">Gagal memuat tagihan. Silakan coba lagi.</p>;
  }

  console.log("[BILLS DEBUG]", {
    userId: user.id,
    bills: billsResult.data,
    payments: paymentsResult.data,
  });

  const paid = new Set(
    (paymentsResult.data ?? []).map((p) => `${p.bill_id}|${p.due_date}`),
  );

  const occurrences = (billsResult.data ?? [])
    .flatMap((bill) =>
      dueDates(
        {
          id: bill.id,
          amount: Number(bill.amount),
          frequency: bill.frequency,
          due_day: bill.due_day,
          due_weekday: bill.due_weekday,
          schedule_type: bill.schedule_type,
          start_date: bill.start_date,
          total_occurrences: bill.total_occurrences,
        },
        today,
        end,
      ).map((date) => ({
        id: `${bill.id}|${date}`,
        name: bill.name,
        amount: Number(bill.amount),
        date,
        isPaid: paid.has(`${bill.id}|${date}`),
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  console.log("=== DEBUG KOSFINANCE ===");

  console.log("Jumlah tagihan dari Supabase:", billsResult.data?.length);

  console.log("Data tagihan:", billsResult.data);

  console.log("Jumlah jadwal yang dihasilkan:", occurrences.length);

  console.log("Data jadwal:", occurrences);

  const unpaidTotal = occurrences
    .filter((item) => !item.isPaid)
    .reduce((sum, item) => sum + item.amount, 0);

  const rupiah = (amount: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tagihan rutin</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Jadwal pembayaran untuk 45 hari ke depan.
        </p>
      </div>

      <section className="rounded-2xl border border-green-100 bg-white p-5">
        <p className="text-sm text-neutral-600">Total tagihan belum dibayar</p>
        <p className="mt-2 text-2xl font-bold">{rupiah(unpaidTotal)}</p>
        <p className="mt-1 text-xs text-neutral-500">
          Total kewajiban dalam 45 hari ke depan, bukan hanya siklus kiriman
          saat ini.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Jadwal tagihan</h2>

        {occurrences.length === 0 ? (
          <div className="rounded-2xl border border-green-100 bg-white p-6 text-sm text-neutral-600">
            Belum ada tagihan terjadwal dalam 45 hari ke depan.
          </div>
        ) : (
          occurrences.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-green-100 bg-white p-4"
            >
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-neutral-500">
                  {shortDate(item.date)}
                </p>
              </div>

              <div className="text-right">
                <p className="font-semibold">{rupiah(item.amount)}</p>
                <p
                  className={`text-xs ${
                    item.isPaid ? "text-green-700" : "text-amber-700"
                  }`}
                >
                  {item.isPaid ? "Lunas" : "Belum dibayar"}
                </p>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
