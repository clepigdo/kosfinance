import { redirect } from "next/navigation";
import DashboardView, { type DashboardData } from "@/components/DashboardView";
import { createClient } from "@/utils/supabase/server";
import {
  computeSummary,
  relativeDay,
  shortDate,
  todayISO,
} from "@/lib/finance";

// Kategori yang tidak dihitung ke rata-rata belanja harian
// (sewa kos itu tagihan tetap, bukan belanja harian).
const EXCLUDED_FROM_AVG = ["Kos"];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: plan }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, onboarded")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("income_plans")
      .select("id, last_income_date, next_income_date")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!profile?.onboarded) redirect("/onboarding");
  if (!plan) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10 text-neutral-900">
        Rencana pemasukanmu belum ditemukan. Coba hubungi pengembang aplikasi.
      </main>
    );
  }

  const today = todayISO();
  const cycleStart: string = plan.last_income_date;

  const [
    balanceRes,
    catsRes,
    budgetsRes,
    billsRes,
    paymentsRes,
    cycleRes,
    recentRes,
  ] = await Promise.all([
    supabase
      .from("v_balance")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("categories").select("id, name").eq("user_id", user.id),
    supabase
      .from("budgets")
      .select("category_id, amount, warn_at")
      .eq("user_id", user.id),
    supabase
      .from("fixed_bills")
      .select(
        "id, amount, frequency, due_day, due_weekday, schedule_type, start_date, total_occurrences",
      )
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("bill_payments")
      .select("bill_id, due_date")
      .eq("user_id", user.id)
      .gte("due_date", cycleStart),
    supabase
      .from("transactions")
      .select("type, amount, category_id, occurred_on")
      .eq("user_id", user.id)
      .gte("occurred_on", cycleStart)
      .lte("occurred_on", today),
    supabase
      .from("transactions")
      .select("id, type, amount, category_id, note, occurred_on")
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const catName = new Map<string, string>(
    (catsRes.data ?? []).map((c) => [c.id, c.name]),
  );

  console.log("=== DASHBOARD CATEGORY DEBUG ===");

  console.log("User ID:", user.id);

  console.log("Categories error:", catsRes.error);
  console.log("Categories:", catsRes.data);

  console.log("Cycle transactions error:", cycleRes.error);
  console.log("Cycle transactions:", cycleRes.data);

  console.log("Recent transactions error:", recentRes.error);
  console.log("Recent transactions:", recentRes.data);

  console.log(
    "PayLater category:",
    catName.get("d15e571e-48d9-42f0-a420-188c3f01f510"),
  );

  const budgetBy = new Map(
    (budgetsRes.data ?? []).map((b) => [b.category_id, b]),
  );

  const expenses = (cycleRes.data ?? [])
    .filter((t) => t.type === "expense")
    .map((t) => ({
      amount: Number(t.amount),
      occurred_on: t.occurred_on as string,
      category_id: t.category_id as string | null,
      excluded: EXCLUDED_FROM_AVG.includes(catName.get(t.category_id) ?? ""),
    }));
  const todayExpenses = expenses
    .filter((e) => e.occurred_on === today)
    .reduce((total, e) => total + e.amount, 0);

  const todayIncome = (cycleRes.data ?? [])
    .filter((t) => t.type === "income" && t.occurred_on === today)
    .reduce((total, t) => total + Number(t.amount), 0);

  const currentBalance = Number(balanceRes.data?.balance ?? 0);

  // Rekonstruksi saldo sebelum transaksi hari ini
  const balanceAtStartOfToday = currentBalance + todayExpenses - todayIncome;

  const summary = computeSummary({
    today,
    balance: balanceAtStartOfToday,
    plan: { last: cycleStart, next: plan.next_income_date },
    bills: (billsRes.data ?? []).map((b) => ({
      ...b,
      amount: Number(b.amount),
    })),
    paid: new Set(
      (paymentsRes.data ?? []).map((p) => `${p.bill_id}|${p.due_date}`),
    ),
    expenses,
  });

  // Pengeluaran per kategori di siklus ini
  const spentBy = new Map<string, number>();
  for (const e of expenses) {
    const key = e.category_id ?? "none";
    spentBy.set(key, (spentBy.get(key) ?? 0) + e.amount);
  }

  const categories: DashboardData["categories"] = (catsRes.data ?? [])
    .filter((c) => spentBy.has(c.id) || budgetBy.has(c.id))
    .map((c) => ({
      name: c.name,
      spent: spentBy.get(c.id) ?? 0,
      budget: budgetBy.get(c.id)
        ? Number(budgetBy.get(c.id)!.amount)
        : undefined,
      warnAt: budgetBy.get(c.id)?.warn_at,
    }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 6);
  if (spentBy.has("none"))
    categories.push({ name: "Tanpa kategori", spent: spentBy.get("none")! });

  const rawName: string = profile.display_name ?? "kamu";
  const data: DashboardData = {
    planId: plan.id,
    nextIncomeDate: plan.next_income_date,
    cycleStart: cycleStart,
    name: rawName.charAt(0).toUpperCase() + rawName.slice(1),
    categoryPeriodLabel: `${shortDate(cycleStart)} – ${shortDate(today)}`,
    balance: Number(balanceRes.data?.balance ?? 0),
    safePerDay: Math.max(summary.safePerDay - todayExpenses, 0),
    cycleDay: summary.cycleDay,
    cycleTotalDays: summary.cycleTotalDays,
    daysLeft: summary.daysLeft,
    nextIncomeLabel: shortDate(plan.next_income_date),
    spentThisCycle: expenses.reduce((s, e) => s + e.amount, 0),
    avgDaily: summary.avgDaily,
    warning: summary.warning,
    categories,
    recent: (recentRes.data ?? []).map((t) => ({
      id: t.id,
      note: t.note ?? "",
      category: catName.get(t.category_id) ?? "Tanpa kategori",
      dateLabel: relativeDay(t.occurred_on, today),
      amount: Number(t.amount),
      type: t.type,
    })),
  };

  return <DashboardView data={data} />;
}
