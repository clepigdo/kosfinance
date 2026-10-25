import { describe, expect, it } from "vitest";
import {
  generateBillOccurrences,
  splitBillOccurrences,
  type ScheduledBill,
} from "../lib/bill-schedule";

const internet: ScheduledBill = {
  id: "internet-1",
  name: "Internet",
  amount: 200_000,
  frequency: "monthly",
  due_day: 10,
  due_weekday: null,
  schedule_type: "ongoing",
  start_date: "2026-09-10",
  total_occurrences: null,
};

const kos: ScheduledBill = {
  id: "kos-1",
  name: "Cicilan Kos",
  amount: 1_200_000,
  frequency: "monthly",
  due_day: 15,
  due_weekday: null,
  schedule_type: "limited",
  start_date: "2026-11-15",
  total_occurrences: 5,
};

describe("KosFinance - Bills Schedule Engine", () => {
  it("menghasilkan lima cicilan kos", () => {
    const result = generateBillOccurrences(
      [kos],
      new Set(),
      "2026-10-01",
      "2027-04-01",
    );

    expect(result).toHaveLength(5);

    expect(result.map((item) => item.date)).toEqual([
      "2026-11-15",
      "2026-12-15",
      "2027-01-15",
      "2027-02-15",
      "2027-03-15",
    ]);

    expect(result.map((item) => item.installment)).toEqual([1, 2, 3, 4, 5]);
  });

  it("menampilkan tunggakan tagihan rutin", () => {
    const result = generateBillOccurrences(
      [internet],
      new Set(),
      "2026-10-01",
      "2026-12-01",
    );

    expect(result.map((item) => item.date)).toEqual([
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
    ]);

    expect(result.every((item) => !item.isPaid)).toBe(true);
  });

  it("mengenali pembayaran yang sudah lunas", () => {
    const result = generateBillOccurrences(
      [internet],
      new Set(["internet-1|2026-09-10"]),
      "2026-10-01",
      "2026-12-01",
    );

    expect(result[0].isPaid).toBe(true);
    expect(result[1].isPaid).toBe(false);
    expect(result[2].isPaid).toBe(false);
  });

  it("memisahkan prioritas dan jadwal mendatang", () => {
    const occurrences = generateBillOccurrences(
      [internet],
      new Set(["internet-1|2026-09-10"]),
      "2026-10-01",
      "2026-12-01",
    );

    const result = splitBillOccurrences(
      occurrences,
      "2026-10-25",
      "2026-11-01",
    );

    expect(result.priorityItems.map((item) => item.date)).toEqual([
      "2026-10-10",
    ]);

    expect(result.overdueItems.map((item) => item.date)).toEqual([
      "2026-10-10",
    ]);

    expect(result.scheduledItems.map((item) => item.date)).toEqual([
      "2026-09-10",
      "2026-11-10",
    ]);
  });
});
