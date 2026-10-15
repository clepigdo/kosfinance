"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CalendarCheck,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Wallet,
  Zap,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";

const inputClass =
  "w-full rounded-xl border border-neutral-300 bg-white py-3 pl-11 pr-4 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700";

const features = [
  {
    Icon: CalendarCheck,
    text: "Jatah harian dihitung otomatis sampai kiriman berikutnya",
  },
  { Icon: BellRing, text: "Diberi tahu sebelum uangmu habis" },
  { Icon: Zap, text: "Catat pengeluaran dalam hitungan detik" },
];

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError("Email atau password belum cocok. Coba cek lagi ya.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        if (data.session) {
          await supabase.auth.signOut();
        }

        setIsLogin(true);
        setPassword("");

        setInfo(
          data.session
            ? "Akun berhasil dibuat. Silakan masuk dengan akunmu."
            : "Akun berhasil dibuat. Cek email untuk konfirmasi, lalu masuk.",
        );
      }
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[#f3f8f4] text-neutral-900 md:grid md:grid-cols-2">
      {/* Panel hijau */}
      <section className="relative overflow-hidden rounded-b-3xl bg-green-700 px-6 pb-10 pt-12 text-white md:flex md:flex-col md:justify-center md:rounded-none md:px-14">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-14 h-52 w-52 rounded-full bg-green-600/60"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-green-800/40"
        />

        <div className="relative mx-auto w-full max-w-sm md:mx-0 md:max-w-md">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-green-700">
              <Wallet size={22} />
            </span>
            <span className="text-xl font-bold tracking-tight">KosFinance</span>
          </div>

          <h1 className="mt-8 text-3xl font-bold leading-tight tracking-tight md:text-4xl">
            Tahu berapa uang yang aman kamu pakai hari ini
          </h1>
          <p className="mt-3 text-sm text-green-50 md:text-base">
            Catatan keuangan sederhana buat anak kos, supaya uang kiriman cukup
            sampai kiriman berikutnya.
          </p>

          <ul className="mt-8 hidden space-y-4 md:block">
            {features.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15">
                  <Icon size={18} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Form */}
      <section className="px-6 py-8 md:flex md:items-center md:justify-center">
        <div className="mx-auto w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight">
            {isLogin ? "Masuk ke akunmu" : "Buat akun baru"}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            {isLogin
              ? "Lihat jatah aman kamu hari ini."
              : "Setelah daftar, kita atur keuanganmu bareng."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email
              </label>
              <div className="relative mt-1.5">
                <Mail
                  size={18}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputClass}
                  placeholder="nama@email.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock
                  size={18}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className={`${inputClass} pr-12`}
                  placeholder="Minimal 6 karakter"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={
                    showPassword ? "Sembunyikan password" : "Tampilkan password"
                  }
                  className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-700"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
              >
                {error}
              </p>
            )}
            {info && (
              <p
                role="status"
                className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
              >
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-green-700 py-3.5 text-sm font-semibold text-white hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:opacity-50"
            >
              {loading ? "Sebentar ya..." : isLogin ? "Masuk" : "Buat akun"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-700">
            {isLogin ? "Belum punya akun?" : "Sudah punya akun?"}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
                setInfo("");
              }}
              className="ml-1.5 font-semibold text-green-800 underline underline-offset-4"
            >
              {isLogin ? "Daftar di sini" : "Masuk di sini"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
