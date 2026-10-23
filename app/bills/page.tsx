import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  addDays,
  dueDates,
  shortDate,
  todayISO,
  type Bill,
} from "@/lib/finance";
import PayBillButton from "@/components/PayBillButton";

type ScheduleType = "once" | "limited" | "ongoing";

type BillRow = Bill & {
  name: string;
  schedule_type: ScheduleType;
  start_date: string | null;
  total_occurrences: number | null;
  other_description: string | null;
};

type Occurrence = {
  id: string;
  billId: string;
  name: string;
  amount: number;
  date: string;
  isPaid: boolean;
  scheduleType: ScheduleType;
  otherDescription: string | null;
  installment?: number;
  installmentTotal?: number;
};

function addMonths(iso: string, count: number): string {
  const [year, month] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return date.toISOString().slice(0, 10);
}

function getDates(bill: BillRow, monthStart: string): string[] {
  if (bill.schedule_type === "once") {
    return bill.start_date ? [bill.start_date] : [];
  }

  if (bill.schedule_type === "limited") {
    if (!bill.start_date || !bill.total_occurrences) {
      return [];
    }

    const end = addDays(
      bill.start_date,
      bill.total_occurrences * (bill.frequency === "monthly" ? 32 : 7) + 8,
    );

    return dueDates(bill, bill.start_date, end);
  }

  return dueDates(bill, monthStart, addMonths(monthStart, 12));
}

function rupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function scheduleLabel(type: ScheduleType) {
  if (type === "once") return "Sekali bayar";
  if (type === "limited") return "Cicilan";
  return "Rutin";
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
        "id, name, amount, frequency, due_day, due_weekday, schedule_type, start_date, total_occurrences, other_description",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at"),

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
      const dates = getDates(bill, monthStart);

      return dates.map((date, index) => ({
        id: `${bill.id}|${date}`,
        billId: bill.id,
        name: bill.name,
        amount: Number(bill.amount),
        otherDescription: bill.other_description,
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

  const dueThisMonth = occurrences.filter(
    (item) => !item.isPaid && item.date >= monthStart && item.date < nextMonth,
  );

  const overdueItems = occurrences.filter(
    (item) => !item.isPaid && item.date < today,
  );

  const totalThisMonth = dueThisMonth.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  const totalOverdue = overdueItems.reduce((sum, item) => sum + item.amount, 0);

  const totalRemaining = occurrences
    .filter((item) => !item.isPaid)
    .reduce((sum, item) => sum + item.amount, 0);

  const groups = new Map<string, Occurrence[]>();

  for (const item of occurrences) {
    const key = item.date.slice(0, 7);
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }

  const monthLabel = new Date(`${monthStart}T00:00:00Z`).toLocaleDateString(
    "id-ID",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Tagihan & Cicilan</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Lihat kewajiban bulan ini, tandai yang sudah lunas, dan pantau semua
          jadwal cicilan ke depan.
        </p>
      </div>

      {/* Ringkasan */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-green-100 bg-white p-5">
          <p className="text-sm text-neutral-500">
            Perlu dibayar bulan {monthLabel}
          </p>
          <p className="mt-2 text-3xl font-bold">{rupiah(totalThisMonth)}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {dueThisMonth.length} pembayaran belum lunas bulan ini
          </p>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-white p-5">
          <p className="text-sm text-neutral-500">Tunggakan</p>
          <p className="mt-2 text-3xl font-bold text-rose-700">
            {rupiah(totalOverdue)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {overdueItems.length} pembayaran lewat jatuh tempo
          </p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-white p-5">
          <p className="text-sm text-neutral-500">Total sisa tagihan</p>
          <p className="mt-2 text-3xl font-bold">{rupiah(totalRemaining)}</p>
          <p className="mt-1 text-xs text-neutral-500">
            Semua kewajiban yang belum dibayar
          </p>
        </div>
      </section>

      {/* Prioritas sekarang */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Perlu dibayar sekarang</h2>
          <p className="text-sm text-neutral-600">
            Fokuskan dulu pada tagihan bulan ini dan yang sudah lewat jatuh
            tempo.
          </p>
        </div>

        {dueThisMonth.length === 0 ? (
          <div className="rounded-2xl border border-green-100 bg-white p-6 text-sm text-neutral-600">
            Tidak ada tagihan yang perlu dibayar pada bulan ini.
          </div>
        ) : (
          <div className="grid gap-4">
            {dueThisMonth.map((item) => {
              const isOverdue = item.date < today;

              return (
                <div
                  key={`due-now-${item.id}`}
                  className="rounded-2xl border border-green-100 bg-white p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">{item.name}</h3>

                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                          {scheduleLabel(item.scheduleType)}
                        </span>

                        {item.installment && (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                            Cicilan {item.installment}/{item.installmentTotal}
                          </span>
                        )}
                      </div>

                      {item.otherDescription && (
                        <p className="text-sm text-neutral-500">
                          {item.otherDescription}
                        </p>
                      )}

                      <p className="text-sm text-neutral-500">
                        Jatuh tempo: {shortDate(item.date)}
                      </p>
                    </div>

                    <div className="text-left md:text-right">
                      <p className="text-2xl font-bold">
                        {rupiah(item.amount)}
                      </p>
                      {!item.isPaid && (
                        <PayBillButton
                          billId={item.billId}
                          dueDate={item.date}
                          billName={item.name}
                          amount={item.amount}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Semua jadwal */}
      <section className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Semua jadwal tagihan</h2>
          <p className="text-sm text-neutral-600">
            Semua cicilan dan tagihan ditampilkan per bulan agar lebih mudah
            dipantau.
          </p>
        </div>

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

            const groupTotal = items
              .filter((item) => !item.isPaid)
              .reduce((sum, item) => sum + item.amount, 0);

            return (
              <div
                key={month}
                className="rounded-2xl border border-green-100 bg-white p-5"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold capitalize">{title}</h3>
                    <p className="text-xs text-neutral-500">
                      {items.length} jadwal pembayaran
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-neutral-500">Belum dibayar</p>
                    <p className="font-semibold">{rupiah(groupTotal)}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {items.map((item) => {
                    const isOverdue = !item.isPaid && item.date < today;

                    return (
                      <div
                        key={item.id}
                        className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{item.name}</p>

                            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs">
                              {scheduleLabel(item.scheduleType)}
                            </span>

                            {item.installment && (
                              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                                Cicilan {item.installment}/
                                {item.installmentTotal}
                              </span>
                            )}
                          </div>

                          {item.otherDescription && (
                            <p className="text-sm text-neutral-500">
                              {item.otherDescription}
                            </p>
                          )}

                          <p className="text-sm text-neutral-500">
                            Jatuh tempo: {shortDate(item.date)}
                          </p>

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

                        <div className="text-left md:text-right">
                          <p className="text-lg font-semibold">
                            {rupiah(item.amount)}
                          </p>
                          {!item.isPaid && (
                            <PayBillButton
                              billId={item.billId}
                              dueDate={item.date}
                              billName={item.name}
                              amount={item.amount}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
