import { useSyncExternalStore } from 'react'

// Tanggal lokal user (YYYY-MM-DD), bukan UTC server
export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const addDaysISO = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  return toISO(new Date(y, m - 1, d + n))
}

const subscribe = () => () => {}

export function useToday(): string {
  return useSyncExternalStore(subscribe, () => toISO(new Date()), () => '')
}