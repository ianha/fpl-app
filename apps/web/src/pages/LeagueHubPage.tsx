import type { H2HLeagueStanding, MyLeague } from "@fpl/contracts";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { discoverMyLeagues, getLeagueStandings, getMyLeagues } from "@/api/client";
import { GlowCard } from "@/components/ui/glow-card";
import { Badge } from "@/components/ui/badge";

type StandingsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; standings: H2HLeagueStanding[]; league: MyLeague };

export function LeagueHubPage() {
  const [leagues, setLeagues] = useState<MyLeague[] | null>(null);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [standingsState, setStandingsState] = useState<StandingsState>({ status: "idle" });
  const navigate = useNavigate();

  useEffect(() => {
    getMyLeagues()
      .then((data) => {
        setLeagues(data);
      })
      .catch(() => {
        setLeagues([]);
      })
      .finally(() => {
        setLoadingLeagues(false);
      });
  }, []);

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const data = await discoverMyLeagues();
      setLeagues(data);
    } catch (error) {
      setDiscoverError(error instanceof Error ? error.message : String(error));
    } finally {
      setDiscovering(false);
    }
  }

  async function handleViewStandings(league: MyLeague) {
    setStandingsState({ status: "loading" });
    try {
      const standings = await getLeagueStandings(league.leagueId, league.leagueType);
      setStandingsState({ status: "ready", standings, league });
    } catch (error) {
      setStandingsState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const classicLeagues = leagues?.filter((l) => l.leagueType === "classic") ?? [];
  const h2hLeagues = leagues?.filter((l) => l.leagueType === "h2h") ?? [];

  return (
    <div className="space-y-6 p-6">
      <GlowCard className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Mini-League</h1>
            <p className="mt-1 text-sm text-white/60">
              Select a league and rival to compare your FPL season head-to-head.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleDiscover();
            }}
            disabled={discovering || loadingLeagues}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {discovering ? "Discovering…" : "Discover my leagues"}
          </button>
        </div>
      </GlowCard>

      {discoverError && (
        <GlowCard className="p-4">
          <p className="text-sm text-red-300">{discoverError}</p>
        </GlowCard>
      )}

      {loadingLeagues ? (
        <div className="p-2 text-sm text-white/60">Loading leagues…</div>
      ) : leagues && leagues.length === 0 ? (
        <GlowCard className="p-6">
          <p className="text-sm text-white/70">
            No leagues found. Click <strong className="text-white">Discover my leagues</strong> to
            load the leagues from your synced FPL account.
          </p>
          <p className="mt-2 text-xs text-white/45">
            Make sure you have synced your My Team account first.
          </p>
        </GlowCard>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {classicLeagues.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/55">
                Classic leagues
              </h2>
              <div className="space-y-2">
                {classicLeagues.map((league) => (
                  <LeagueRow
                    key={`${league.leagueId}-classic`}
                    league={league}
                    isSelected={
                      standingsState.status === "ready" &&
                      standingsState.league.leagueId === league.leagueId &&
                      standingsState.league.leagueType === league.leagueType
                    }
                    onView={handleViewStandings}
                  />
                ))}
              </div>
            </section>
          )}
          {h2hLeagues.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/55">
                H2H leagues
              </h2>
              <div className="space-y-2">
                {h2hLeagues.map((league) => (
                  <LeagueRow
                    key={`${league.leagueId}-h2h`}
                    league={league}
                    isSelected={
                      standingsState.status === "ready" &&
                      standingsState.league.leagueId === league.leagueId &&
                      standingsState.league.leagueType === league.leagueType
                    }
                    onView={handleViewStandings}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {standingsState.status === "loading" && (
        <div className="p-2 text-sm text-white/60">Loading standings…</div>
      )}

      {standingsState.status === "error" && (
        <GlowCard className="p-4">
          <p className="text-sm text-red-300">{standingsState.message}</p>
        </GlowCard>
      )}

      {standingsState.status === "ready" && (
        <GlowCard className="p-6">
          <h2 className="font-display text-xl font-semibold text-white">
            {standingsState.league.leagueName}
          </h2>
          <p className="mt-1 text-xs text-white/45">
            {standingsState.standings.length} manager{standingsState.standings.length !== 1 ? "s" : ""}
            {" · "}
            <Badge variant="outline" className="text-xs">
              {standingsState.league.leagueType === "h2h" ? "H2H" : "Classic"}
            </Badge>
          </p>
          <div className="mt-4 space-y-2">
            {standingsState.standings.map((entry) => (
              <button
                key={entry.entryId}
                type="button"
                onClick={() => {
                  navigate(
                    `/leagues/${standingsState.league.leagueId}/h2h/${entry.entryId}`,
                  );
                }}
                className="flex w-full items-center justify-between rounded-lg bg-white/5 px-4 py-3 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
              >
                <span className="font-medium text-white">{entry.teamName}</span>
                <span className="text-white/55">{entry.playerName}</span>
                <span className="text-accent font-semibold">#{entry.rank}</span>
                <span>{entry.totalPoints} pts</span>
              </button>
            ))}
          </div>
        </GlowCard>
      )}
    </div>
  );
}

function LeagueRow({
  league,
  isSelected,
  onView,
}: {
  league: MyLeague;
  isSelected: boolean;
  onView: (league: MyLeague) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onView(league)}
      className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm transition-colors ${
        isSelected ? "bg-accent/15 ring-1 ring-accent/40" : "bg-white/5 hover:bg-white/10"
      }`}
    >
      <span className="font-medium text-white">{league.leagueName}</span>
      <span className="text-xs text-white/45">
        {league.leagueType === "h2h" ? "H2H" : "Classic"}
      </span>
    </button>
  );
}
