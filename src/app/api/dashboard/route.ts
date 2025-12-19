import { buildStrengthsFromMatches, predict3WayFromStrengths } from "@/lib/predict";

export const runtime = "nodejs";

type Cache = { season: number; ts: number; matches: any[] } | null;
let MATCH_CACHE: Cache = null;

async function fetchJson(url: string, revalidateSeconds: number) {
  const r = await fetch(url, { next: { revalidate: revalidateSeconds } });
  if (!r.ok) throw new Error("Fetch failed " + r.status);
  return r.json();
}

function clean(s: any): string {
  return (typeof s === "string" ? s : "").trim();
}
function toIsoOrNull(raw: any): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
function pickTeamName(team: any): string {
  return clean(team?.teamName) || clean(team?.shortName);
}
function groupLabel(m: any): string {
  return clean(m?.group?.groupName);
}
function groupNumberFromLabel(label: string): number | null {
  const m = label.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function poissonPmf(k: number, lambda: number) {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / fact;
}
function scoreMatrix(lambdaHome: number, lambdaAway: number, maxGoals = 6) {
  const rows: { hg: number; ag: number; p: number }[] = [];
  for (let hg = 0; hg <= maxGoals; hg++) {
    const ph = poissonPmf(hg, lambdaHome);
    for (let ag = 0; ag <= maxGoals; ag++) {
      const pa = poissonPmf(ag, lambdaAway);
      rows.push({ hg, ag, p: ph * pa });
    }
  }
  const s = rows.reduce((a, b) => a + b.p, 0);
  for (const r of rows) r.p /= s;
  rows.sort((a, b) => b.p - a.p);
  return rows;
}
function derivedMarkets(matrix: { hg: number; ag: number; p: number }[]) {
  let over25 = 0;
  let btts = 0;
  for (const r of matrix) {
    if (r.hg + r.ag >= 3) over25 += r.p;
    if (r.hg >= 1 && r.ag >= 1) btts += r.p;
  }
  return { over25, under25: 1 - over25, bttsYes: btts, bttsNo: 1 - btts };
}
function confidenceFrom3Way(pHome: number, pDraw: number, pAway: number) {
  const eps = 1e-12;
  const ps = [pHome, pDraw, pAway].map((x) => Math.max(eps, x));
  const H = -ps.reduce((a, x) => a + x * Math.log(x), 0);
  const Hmax = Math.log(3);
  const clarity = 1 - H / Hmax;
  return Math.max(0, Math.min(1, clarity));
}

function finalScore(m: any): { hg: number; ag: number } | null {
  const results = Array.isArray(m?.matchResults) ? m.matchResults : [];
  if (!results.length) return null;
  const last = results[results.length - 1];
  const hg = Number(last?.pointsTeam1);
  const ag = Number(last?.pointsTeam2);
  if (!Number.isFinite(hg) || !Number.isFinite(ag)) return null;
  return { hg, ag };
}
function outcomeFromScore(hg: number, ag: number): "HOME" | "DRAW" | "AWAY" {
  if (hg > ag) return "HOME";
  if (hg < ag) return "AWAY";
  return "DRAW";
}
function topPick(pred: any): "HOME" | "DRAW" | "AWAY" {
  const ph = pred?.p?.home ?? 0;
  const pd = pred?.p?.draw ?? 0;
  const pa = pred?.p?.away ?? 0;
  if (ph >= pd && ph >= pa) return "HOME";
  if (pd >= ph && pd >= pa) return "DRAW";
  return "AWAY";
}

async function getSeasonMatches(season: number) {
  const now = Date.now();
  if (MATCH_CACHE && MATCH_CACHE.season === season && now - MATCH_CACHE.ts < 10 * 60 * 1000) {
    return MATCH_CACHE.matches;
  }
  const matches = await fetchJson("https://api.openligadb.de/getmatchdata/bl1/" + season, 600);
  MATCH_CACHE = { season, ts: now, matches };
  return matches;
}

function normalizeMatch(m: any) {
  const sc = finalScore(m);
  return {
    matchId: m.matchID ?? null,
    kickoffUtc: toIsoOrNull(m.matchDateTimeUTC || m.matchDateTime),
    group: groupLabel(m),
    groupNo: groupNumberFromLabel(groupLabel(m)),
    home: pickTeamName(m.team1),
    away: pickTeamName(m.team2),
    homeLogo: clean(m.team1?.teamIconUrl),
    awayLogo: clean(m.team2?.teamIconUrl),
    isFinished: !!m.matchIsFinished,
    score: sc ? `${sc.hg}:${sc.ag}` : null,
    _score: sc,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const season = Number(process.env.SEASON || "2025");
  const maxGoals = Number(searchParams.get("maxGoals") || "6");
  const requestedMatchday = searchParams.get("matchday");
  const requestedNo = requestedMatchday ? Number(requestedMatchday) : null;

  // Saison-Daten (für Spieltage + Modell)
  const seasonMatches = await getSeasonMatches(season);

  // verfügbare Spieltage (aus Saison)
  const mdSet = new Set<number>();
  for (const m of seasonMatches || []) {
    const label = groupLabel(m);
    const n = groupNumberFromLabel(label);
    if (n) mdSet.add(n);
  }
  const availableMatchdays = Array.from(mdSet).sort((a, b) => a - b);

  // "aktueller Spieltag" aus OpenLigaDB current endpoint (nur damit Default passt)
  const currentRaw = await fetchJson("https://api.openligadb.de/getmatchdata/bl1", 300);
  const currentFirst = Array.isArray(currentRaw) && currentRaw.length ? normalizeMatch(currentRaw[0]) : null;
  const currentMatchdayNo = currentFirst?.groupNo ?? (availableMatchdays.at(-1) ?? 1);

  const matchdayNo = Number.isFinite(requestedNo as any) && requestedNo ? requestedNo : currentMatchdayNo;

  // Spiele des gewählten Spieltags (aus Saison, damit man zurückklicken kann)
  const matchday = (Array.isArray(seasonMatches) ? seasonMatches : [])
    .map(normalizeMatch)
    .filter((x) => x.home && x.away && x.groupNo === matchdayNo)
    .sort((a, b) => {
      const ta = a.kickoffUtc ? new Date(a.kickoffUtc).getTime() : 9e15;
      const tb = b.kickoffUtc ? new Date(b.kickoffUtc).getTime() : 9e15;
      return ta - tb;
    });

  // Modell aus Saison
  const strengths = buildStrengthsFromMatches(seasonMatches);

  const items = matchday.map((m: any) => {
    const pred = predict3WayFromStrengths(strengths, m.home, m.away);

    let nerd = null;
    if (pred?.ok) {
      const matrix = scoreMatrix(pred.lambdaHome, pred.lambdaAway, maxGoals);
      const topScores = matrix.slice(0, 5).map((r) => ({
        score: `${r.hg}:${r.ag}`,
        p: r.p,
        pct: Math.round(r.p * 1000) / 10,
      }));
      const mk = derivedMarkets(matrix);
      const conf = confidenceFrom3Way(pred.p.home, pred.p.draw, pred.p.away);

      nerd = {
        topScores,
        overUnder25: {
          overPct: Math.round(mk.over25 * 1000) / 10,
          underPct: Math.round(mk.under25 * 1000) / 10,
        },
        btts: {
          yesPct: Math.round(mk.bttsYes * 1000) / 10,
          noPct: Math.round(mk.bttsNo * 1000) / 10,
        },
        confidence: {
          value: conf,
          pct: Math.round(conf * 100),
          label: conf >= 0.55 ? "hoch" : conf >= 0.35 ? "mittel" : "niedrig",
        },
      };
    }

    let correctness = null;
    if (pred?.ok && m.isFinished && m._score) {
      const actual = outcomeFromScore(m._score.hg, m._score.ag);
      const pick = topPick(pred);
      correctness = { pick, actual, correct: pick === actual };
    }

    return { ...m, pred, nerd, correctness };
  });

  // Stats pro Spieltag
  const finished = items.filter((x: any) => x.isFinished && x.correctness).length;
  const correct = items.filter((x: any) => x.correctness?.correct).length;
  const total = items.length;
  const accuracyPct = finished ? Math.round((correct / finished) * 1000) / 10 : 0;

  return Response.json({
    ok: true,
    source: "OpenLigaDB (season matchdays + season strengths)",
    season,
    matchdayNo,
    matchdayLabel: `${matchdayNo}. Spieltag`,
    currentMatchdayNo,
    availableMatchdays,
    summary: { total, finished, correct, accuracyPct },
    items,
  });
}