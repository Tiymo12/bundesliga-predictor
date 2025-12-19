"use client";

import { useMemo, useState } from "react";

type Item = {
  matchId: number;
  kickoffUtc: string | null;
  group: string;
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  isFinished?: boolean;
  score?: string | null;
  pred?: any;
  nerd?: any;
  correctness?: { correct: boolean; pick: "HOME"|"DRAW"|"AWAY"; actual: "HOME"|"DRAW"|"AWAY" } | null;
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function kickoffInfo(iso: string | null) {
  if (!iso) return { date: "tbd", time: "", badge: null as null | "today" | "tomorrow" };

  const d = new Date(iso);
  const now = new Date();

  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((dDay - nDay) / 86400000);

  let badge: null | "today" | "tomorrow" = null;
  if (diffDays === 0) badge = "today";
  if (diffDays === 1) badge = "tomorrow";

  return {
    date: d.toLocaleDateString("de-DE", { dateStyle: "medium" }),
    time: d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    badge,
  };
}

function Pill({ active, children, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-3 py-2 rounded-full text-sm transition",
        "border border-white/10",
        active
          ? "bg-white text-black border-white/30 shadow-lg shadow-black/30 font-semibold"
          : "bg-black/25 text-white/75 hover:bg-white/10",
      ].join(" ")}
      type="button"
    >
      {children}
    </button>
  );
}

