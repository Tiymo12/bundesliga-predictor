import { buildStrengthsFromMatches, predict3WayFromStrengths } from "@/lib/predict";

export const runtime = "nodejs";

type Cache = { season: number; ts: number; matches: any[] } | null;
let MATCH_CACHE: Cache = null;

async function fetchJson(url: string) {
  // Next.js Cache: revalidate 10 Minuten
  const r = await fetch(url, { next: { revalidate: 600 } });
  if (!r.ok) throw new Error("Fetch failed " + r.status);
  return r.json();
}

async function getSeasonMatches(season: number) {
  const now = Date.now();
  // In-memory Cache (hilft lokal & oft auch auf Vercel warm)
  if (MATCH_CACHE && MATCH_CACHE.season === season && now - MATCH_CACHE.ts < 10 * 60 * 1000) {
    return MATCH_CACHE.matches;
  }
  const matches = await fetchJson("https://api.openligadb.de/getmatchdata/bl1/" + season);
  MATCH_CACHE = { season, ts: now, matches };
  return matches;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const home = searchParams.get("home") || "";
  const away = searchParams.get("away") || "";

  if (!home || !away) {
    return Response.json({ ok: false, error: "MISSING_PARAMS", need: ["home", "away"] }, { status: 400 });
  }

  const season = Number(process.env.SEASON || "2025");
  const matches = await getSeasonMatches(season);

  const strengths = buildStrengthsFromMatches(matches);
  const result = predict3WayFromStrengths(strengths, home, away);

  // Erklärung: wir geben die wichtigsten Werte mit zurück
  return Response.json(
    {
      ...result,
      meta: {
        source: "OpenLigaDB getmatchdata/bl1/" + season,
        cache: { revalidateSeconds: 600, inMemory: true },
        leagueAverages: { homeGoals: strengths.leagueHome, awayGoals: strengths.leagueAway },
        teamsInModel: Object.keys(strengths.teams).length,
      },
      explain: result.ok
        ? {
            expectedGoals: { home: result.lambdaHome, away: result.lambdaAway },
            note:
              "Wahrscheinlichkeiten aus Saison-Daten: Team-Stärken (Heim/Auswärts) + Formfaktor, dann Poisson-Modell.",
          }
        : null,
    },
    { status: result.ok ? 200 : 404 }
  );
}
