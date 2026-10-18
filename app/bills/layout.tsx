
import AppShell from "@/components/AppShell";

export default function BillsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
