import DashboardClient from "./DashboardClient";
import { headers } from "next/headers";

async function originFromHeaders() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function getDashboard() {
  const origin = await originFromHeaders();
  const res = await fetch(`${origin}/api/dashboard`, { cache: "no-store" });
  if (!res.ok) return { ok: false, items: [], availableMatchdays: [], summary: { total: 0, finished: 0, correct: 0, accuracyPct: 0 }, matchdayNo: 1, matchdayLabel: "1. Spieltag", currentMatchdayNo: 1, season: 2025 };
  return res.json();
}

export default async function Home() {
  const data = await getDashboard();

  return (
    <main className="min-h-screen">
      <header className="mx-auto max-w-6xl px-5 pt-10 pb-6">
        <div className="glass rounded-3xl p-6 md:p-8 shadow-2xl shadow-black/40">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-black/80">
            Neutral • ohne Quoten • Pre-Match
          </div>

          <h1 className="mt-4 text-3xl md:text-5xl font-extrabold tracking-tight">
            Bundesliga Predictor
          </h1>

          <p className="mt-2 text-black/70 max-w-2xl">
            Spieltage zurückklicken, Stats pro Spieltag, plus Score-Probs, O/U 2.5, BTTS.
          </p>

          <div className="mt-4 text-xs text-black/55">
            Daten: OpenLigaDB • Modell: Saisonstärken + Formfaktor → Poisson
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-14">
        <DashboardClient initial={data} />
      </section>
    </main>
  );
}