export default function DashboardClient({ items }: { items: Item[] }) {
  const [sort, setSort] = useState<"time" | "home" | "away" | "conf">("time");
  const [highOnly, setHighOnly] = useState(false);
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    let list = [...(items || [])];

    const qq = q.trim().toLowerCase();
    if (qq) list = list.filter((m) => `${m.home} ${m.away} ${m.group}`.toLowerCase().includes(qq));

    // Filter bleibt funktionsfähig, weil confidence wieder aus API kommt
    if (highOnly) list = list.filter((m) => m.nerd?.confidence?.label === "hoch");

    list.sort((a, b) => {
      if (sort === "home") return (b.pred?.p?.home ?? -1) - (a.pred?.p?.home ?? -1);
      if (sort === "away") return (b.pred?.p?.away ?? -1) - (a.pred?.p?.away ?? -1);
      if (sort === "conf") return (b.nerd?.confidence?.value ?? -1) - (a.nerd?.confidence?.value ?? -1);

      const ta = a.kickoffUtc ? new Date(a.kickoffUtc).getTime() : 9e15;
      const tb = b.kickoffUtc ? new Date(b.kickoffUtc).getTime() : 9e15;
      return ta - tb;
    });

    return list;
  }, [items, sort, highOnly, q]);

  return (
    <>
      <div className="sticky top-3 z-30">
        <div className="glass rounded-3xl p-5 md:p-6 shadow-xl shadow-black/30 backdrop-blur-xl">
          <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-6">
            <div className="flex-1">
              <div className="text-white/90 text-sm font-semibold">Controls</div>
              <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar py-1">
                <Pill active={sort === "time"} onClick={() => setSort("time")}>Zeit</Pill>
                <Pill active={sort === "home"} onClick={() => setSort("home")}>Heimsieg%</Pill>
                <Pill active={sort === "away"} onClick={() => setSort("away")}>Auswärtssieg%</Pill>
                <Pill active={sort === "conf"} onClick={() => setSort("conf")}>Confidence</Pill>
                <span className="mx-1 opacity-30">|</span>
                <Pill active={highOnly} onClick={() => setHighOnly(v => !v)}>
                  {highOnly ? "Nur hohe Sicherheit ✓" : "Nur hohe Sicherheit"}
                </Pill>
              </div>
            </div>

            <div className="w-full md:w-[340px]">
              <div className="text-white/90 text-sm font-semibold">Suche</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Team oder Spieltag…"
                className="mt-2 w-full rounded-2xl bg-black/40 border border-white/20 px-4 py-3 text-white outline-none focus:border-white/35"
              />
              <div className="mt-2 text-xs text-white/70">
                Treffer: <span className="text-white font-semibold">{shown.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-4" />

      <div className="mt-1 grid gap-4 md:grid-cols-2">
        {shown.map((m) => {
          const k = kickoffInfo(m.kickoffUtc);
          const predOk = m.pred?.ok;

          return (
            <div
              key={m.matchId}
              className={[
                "glass rounded-3xl p-5 shadow-xl shadow-black/30",
                m.correctness?.correct ? "ring-2 ring-emerald-400/40 bg-emerald-500/10" : "",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-black/45 border border-white/15 px-3 py-1 text-xs font-semibold text-white">
                  {m.group || "Bundesliga"}
                </span>

                <div className="rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {k.badge === "today" && (
                      <span className="rounded-full bg-emerald-400/15 text-emerald-200 px-2 py-0.5 text-[11px] font-semibold border border-emerald-400/30">
                        HEUTE
                      </span>
                    )}
                    {k.badge === "tomorrow" && (
                      <span className="rounded-full bg-sky-400/15 text-sky-200 px-2 py-0.5 text-[11px] font-semibold border border-sky-400/30">
                        MORGEN
                      </span>
                    )}
                    <span className="text-white text-sm font-semibold">{k.date}</span>
                  </div>
                  {k.time ? <div className="text-white/80 text-xs mt-0.5">{k.time}</div> : null}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {m.homeLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.homeLogo} alt={m.home} className="h-10 w-10 rounded-2xl bg-black/30 p-1 object-contain" />
                  ) : <div className="h-10 w-10 rounded-2xl bg-black/30" />}

                  <span className="max-w-[240px] whitespace-normal break-words rounded-2xl bg-black/55 border border-white/15 px-3 py-1 text-white font-extrabold leading-snug shadow-sm shadow-black/30">
                    {m.home}
                  </span>
                </div>

                <div className="text-white/40 font-semibold">vs</div>

                <div className="flex items-center gap-2 min-w-0 justify-end flex-1">
                  <span className="max-w-[240px] whitespace-normal break-words rounded-2xl bg-black/55 border border-white/15 px-3 py-1 text-white font-extrabold leading-snug shadow-sm shadow-black/30 text-right">
                    {m.away}
                  </span>

                  {m.awayLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.awayLogo} alt={m.away} className="h-10 w-10 rounded-2xl bg-black/30 p-1 object-contain" />
                  ) : <div className="h-10 w-10 rounded-2xl bg-black/30" />}
                </div>
              </div>

              {/* Endstand: immer anzeigen wenn finished */}
              {m.isFinished && m.score ? (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-black/45 border border-white/15 px-3 py-1 text-xs text-white/90">
                  <span className="font-semibold">Endstand</span>
                  <span className="opacity-90">{m.score}</span>
                  {m.correctness?.correct ? (
                    <span className="ml-1 rounded-full bg-emerald-400/15 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 text-[11px] font-semibold">
                      RICHTIG
                    </span>
                  ) : null}
                </div>
              ) : null}

              {!predOk ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-white/80 text-sm">
                  Prediction nicht verfügbar
                </div>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                      <div className="text-xs text-white/70">Heimsieg</div>
                      <div className="text-2xl font-extrabold text-white">{pct(m.pred.p.home)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                      <div className="text-xs text-white/70">Remis</div>
                      <div className="text-2xl font-extrabold text-white">{pct(m.pred.p.draw)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                      <div className="text-xs text-white/70">Auswärtssieg</div>
                      <div className="text-2xl font-extrabold text-white">{pct(m.pred.p.away)}</div>
                    </div>
                  </div>

                  {/* Confidence Anzeige wurde entfernt (wie du wolltest) */}

                  <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-white">
                      Details & Nerd-Stuff
                    </summary>

                    <div className="mt-3 text-sm text-white/80 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                          <div className="text-xs text-white/70">Over 2.5</div>
                          <div className="text-lg font-extrabold text-white">{m.nerd?.overUnder25?.overPct ?? 0}%</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                          <div className="text-xs text-white/70">BTTS (Ja)</div>
                          <div className="text-lg font-extrabold text-white">{m.nerd?.btts?.yesPct ?? 0}%</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-white/70 text-xs mb-2">Top Scorelines</div>
                        <div className="flex flex-wrap gap-2">
                          {(m.nerd?.topScores || []).map((s: any) => (
                            <span key={s.score} className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/85">
                              {s.score} • {s.pct}%
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="text-white/60 text-xs">
                        Statistische Einschätzung (Poisson). Keine Garantie.
                      </div>
                    </div>
                  </details>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

