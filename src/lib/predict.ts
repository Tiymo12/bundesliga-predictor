type TeamAgg = {
  homeFor: number; homeAgainst: number; homeN: number;
  awayFor: number; awayAgainst: number; awayN: number;
  form: number[]; // last results: 1 win, 0 draw, -1 loss
};

function poissonPmf(k: number, lambda: number) {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / fact;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pct(n: number) {
  return Math.round(n * 1000) / 10;
}

export function buildStrengthsFromMatches(matches: any[]) {
  const finished = (Array.isArray(matches) ? matches : []).filter((m: any) => m && m.matchIsFinished);

  const teams: Record<string, TeamAgg> = {};
  const homeGoals: number[] = [];
  const awayGoals: number[] = [];

  function ensure(name: string) {
    if (!teams[name]) {
      teams[name] = { homeFor: 0, homeAgainst: 0, homeN: 0, awayFor: 0, awayAgainst: 0, awayN: 0, form: [] };
    }
  }

  for (const m of finished) {
    const home = (m.team1?.teamName || m.team1?.shortName || "").trim();
    const away = (m.team2?.teamName || m.team2?.shortName || "").trim();
    if (!home || !away) continue;

    // Final result: in OpenLigaDB steckt es meist in matchResults (letztes Ergebnis ist Endstand)
    const results = Array.isArray(m.matchResults) ? m.matchResults : [];
    if (!results.length) continue;
    const last = results[results.length - 1];
    const hg = Number(last?.pointsTeam1);
    const ag = Number(last?.pointsTeam2);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;

    ensure(home); ensure(away);
    homeGoals.push(hg); awayGoals.push(ag);

    teams[home].homeFor += hg;
    teams[home].homeAgainst += ag;
    teams[home].homeN += 1;

    teams[away].awayFor += ag;
    teams[away].awayAgainst += hg;
    teams[away].awayN += 1;

    // form signals
    if (hg > ag) { teams[home].form.push(1); teams[away].form.push(-1); }
    else if (hg < ag) { teams[home].form.push(-1); teams[away].form.push(1); }
    else { teams[home].form.push(0); teams[away].form.push(0); }
  }

  const leagueHome = homeGoals.length ? homeGoals.reduce((a,b)=>a+b,0) / homeGoals.length : 1.55;
  const leagueAway = awayGoals.length ? awayGoals.reduce((a,b)=>a+b,0) / awayGoals.length : 1.25;

  // Shrinkage, damit bei wenig Spielen nix explodiert
  const SHRINK = 6;

  const strength = Object.fromEntries(Object.entries(teams).map(([name, t]) => {
    const hn = t.homeN;
    const an = t.awayN;

    const homeForPg = (t.homeFor + SHRINK * leagueHome) / (hn + SHRINK);
    const homeAgainstPg = (t.homeAgainst + SHRINK * leagueAway) / (hn + SHRINK);

    const awayForPg = (t.awayFor + SHRINK * leagueAway) / (an + SHRINK);
    const awayAgainstPg = (t.awayAgainst + SHRINK * leagueHome) / (an + SHRINK);

    const attackHome = homeForPg / leagueHome;
    const defenseHome = homeAgainstPg / leagueAway;

    const attackAway = awayForPg / leagueAway;
    const defenseAway = awayAgainstPg / leagueHome;

    const last8 = t.form.slice(-8);
    const formRaw = last8.length ? (last8.reduce((a,b)=>a+b,0) / last8.length) : 0;
    const formFactor = clamp(1 + 0.10 * formRaw, 0.90, 1.10);

    return [name, { attackHome, defenseHome, attackAway, defenseAway, formFactor, matches: hn + an }];
  }));

  return { leagueHome, leagueAway, teams: strength };
}

export function predict3WayFromStrengths(str: any, homeTeam: string, awayTeam: string, maxGoals = 8) {
  const H = str.teams[homeTeam];
  const A = str.teams[awayTeam];

  if (!H || !A) return { ok: false as const, error: "TEAM_NOT_FOUND", homeTeam, awayTeam };

  let lambdaHome = str.leagueHome * H.attackHome * A.defenseAway * H.formFactor;
  let lambdaAway = str.leagueAway * A.attackAway * H.defenseHome * A.formFactor;

  lambdaHome = clamp(lambdaHome, 0.2, 3.8);
  lambdaAway = clamp(lambdaAway, 0.2, 3.3);

  let pHome = 0, pDraw = 0, pAway = 0;

  for (let hg = 0; hg <= maxGoals; hg++) {
    const ph = poissonPmf(hg, lambdaHome);
    for (let ag = 0; ag <= maxGoals; ag++) {
      const pa = poissonPmf(ag, lambdaAway);
      const p = ph * pa;
      if (hg > ag) pHome += p;
      else if (hg === ag) pDraw += p;
      else pAway += p;
    }
  }
  const s = pHome + pDraw + pAway;
  pHome /= s; pDraw /= s; pAway /= s;

  return {
    ok: true as const,
    homeTeam, awayTeam,
    lambdaHome, lambdaAway,
    p: { home: pHome, draw: pDraw, away: pAway },
    pretty: { home: pct(pHome), draw: pct(pDraw), away: pct(pAway) }
  };
}
