import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  addDays,
  dueDates,
  shortDate,
  todayISO,
  type Bill,
} from "@/lib/finance";

type ScheduleType = "once" | "limited" | "ongoing";

type BillRow = Bill & {
  name: string;
  schedule_type: ScheduleType;
  start_date: string | null;
  total_occurrences: number | null;
};

type Occurrence = {
  id: string;
  name: string;
  amount: number;
  date: string;
  isPaid: boolean;
  scheduleType: ScheduleType;
  installment?: number;
  installmentTotal?: number;
};

function addMonths(iso: string, count: number): string {
  const [year, month] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return date.toISOString().slice(0, 10);
}

function getDates(bill: BillRow, today: string, monthStart: string): string[] {
  if (bill.schedule_type === "once") {
    return bill.start_date ? [bill.start_date] : [];
  }

  if (bill.schedule_type === "limited") {
    if (!bill.start_date || !bill.total_occurrences) {
      return [];
    }

    // Rentang cukup untuk seluruh cicilan, maksimal 120.
    const end = addDays(
      bill.start_date,
      bill.total_occurrences * (bill.frequency === "monthly" ? 32 : 7) + 8,
    );

    return dueDates(bill, bill.start_date, end);
  }

  // Tagihan tanpa batas: tampilkan 12 bulan,
  // dimulai dari bulan kalender saat ini.
  return dueDates(bill, monthStart, addMonths(monthStart, 12));
}

export default async function BillsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = addMonths(monthStart, 1);

  const [billsResult, paymentsResult] = await Promise.all([
    supabase
      .from("fixed_bills")
      .select(
        "id, name, amount, frequency, due_day, due_weekday, schedule_type, start_date, total_occurrences",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at"),

    // Ambil riwayat pembayaran agar status cicilan
    // masa lalu dan masa depan terbaca.
    supabase
      .from("bill_payments")
      .select("bill_id, due_date")
      .eq("user_id", user.id),
  ]);

  if (billsResult.error || paymentsResult.error) {
    return (
      <p role="alert" className="text-rose-700">
        Gagal memuat tagihan. Silakan coba lagi.
      </p>
    );
  }

  const paid = new Set(
    (paymentsResult.data ?? []).map((p) => `${p.bill_id}|${p.due_date}`),
  );

  const occurrences: Occurrence[] = ((billsResult.data ?? []) as BillRow[])
    .flatMap((bill) => {
      const dates = getDates(bill, today, monthStart);

      return dates.map((date, index) => ({
        id: `${bill.id}|${date}`,
        name: bill.name,
        amount: Number(bill.amount),
        date,
        isPaid: paid.has(`${bill.id}|${date}`),
        scheduleType: bill.schedule_type,
        installment: bill.schedule_type === "limited" ? index + 1 : undefined,
        installmentTotal:
          bill.schedule_type === "limited"
            ? (bill.total_occurrences ?? undefined)
            : undefined,
      }));
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Hanya jumlahkan kewajiban bulan berjalan.
  const monthlyUnpaid = occurrences
    .filter(
      (item) =>
        !item.isPaid && item.date >= monthStart && item.date < nextMonth,
    )
    .reduce((sum, item) => sum + item.amount, 0);

  const monthlyCount = occurrences.filter(
    (item) => !item.isPaid && item.date >= monthStart && item.date < nextMonth,
  ).length;

  const rupiah = (amount: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);

  const monthLabel = new Date(`${monthStart}T00:00:00Z`).toLocaleDateString(
    "id-ID",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );

  const groups = new Map<string, Occurrence[]>();

  for (const item of occurrences) {
    const key = item.date.slice(0, 7);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tagihan & Cicilan</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Pantau kewajiban bulan ini dan jadwal pembayaran berikutnya.
        </p>
      </div>

      <section className="rounded-2xl border border-green-100 bg-white p-5">
        <p className="text-sm text-neutral-600">
          Belum dibayar bulan {monthLabel}
        </p>

        <p className="mt-2 text-3xl font-bold">{rupiah(monthlyUnpaid)}</p>

        <p className="mt-1 text-xs text-neutral-500">
          {monthlyCount} pembayaran belum lunas pada bulan ini.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Semua jadwal tagihan</h2>

        {occurrences.length === 0 ? (
          <div className="rounded-2xl border border-green-100 bg-white p-6 text-sm text-neutral-600">
            Belum ada tagihan terjadwal.
          </div>
        ) : (
          Array.from(groups.entries()).map(([month, items]) => {
            const title = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(
              "id-ID",
              {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              },
            );

            const groupUnpaid = items
              .filter((item) => !item.isPaid)
              .reduce((sum, item) => sum + item.amount, 0);

            return (
              <div key={month} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold capitalize">{title}</h3>
                  <span className="text-sm font-medium text-neutral-600">
                    {rupiah(groupUnpaid)}
                  </span>
                </div>

                {items.map((item) => {
                  const isOverdue = !item.isPaid && item.date < today;

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-green-100 bg-white p-4"
                    >
                      <div>
                        <p className="font-semibold">{item.name}</p>

                        <p className="text-sm text-neutral-500">
                          {shortDate(item.date)}
                        </p>

                        {item.installment && (
                          <p className="mt-1 text-xs text-neutral-500">
                            Cicilan {item.installment}/{item.installmentTotal}
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="font-semibold">{rupiah(item.amount)}</p>

                        <p
                          className={`text-xs ${
                            item.isPaid
                              ? "text-green-700"
                              : isOverdue
                                ? "text-rose-700"
                                : "text-amber-700"
                          }`}
                        >
                          {item.isPaid
                            ? "Lunas"
                            : isOverdue
                              ? "Lewat jatuh tempo"
                              : "Belum dibayar"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
