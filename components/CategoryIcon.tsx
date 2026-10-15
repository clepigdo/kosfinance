import {
  BookOpen,
  Briefcase,
  Bus,
  Ellipsis,
  Gamepad2,
  HeartPulse,
  House,
  Shirt,
  ShoppingBag,
  Tag,
  Utensils,
  Wallet,
  Wifi,
  type LucideIcon,
} from 'lucide-react'

type Style = { Icon: LucideIcon; tile: string }

// Dicocokkan lewat nama kategori (huruf kecil). Kategori buatan sendiri
// yang belum terdaftar di sini otomatis memakai ikon label.
const STYLES: Record<string, Style> = {
  makanan: { Icon: Utensils, tile: 'bg-orange-100 text-orange-700' },
  transportasi: { Icon: Bus, tile: 'bg-sky-100 text-sky-700' },
  kos: { Icon: House, tile: 'bg-violet-100 text-violet-700' },
  laundry: { Icon: Shirt, tile: 'bg-cyan-100 text-cyan-700' },
  'pulsa & internet': { Icon: Wifi, tile: 'bg-indigo-100 text-indigo-700' },
  hiburan: { Icon: Gamepad2, tile: 'bg-pink-100 text-pink-700' },
  belanja: { Icon: ShoppingBag, tile: 'bg-amber-100 text-amber-700' },
  pendidikan: { Icon: BookOpen, tile: 'bg-blue-100 text-blue-700' },
  kesehatan: { Icon: HeartPulse, tile: 'bg-rose-100 text-rose-700' },
  'uang kiriman': { Icon: Wallet, tile: 'bg-green-100 text-green-700' },
  'penghasilan sendiri': { Icon: Briefcase, tile: 'bg-lime-100 text-lime-800' },
  lainnya: { Icon: Ellipsis, tile: 'bg-neutral-100 text-neutral-600' },
}

const FALLBACK: Style = { Icon: Tag, tile: 'bg-neutral-100 text-neutral-600' }

export default function CategoryIcon({
  name,
  size = 'md',
}: {
  name: string
  size?: 'sm' | 'md'
}) {
  const { Icon, tile } = STYLES[name.trim().toLowerCase()] ?? FALLBACK
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl'

  return (
    <span className={`grid shrink-0 place-items-center ${box} ${tile}`} aria-hidden="true">
      <Icon size={size === 'sm' ? 16 : 20} strokeWidth={2} />
    </span>
  )
}