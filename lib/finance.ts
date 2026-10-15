// Semua hitungan keuangan ada di sini, murni kode biasa (tanpa AI),
// supaya hasilnya bisa dipercaya dan gampang dites.

const DAY = 86400000
const TZ = 'Asia/Jakarta' // MVP: semua user dianggap WIB

// ---------- Tanggal (format YYYY-MM-DD) ----------

export const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())

const toUTC = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export const addDays = (iso: string, n: number) =>
  new Date(toUTC(iso) + n * DAY).toISOString().slice(0, 10)

export const daysBetween = (a: string, b: string) =>
  Math.round((toUTC(b) - toUTC(a)) / DAY)

export const shortDate = (iso: string) =>
  new Date(toUTC(iso)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

export function relativeDay(iso: string, today: string) {
  const diff = daysBetween(iso, today)
  if (diff === 0) return 'Hari ini'
  if (diff === 1) return 'Kemarin'
  return shortDate(iso)
}

// ---------- Tagihan tetap ----------

export type Bill = {
  id: string
  amount: number
  frequency: 'weekly' | 'monthly'
  due_day: number | null
  due_weekday: number | null
}

// Tanggal jatuh tempo tagihan dalam rentang [start, end)
export function dueDates(bill: Bill, start: string, end: string): string[] {
  const out: string[] = []

  if (bill.frequency === 'weekly') {
    for (let d = start; d < end; d = addDays(d, 1)) {
      if (new Date(toUTC(d)).getUTCDay() === bill.due_weekday) out.push(d)
    }
    return out
  }

  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const day = Math.min(bill.due_day ?? 1, lastDay)
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (iso >= start && iso < end) out.push(iso)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

// ---------- Ringkasan siklus ----------

export type Warning = { level: 'ok' | 'caution' | 'danger'; message: string }

export type SummaryInput = {
  today: string
  balance: number
  plan: { last: string; next: string }
  bills: Bill[]
  paid: Set<string> // isi: `${bill_id}|${due_date}`
  expenses: { amount: number; occurred_on: string; excluded?: boolean }[]
}

export function computeSummary(i: SummaryInput) {
  const { today, balance, plan } = i

  const rawDaysLeft = daysBetween(today, plan.next)
  const overdue = rawDaysLeft <= 0
  const daysLeft = Math.max(rawDaysLeft, 0)

  const cycleTotalDays = Math.max(daysBetween(plan.last, plan.next), 1)
  const cycleDay = Math.min(Math.max(daysBetween(plan.last, today) + 1, 1), cycleTotalDays)

  // Tagihan yang jatuh tempo di siklus ini dan belum dibayar
  let unpaidBills = 0
  for (const b of i.bills) {
    for (const d of dueDates(b, plan.last, plan.next)) {
      if (!i.paid.has(`${b.id}|${d}`)) unpaidBills += b.amount
    }
  }

  const available = balance - unpaidBills
  const safePerDay = Math.floor(Math.max(available, 0) / Math.max(daysLeft, 1))

  // Rata-rata belanja harian: 7 hari terakhir, tapi tidak sebelum siklus mulai
  const windowStart = plan.last > addDays(today, -6) ? plan.last : addDays(today, -6)
  const windowDays = daysBetween(windowStart, today) + 1
  const windowSpent = i.expenses
    .filter((e) => !e.excluded && e.occurred_on >= windowStart && e.occurred_on <= today)
    .reduce((s, e) => s + e.amount, 0)
  const avgDaily = Math.round(windowSpent / windowDays)

  let warning: Warning
  if (overdue) {
    warning = {
      level: 'caution',
      message: 'Tanggal kiriman sudah lewat. Perbarui tanggal kiriman berikutnya supaya hitungannya akurat.',
    }
  } else if (available <= 0) {
    warning = {
      level: 'danger',
      message: 'Saldo kamu tidak cukup untuk tagihan yang jatuh tempo sebelum kiriman.',
    }
  } else if (windowDays < 3) {
    warning = {
      level: 'ok',
      message: 'Catat pengeluaranmu beberapa hari dulu. Setelah itu kami bisa memperkirakan apakah uangmu cukup sampai kiriman.',
    }
  } else {
    const coveredDays = avgDaily > 0 ? Math.floor(available / avgDaily) : Infinity
    const shortfall = daysLeft - coveredDays
    if (shortfall >= 2) {
      warning = {
        level: 'danger',
        message: `Dengan pola belanja sekarang, uangmu diperkirakan habis ${shortfall} hari sebelum kiriman.`,
      }
    } else if (shortfall === 1) {
      warning = {
        level: 'caution',
        message: 'Dengan pola belanja sekarang, uangmu diperkirakan habis 1 hari sebelum kiriman.',
      }
    } else {
      warning = {
        level: 'ok',
        message: 'Aman. Dengan pola belanja sekarang, uangmu cukup sampai kiriman berikutnya.',
      }
    }
  }

  return { safePerDay, daysLeft, cycleDay, cycleTotalDays, unpaidBills, avgDaily, warning }
}