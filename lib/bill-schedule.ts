import { dueDates, type Bill } from "./finance";

export type ScheduledBill = Bill & {
  name: string;
  other_description?: string | null;
};

export type BillOccurrence = {
  id: string;
  billId: string;
  name: string;
  amount: number;
  date: string;
  isPaid: boolean;
  scheduleType: "once" | "limited" | "ongoing";
  otherDescription: string | null;
  installment?: number;
  installmentTotal?: number;
};

export function generateBillOccurrences(
  bills: ScheduledBill[],
  paid: Set<string>,
  start: string,
  end: string,
): BillOccurrence[] {
  const occurrences: BillOccurrence[] = [];

  for (const bill of bills) {
    const scheduleType = bill.schedule_type ?? "ongoing";

    // Pertahankan nomor cicilan berdasarkan tanggal awal.
    // Untuk tagihan ongoing lama tanpa start_date,
    // gunakan awal rentang yang diberikan.
    const rangeStart = bill.start_date ?? start;

    const dates = dueDates(bill, rangeStart, end);

    dates.forEach((date, index) => {
      // Tidak menampilkan jadwal di luar rentang permintaan,
      // kecuali tunggakan yang memang dimulai dari start_date.
      if (date >= end) return;

      occurrences.push({
        id: `${bill.id}|${date}`,
        billId: bill.id,
        name: bill.name,
        amount: Number(bill.amount),
        date,
        isPaid: paid.has(`${bill.id}|${date}`),
        scheduleType,
        otherDescription: bill.other_description ?? null,
        installment: scheduleType === "limited" ? index + 1 : undefined,
        installmentTotal:
          scheduleType === "limited"
            ? (bill.total_occurrences ?? undefined)
            : undefined,
      });
    });
  }

  return occurrences.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

export function splitBillOccurrences(
  occurrences: BillOccurrence[],
  today: string,
  nextMonth: string,
) {
  const priorityItems = occurrences.filter(
    (item) => !item.isPaid && item.date < nextMonth,
  );

  const scheduledItems = occurrences.filter(
    (item) => item.isPaid || item.date >= nextMonth,
  );

  const overdueItems = occurrences.filter(
    (item) => !item.isPaid && item.date < today,
  );

  return {
    priorityItems,
    scheduledItems,
    overdueItems,
  };
}
