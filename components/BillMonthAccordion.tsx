
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type BillMonthAccordionProps = {
  title: string;
  count: number;
  total: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function BillMonthAccordion({
  title,
  count,
  total,
  defaultOpen = false,
  children,
}: BillMonthAccordionProps) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-green-100 bg-white p-5"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green-700 [&::-webkit-details-marker]:hidden">
        <div>
          <h3 className="font-semibold capitalize">{title}</h3>
          <p className="text-xs text-neutral-500">
            {count} jadwal pembayaran
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm text-neutral-500">
              Sisa belum lunas
            </p>
            <p className="font-semibold">{total}</p>
          </div>

          <ChevronDown
            size={20}
            aria-hidden="true"
            className="shrink-0 text-neutral-500 transition-transform group-open:rotate-180"
          />
        </div>
      </summary>

      <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
        {children}
      </div>
    </details>
  );
}
