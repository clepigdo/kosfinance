// Semua hitungan keuangan ada di sini, murni kode biasa (tanpa AI),
// supaya hasilnya bisa dipercaya dan gampang dites.

const DAY = 86400000;
const TZ = "Asia/Jakarta"; // MVP: semua user dianggap WIB

// ---------- Tanggal (format YYYY-MM-DD) ----------

export const todayISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

const toUTC = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const addDays = (iso: string, n: number) =>
  new Date(toUTC(iso) + n * DAY).toISOString().slice(0, 10);

export const daysBetween = (a: string, b: string) =>
  Math.round((toUTC(b) - toUTC(a)) / DAY);

export const shortDate = (iso: string) =>
  new Date(toUTC(iso)).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export function relativeDay(iso: string, today: string) {
  const diff = daysBetween(iso, today);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Kemarin";
  return shortDate(iso);
}

// ---------- Tagihan tetap ----------

export type Bill = {
  id: string;
  amount: number;
  frequency: "weekly" | "monthly";
  due_day: number | null;
  due_weekday: number | null;
  schedule_type?: "once" | "limited" | "ongoing";
  start_date?: string | null;
  stop_from_date?: string | null;
  total_occurrences?: number | null;
};

function monthlyOccurrence(first: string, index: number): string {
  const [year, month, day] = first.split("-").map(Number);

  const target = new Date(Date.UTC(year, month - 1 + index, 1));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const actualDay = Math.min(day, lastDay);

  return [
    String(y).padStart(4, "0"),
    String(m).padStart(2, "0"),
    String(actualDay).padStart(2, "0"),
  ].join("-");
}

// Rentang tanggal menggunakan [start, end).

export function dueDates(bill: Bill, start: string, end: string): string[] {
  // Jadwal tidak boleh mencapai tanggal penghentian.
  const effectiveEnd =
    bill.stop_from_date && bill.stop_from_date < end
      ? bill.stop_from_date
      : end;

  if (start >= effectiveEnd) return [];

  const type = bill.schedule_type ?? "ongoing";
  const first = bill.start_date;

  // 1. Tagihan sekali bayar
  if (type === "once") {
    if (!first) return [];
    return first >= start && first < effectiveEnd ? [first] : [];
  }

  // 2. Tagihan dengan jumlah pembayaran terbatas
  if (type === "limited") {
    const count = bill.total_occurrences;

    if (!first || !Number.isInteger(count) || !count || count <= 0) {
      return [];
    }

    const result: string[] = [];

    for (let i = 0; i < count; i++) {
      const date =
        bill.frequency === "weekly"
          ? addDays(first, i * 7)
          : monthlyOccurrence(first, i);

      if (date >= effectiveEnd) break;
      if (date >= start) result.push(date);
    }

    return result;
  }

  // 3. Tagihan rutin tanpa batas waktu
  const result: string[] = [];
  const begin = first && first > start ? first : start;

  // Data lama tanpa start_date tetap didukung.
  for (let date = begin; date < effectiveEnd; date = addDays(date, 1)) {
    if (bill.frequency === "weekly") {
      if (
        bill.due_weekday !== null &&
        new Date(toUTC(date)).getUTCDay() === bill.due_weekday
      ) {
        result.push(date);
      }
    } else if (bill.frequency === "monthly") {
      const [year, month, day] = date.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

      const anchorDay = first ? Number(first.slice(8, 10)) : bill.due_day;

      if (anchorDay != null && day === Math.min(anchorDay, lastDay)) {
        result.push(date);
      }
    }
  }
  return result;
}
// ---------- Ringkasan siklus ----------

export type Warning = { level: "ok" | "caution" | "danger"; message: string };

export type SummaryInput = {
  today: string;
  balance: number;
  plan: { last: string; next: string };
  bills: Bill[];
  paid: Set<string>; // isi: `${bill_id}|${due_date}`
  expenses: { amount: number; occurred_on: string; excluded?: boolean }[];
};

export function computeSummary(i: SummaryInput) {
  const { today, balance, plan } = i;

  const rawDaysLeft = daysBetween(today, plan.next);
  const overdue = rawDaysLeft <= 0;
  const daysLeft = Math.max(rawDaysLeft, 0);

  const cycleTotalDays = Math.max(daysBetween(plan.last, plan.next), 1);
  const cycleDay = Math.min(
    Math.max(daysBetween(plan.last, today) + 1, 1),
    cycleTotalDays,
  );

  // Tagihan yang jatuh tempo di siklus ini dan belum dibayar

  // Cadangkan tagihan yang belum lunas sebelum kiriman berikutnya.
  // Tagihan sekali bayar dan cicilan terbatas dapat memiliki
  // tunggakan dari siklus sebelumnya.
  let unpaidBills = 0;

  for (const b of i.bills) {
    const type = b.schedule_type ?? "ongoing";

    let rangeStart = plan.last;
    if (b.start_date) {
      rangeStart = b.start_date;
    }

    for (const d of dueDates(b, rangeStart, plan.next)) {
      if (!i.paid.has(`${b.id}|${d}`)) {
        unpaidBills += b.amount;
      }
    }
  }

  const available = balance - unpaidBills;
  const safePerDay = Math.floor(Math.max(available, 0) / Math.max(daysLeft, 1));

  // Rata-rata belanja harian: 7 hari terakhir, tapi tidak sebelum siklus mulai
  const windowStart =
    plan.last > addDays(today, -6) ? plan.last : addDays(today, -6);
  const windowDays = daysBetween(windowStart, today) + 1;
  const windowSpent = i.expenses
    .filter(
      (e) =>
        !e.excluded && e.occurred_on >= windowStart && e.occurred_on <= today,
    )
    .reduce((s, e) => s + e.amount, 0);
  const avgDaily = Math.round(windowSpent / windowDays);

  let warning: Warning;
  if (overdue) {
    warning = {
      level: "caution",
      message:
        "Tanggal kiriman sudah lewat. Perbarui tanggal kiriman berikutnya supaya hitungannya akurat.",
    };
  } else if (available <= 0) {
    warning = {
      level: "danger",
      message:
        "Saldo kamu tidak cukup untuk tagihan yang jatuh tempo sebelum kiriman.",
    };
  } else if (windowDays < 3) {
    warning = {
      level: "ok",
      message:
        "Catat pengeluaranmu beberapa hari dulu. Setelah itu kami bisa memperkirakan apakah uangmu cukup sampai kiriman.",
    };
  } else {
    const coveredDays =
      avgDaily > 0 ? Math.floor(available / avgDaily) : Infinity;
    const shortfall = daysLeft - coveredDays;
    if (shortfall >= 2) {
      warning = {
        level: "danger",
        message: `Dengan pola belanja sekarang, uangmu diperkirakan habis ${shortfall} hari sebelum kiriman.`,
      };
    } else if (shortfall === 1) {
      warning = {
        level: "caution",
        message:
          "Dengan pola belanja sekarang, uangmu diperkirakan habis 1 hari sebelum kiriman.",
      };
    } else {
      warning = {
        level: "ok",
        message:
          "Aman. Dengan pola belanja sekarang, uangmu cukup sampai kiriman berikutnya.",
      };
    }
  }

  return {
    safePerDay,
    daysLeft,
    cycleDay,
    cycleTotalDays,
    unpaidBills,
    avgDaily,
    warning,
  };
}
