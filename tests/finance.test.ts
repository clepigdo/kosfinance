import { describe, expect, it } from "vitest";
import { computeSummary } from "../lib/finance";

describe("KosFinance - Finance Engine", () => {
  it("menghitung jatah aman tanpa tagihan", () => {
    const result = computeSummary({
      today: "2026-10-23",
      balance: 1_500_000,
      plan: {
        last: "2026-10-22",
        next: "2026-10-27",
      },
      bills: [],
      paid: new Set(),
      expenses: [],
    });

    expect(result.safePerDay).toBe(375_000);
    expect(result.unpaidBills).toBe(0);
  });

  it("tidak menghitung ulang tagihan yang sudah lunas", () => {
    const result = computeSummary({
      today: "2026-10-23",
      balance: 1_180_000,
      plan: {
        last: "2026-10-22",
        next: "2026-10-27",
      },
      bills: [
        {
          id: "paylater-1",
          amount: 320_000,
          frequency: "monthly",
          due_day: 25,
          due_weekday: null,
          schedule_type: "once",
          start_date: "2026-10-25",
          total_occurrences: null,
        },
      ],
      paid: new Set(["paylater-1|2026-10-25"]),
      expenses: [],
    });

    expect(result.unpaidBills).toBe(0);
    expect(result.safePerDay).toBe(295_000);
  });

  it("mencadangkan tagihan yang belum lunas", () => {
    const result = computeSummary({
      today: "2026-10-23",
      balance: 1_500_000,
      plan: {
        last: "2026-10-22",
        next: "2026-10-27",
      },
      bills: [
        {
          id: "paylater-1",
          amount: 320_000,
          frequency: "monthly",
          due_day: 25,
          due_weekday: null,
          schedule_type: "once",
          start_date: "2026-10-25",
          total_occurrences: null,
        },
      ],
      paid: new Set(),
      expenses: [],
    });

    expect(result.unpaidBills).toBe(320_000);
    expect(result.safePerDay).toBe(295_000);
  });

  it("memberi peringatan saat saldo tidak cukup", () => {
    const result = computeSummary({
      today: "2026-10-23",
      balance: -100_000,
      plan: {
        last: "2026-10-22",
        next: "2026-10-27",
      },
      bills: [],
      paid: new Set(),
      expenses: [],
    });

    expect(result.safePerDay).toBe(0);
    expect(result.warning.level).toBe("danger");
  });

  it("tetap menghitung tunggakan dari siklus sebelumnya", () => {
    const result = computeSummary({
      today: "2026-10-23",
      balance: 1_500_000,
      plan: {
        last: "2026-10-22",
        next: "2026-10-27",
      },
      bills: [
        {
          id: "kos-tertunggak",
          amount: 600_000,
          frequency: "monthly",
          due_day: 18,
          due_weekday: null,
          schedule_type: "once",
          start_date: "2026-10-18",
          total_occurrences: null,
        },
      ],
      paid: new Set(),
      expenses: [],
    });

    expect(result.unpaidBills).toBe(600_000);
    expect(result.safePerDay).toBe(225_000);
  });

  it("mencadangkan tunggakan tagihan rutin dari bulan sebelumnya", () => {
    const result = computeSummary({
      today: "2026-10-25",
      balance: 1_500_000,
      plan: {
        last: "2026-10-22",
        next: "2026-10-27",
      },
      bills: [
        {
          id: "internet-rutin",
          amount: 200_000,
          frequency: "monthly",
          due_day: 10,
          due_weekday: null,
          schedule_type: "ongoing",
          start_date: "2026-09-10",
          total_occurrences: null,
        },
      ],
      paid: new Set(),
      expenses: [],
    });

    expect(result.unpaidBills).toBe(400_000);
    expect(result.safePerDay).toBe(550_000);
  });

  it("tidak mencadangkan tunggakan rutin yang sudah lunas", () => {
    const result = computeSummary({
      today: "2026-10-25",
      balance: 1_300_000,
      plan: {
        last: "2026-10-22",
        next: "2026-10-27",
      },
      bills: [
        {
          id: "internet-rutin",
          amount: 200_000,
          frequency: "monthly",
          due_day: 10,
          due_weekday: null,
          schedule_type: "ongoing",
          start_date: "2026-09-10",
          total_occurrences: null,
        },
      ],
      paid: new Set(["internet-rutin|2026-09-10"]),
      expenses: [],
    });

    expect(result.unpaidBills).toBe(200_000);
    expect(result.safePerDay).toBe(550_000);
  });
});
