'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { House, LogOut, Plus, ReceiptText, Wallet, type LucideIcon } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

// Halaman form (catat/ubah) tampil fokus: tanpa menu bawah di HP.
const isForm = (p: string) => p.startsWith('/transactions/new') || /\/edit$/.test(p)

type Item = { href: string; label: string; Icon: LucideIcon; match: (p: string) => boolean }

// Menambah menu baru cukup menambah satu baris di sini.
const LEFT: Item[] = [
  { href: '/dashboard', label: 'Beranda', Icon: House, match: (p) => p.startsWith('/dashboard') },
]
const RIGHT: Item[] = [
  {
    href: '/transactions',
    label: 'Transaksi',
    Icon: ReceiptText,
    match: (p) => p.startsWith('/transactions') && !isForm(p),
  },
]

const focus =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700'

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-green-700 text-white">
        <Wallet size={19} />
      </span>
      <span className="text-lg font-bold tracking-tight">KosFinance</span>
    </span>
  )
}

function Tab({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium ${focus} ${
        active ? 'text-green-700' : 'text-neutral-600'
      }`}
    >
      <item.Icon size={22} strokeWidth={active ? 2.4 : 2} />
      {item.label}
    </Link>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const focusMode = isForm(pathname)

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen text-neutral-900 md:pl-64">
      {/* Sidebar laptop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-green-100 bg-white px-4 py-6 md:flex">
        <Link href="/dashboard" className={`rounded-lg px-2 ${focus}`}>
          <Logo />
        </Link>

        <nav aria-label="Menu utama" className="mt-8 space-y-1">
          {[...LEFT, ...RIGHT].map((item) => {
            const active = item.match(pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${focus} ${
                  active ? 'bg-green-50 text-green-800' : 'text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <item.Icon size={20} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <Link
          href="/transactions/new"
          className={`mt-6 flex items-center justify-center gap-2 rounded-xl bg-green-700 py-3 text-sm font-semibold text-white hover:bg-green-800 ${focus}`}
        >
          <Plus size={18} />
          Catat transaksi
        </Link>

        <button
          type="button"
          onClick={logout}
          className={`mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 ${focus}`}
        >
          <LogOut size={20} />
          Keluar
        </button>
      </aside>

      {/* Header HP */}
      {!focusMode && (
        <header className="sticky top-0 z-30 flex items-center justify-between bg-[#f3f8f4]/90 px-5 py-3 backdrop-blur md:hidden">
          <Logo />
          <button
            type="button"
            onClick={logout}
            aria-label="Keluar"
            className={`grid h-10 w-10 place-items-center rounded-full text-neutral-700 hover:bg-white ${focus}`}
          >
            <LogOut size={20} />
          </button>
        </header>
      )}

      <main className="mx-auto w-full max-w-5xl px-5 pb-28 pt-4 md:px-8 md:pb-12 md:pt-8">
        {children}
      </main>

      {/* Menu bawah HP */}
      {!focusMode && (
        <nav
          aria-label="Menu utama"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-green-100 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <div className="mx-auto flex max-w-md items-end px-4">
            {LEFT.map((item) => (
              <Tab key={item.href} item={item} active={item.match(pathname)} />
            ))}

            <div className="flex flex-1 flex-col items-center pb-2">
              <Link
                href="/transactions/new"
                aria-label="Catat transaksi"
                className={`-mt-6 grid h-14 w-14 place-items-center rounded-full bg-green-700 text-white shadow-lg ring-4 ring-[#f3f8f4] hover:bg-green-800 ${focus}`}
              >
                <Plus size={28} />
              </Link>
              <span className="mt-1 text-xs font-medium text-neutral-600">Catat</span>
            </div>

            {RIGHT.map((item) => (
              <Tab key={item.href} item={item} active={item.match(pathname)} />
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}