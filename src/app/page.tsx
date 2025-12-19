import DashboardClient from "./DashboardClient";

function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function getDashboard() {
  const res = await fetch(`${baseUrl()}/api/dashboard`, { cache: "no-store" });
  if (!res.ok) return { ok: false, items: [] };
  return res.json();
}

export default async function Home() {
  const data = await getDashboard();
  const items = data.items || [];

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
            Sortieren, filtern, suchen – plus Score-Probs, O/U 2.5, BTTS & Confidence.
          </p>

          <div className="mt-4 text-xs text-black/55">
            Daten: OpenLigaDB • Modell: Saisonstärken + Formfaktor → Poisson
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-14">
        <DashboardClient items={items} />
      </section>
    </main>
  );
}
