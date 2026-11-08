"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard Error]", error);
  }, [error]);

  return (
    <main role="alert" className="mx-auto max-w-xl px-5 py-16 text-center">
      <h1 className="text-xl font-bold text-neutral-900">
        Data keuangan gagal dimuat
      </h1>

      <p className="mt-3 text-sm text-neutral-600">
        Kami tidak dapat menampilkan informasi keuangan dengan aman saat ini.
        Data transaksi kamu tidak berubah.
      </p>

      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-xl bg-green-700 px-5 py-3 text-sm font-semibold text-white hover:bg-green-800"
      >
        Coba Lagi
      </button>
    </main>
  );
}