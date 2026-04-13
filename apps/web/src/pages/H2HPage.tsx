import type { H2HComparisonResponse } from "@fpl/contracts";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getH2HComparison, syncH2HRival } from "@/api/client";
import { GlowCard } from "@/components/ui/glow-card";
import { Badge } from "@/components/ui/badge";
import {
  describeBenchDelta,
  formatExpectedEdge,
  formatGapShare,
  formatOverlapLabel,
  formatPlayerTag,
  formatSignedNumber,
  formatSignedPoints,
  formatVarianceEdge,
  getLuckVerdictDescription,
  getLuckVerdictLabel,
  getTrendLabel,
} from "./h2hPageUtils";

type AsyncState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: H2HComparisonResponse };

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group ml-1.5 inline-flex align-middle">
      <svg className="h-3.5 w-3.5 cursor-help text-white/35" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-xs leading-relaxed text-white/80 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

const _h2hCache = new Map<string, H2HComparisonResponse>();

export function resetH2HPageCacheForTests() {
  _h2hCache.clear();
}

export function H2HPage() {
  const { leagueId, rivalEntryId } = useParams<{ leagueId?: string; rivalEntryId?: string }>();
  const [state, setState] = useState<AsyncState>({ status: "loading" });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!leagueId || !rivalEntryId) {
      setState({
        status: "ready",
        payload: {
          syncRequired: true,
          rivalEntry: null,
          squadOverlap: null,
          gmRankHistory: [],
          attribution: null,
          positionalAudit: null,
          luckVsSkill: null,
          syncStatus: {
            currentGameweek: null,
            lastSyncedGw: null,
            stale: false,
            fetchedAt: null,
          },
        },
      });
      return;
    }

    const cacheKey = `${leagueId}:${rivalEntryId}`;
    const cached = _h2hCache.get(cacheKey);
    if (cached) {
      setState({ status: "ready", payload: cached });
      return;
    }

    let active = true;
    setState({ status: "loading" });

    getH2HComparison(Number(leagueId), Number(rivalEntryId))
      .then((payload) => {
        if (!active) return;
        _h2hCache.set(cacheKey, payload);
        setState({ status: "ready", payload });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      active = false;
    };
  }, [leagueId, rivalEntryId, refreshNonce]);

  async function handleSync() {
    if (!leagueId || !rivalEntryId) {
      return;
    }

    setSyncing(true);
    try {
      await syncH2HRival(Number(leagueId), Number(rivalEntryId), {});
      _h2hCache.delete(`${leagueId}:${rivalEntryId}`);
      setRefreshNonce((value) => value + 1);
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSyncing(false);
    }
  }

  if (state.status === "loading") {
    return <div className="p-6 text-white/80">Loading mini-league comparison…</div>;
  }

  if (state.status === "error") {
    return <div className="p-6 text-red-300">{state.message}</div>;
  }

  if (!leagueId || !rivalEntryId) {
    return (
      <div className="p-6">
        <GlowCard className="p-6">
          <h1 className="font-display text-2xl font-bold text-white">Mini-League</h1>
          <p className="mt-3 text-sm text-white/70">
            Select a league and rival from the{" "}
            <Link to="/leagues" className="text-accent underline-offset-4 hover:underline">
              Mini-League hub
            </Link>{" "}
            to view comparison insights.
          </p>
        </GlowCard>
      </div>
    );
  }

  if (!state.payload.rivalEntry && state.payload.syncRequired) {
    return (
      <div className="p-6">
        <GlowCard className="p-6">
          <h1 className="font-display text-2xl font-bold text-white">Rival not yet synced</h1>
          <p className="mt-3 text-sm text-white/70">
            This rival's data hasn't been loaded yet. Sync them to see comparison insights.
          </p>
          <button
            type="button"
            onClick={() => {
              void handleSync();
            }}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync rival now"}
          </button>
        </GlowCard>
      </div>
    );
  }

  if (state.payload.syncRequired || !state.payload.squadOverlap) {
    return (
      <div className="p-6">
        <GlowCard className="p-6">
          <h1 className="font-display text-2xl font-bold text-white">{state.payload.rivalEntry.teamName}</h1>
          <p className="mt-3 text-sm text-white/70">
            Sync this rival to load comparison insights.
          </p>
          <p className="mt-2 text-xs text-white/45">
            Rival: {state.payload.rivalEntry.playerName}
          </p>
          <button
            type="button"
            onClick={() => {
              void handleSync();
            }}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync rival now"}
          </button>
        </GlowCard>
      </div>
    );
  }

  const { rivalEntry, squadOverlap, gmRankHistory } = state.payload;
  const attribution = state.payload.attribution;
  const positionalAudit = state.payload.positionalAudit;
  const luckVsSkill = state.payload.luckVsSkill;
  const syncStatus = state.payload.syncStatus;

  return (
    <div className="space-y-6 p-6">
      <GlowCard className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">{rivalEntry.teamName}</h1>
            <p className="mt-1 text-sm text-white/65">
              {rivalEntry.playerName} · Rank #{rivalEntry.rank} · {rivalEntry.totalPoints} pts
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { void handleSync(); }}
              disabled={syncing}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Re-sync"}
            </button>
            <Link to="/leagues" className="text-sm text-accent underline-offset-4 hover:underline">
              Mini-League hub
            </Link>
          </div>
        </div>
      </GlowCard>

      {syncStatus.stale ? (
        <GlowCard className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">
                Last synced through GW {syncStatus.lastSyncedGw}
              </p>
              <p className="text-sm text-white/60">
                Current GW is {syncStatus.currentGameweek}. Re-sync to refresh the latest H2H snapshot.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleSync();
              }}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "Re-sync rival"}
            </button>
          </div>
        </GlowCard>
      ) : null}

      <GlowCard className="p-6">
        <h2 className="font-display text-xl font-semibold text-white">Squad overlap</h2>
        <p className="mt-2 text-lg font-semibold text-accent">{formatOverlapLabel(squadOverlap.overlapPct)}</p>
        <p className="mt-1 text-sm text-white/55">GW {squadOverlap.gameweek}</p>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Shared players</h3>
            <ul className="mt-2 space-y-2 text-sm text-white/80">
              {squadOverlap.sharedPlayers.map((player) => (
                <li key={`shared-${player.id}`}>{formatPlayerTag(player)}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Your differentials</h3>
            <ul className="mt-2 space-y-2 text-sm text-white/80">
              {squadOverlap.userOnlyPlayers.map((player) => (
                <li key={`user-${player.id}`}>{formatPlayerTag(player)}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Rival differentials</h3>
            <ul className="mt-2 space-y-2 text-sm text-white/80">
              {squadOverlap.rivalOnlyPlayers.map((player) => (
                <li key={`rival-${player.id}`}>{formatPlayerTag(player)}</li>
              ))}
            </ul>
          </section>
        </div>
      </GlowCard>

      <GlowCard className="p-6">
        <h2 className="font-display text-xl font-semibold text-white">Manager history</h2>
        <div className="mt-4 space-y-2">
          {gmRankHistory.map((row) => (
            <div key={row.gameweek} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3 text-sm text-white/80">
              <span>GW {row.gameweek}</span>
              <span>You #{row.userOverallRank.toLocaleString()}</span>
              <span>Rival #{row.rivalOverallRank.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </GlowCard>

      {attribution ? (
        <GlowCard className="p-6">
          <h2 className="font-display text-xl font-semibold text-white">Points attribution</h2>
          <p className="mt-2 text-sm text-white/60">
            Overall gap: {formatSignedPoints(attribution.totalPointDelta)}
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl bg-white/5 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Captaincy swing</h3>
              <p className="mt-2 text-lg font-semibold text-accent">
                {formatSignedPoints(attribution.captaincy.delta)} · {formatGapShare(attribution.captaincy.shareOfGap)}
              </p>
              <p className="mt-2 text-sm text-white/70">
                You: {attribution.captaincy.userPoints} · Rival: {attribution.captaincy.rivalPoints}
              </p>
            </section>

            <section className="rounded-xl bg-white/5 p-4">
              <h3 className="flex items-center text-sm font-semibold uppercase tracking-wide text-white/55">
                Transfer net impact
                <InfoTooltip text={`For each GW where a transfer was made: (your GW score) − (GW average) − (hit cost). Positive means transfers added value above the baseline; negative means churning hurt you.\n\n"You" = your linked FPL team. Rival = ${rivalEntry?.teamName ?? "your rival"}.`} />
              </h3>
              <p className="mt-2 text-lg font-semibold text-accent">{formatSignedPoints(attribution.transfers.delta)}</p>
              <p className="mt-2 text-sm text-white/70">
                You: {formatSignedNumber(attribution.transfers.userNetImpact)} · {rivalEntry?.teamName ?? "Rival"}: {formatSignedNumber(attribution.transfers.rivalNetImpact)}
              </p>
              <p className="mt-1 text-xs text-white/45">
                Hits paid: You {attribution.transfers.userHitCost} · {rivalEntry?.teamName ?? "Rival"} {attribution.transfers.rivalHitCost}
              </p>
            </section>

            <section className="rounded-xl bg-white/5 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Bench points stranded</h3>
              <p className="mt-2 text-lg font-semibold text-accent">{describeBenchDelta(attribution.bench.delta)}</p>
              <p className="mt-2 text-sm text-white/70">
                You: {attribution.bench.userPointsOnBench} · Rival: {attribution.bench.rivalPointsOnBench}
              </p>
            </section>
          </div>
        </GlowCard>
      ) : null}

      {positionalAudit ? (
        <GlowCard className="p-6">
          <h2 className="font-display text-xl font-semibold text-white">Positional audit</h2>
          <div className="mt-4 space-y-3">
            {positionalAudit.rows.map((row) => (
              <div key={row.positionName} className="rounded-xl bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">{row.positionName}</h3>
                    <p className="mt-1 text-sm text-white/70">
                      You {row.userPoints} pts vs Rival {row.rivalPoints} pts
                    </p>
                  </div>
                  <Badge variant={row.trend === "trail" ? "under-index" : row.trend === "lead" ? "teal" : "outline"}>
                    {getTrendLabel(row.trend)}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 text-sm text-white/70 md:grid-cols-3">
                  <p>Point delta: {formatSignedPoints(row.pointDelta)}</p>
                  <p>Spend: £{row.userSpend.toFixed(1)}m vs £{row.rivalSpend.toFixed(1)}m</p>
                  <p>Value per million: {row.userValuePerMillion.toFixed(2)} vs {row.rivalValuePerMillion.toFixed(2)}</p>
                </div>
              </div>
            ))}
            {attribution ? (() => {
              const positionalDelta = positionalAudit.rows.reduce((sum, row) => sum + row.pointDelta, 0);
              const userHits = attribution.transfers.userHitCost;
              const rivalHits = attribution.transfers.rivalHitCost;
              const hitAdjustment = rivalHits - userHits;
              const netTotal = positionalDelta + hitAdjustment;
              return (
                <div className="mt-1 border-t border-white/10 pt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-white/50">
                    <span>Positional subtotal (incl. captain bonus)</span>
                    <span>{formatSignedPoints(positionalDelta)}</span>
                  </div>
                  {hitAdjustment !== 0 && (
                    <div className="flex justify-between text-white/50">
                      <span>Transfer hits (You −{userHits} · Rival −{rivalHits})</span>
                      <span>{formatSignedPoints(hitAdjustment)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-white pt-1 border-t border-white/10">
                    <span>Net total</span>
                    <span>{formatSignedPoints(netTotal)}</span>
                  </div>
                </div>
              );
            })() : null}
          </div>
        </GlowCard>
      ) : null}

      {luckVsSkill ? (
        <GlowCard className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-white">Luck vs skill</h2>
              <p className="mt-1 text-sm text-white/60">Based on GW {luckVsSkill.basedOnGameweek} xPts</p>
            </div>
            <Badge
              variant={
                luckVsSkill.verdict === "rival_running_hot"
                  ? "lucky-lead"
                  : luckVsSkill.verdict === "user_running_hot"
                    ? "teal"
                    : luckVsSkill.verdict === "insufficient_data"
                      ? "outline"
                      : "secondary"
              }
            >
              {getLuckVerdictLabel(luckVsSkill.verdict)}
            </Badge>
          </div>

          <p className="mt-3 text-sm text-white/70">
            {getLuckVerdictDescription(luckVsSkill.verdict)}
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <section className="rounded-xl bg-white/5 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Expected edge</h3>
              <p className="mt-2 text-lg font-semibold text-accent">{formatExpectedEdge(luckVsSkill.expectedDelta)}</p>
              <p className="mt-2 text-sm text-white/70">
                You: {luckVsSkill.userExpectedPoints?.toFixed(1) ?? "—"} · Rival: {luckVsSkill.rivalExpectedPoints?.toFixed(1) ?? "—"}
              </p>
            </section>
            <section className="rounded-xl bg-white/5 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Variance edge</h3>
              <p className="mt-2 text-lg font-semibold text-accent">{formatVarianceEdge(luckVsSkill.varianceEdge)}</p>
              <p className="mt-2 text-sm text-white/70">
                Actual gap: {formatSignedPoints(luckVsSkill.actualDelta)}
              </p>
            </section>
          </div>
        </GlowCard>
      ) : null}
    </div>
  );
}
