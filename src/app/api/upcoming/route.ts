export const runtime = "nodejs";

async function fetchJson(url: string) {
  const r = await fetch(url, { next: { revalidate: 300 } });
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

export async function GET() {
  const url = "https://api.openligadb.de/getmatchdata/bl1";
  const matches = await fetchJson(url);

  const upcoming = (Array.isArray(matches) ? matches : [])
    .filter((m: any) => m && !m.matchIsFinished)
    .map((m: any) => {
      const home = pickTeamName(m.team1);
      const away = pickTeamName(m.team2);
      const kickoffUtc = toIsoOrNull(m.matchDateTimeUTC || m.matchDateTime);

      return {
        matchId: m.matchID ?? null,
        kickoffUtc,
        group: clean(m.group?.groupName),
        home,
        away,
        homeLogo: clean(m.team1?.teamIconUrl),
        awayLogo: clean(m.team2?.teamIconUrl),
      };
    })
    .filter((x: any) => x.home && x.away)
    .sort((a: any, b: any) => {
      const ta = a.kickoffUtc ? new Date(a.kickoffUtc).getTime() : 9e15;
      const tb = b.kickoffUtc ? new Date(b.kickoffUtc).getTime() : 9e15;
      return ta - tb;
    })
    .slice(0, 18);

  return Response.json({ ok: true, source: "getmatchdata/bl1", count: upcoming.length, upcoming });
}
