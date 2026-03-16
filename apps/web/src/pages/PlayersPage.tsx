import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { PlayerCard } from "@fpl/contracts";
import { getPlayers, resolveAssetUrl } from "@/api/client";
import { formatCost, formatPercent } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Users, TrendingUp } from "lucide-react";

type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

const POSITIONS: Record<number, { label: string; short: string; color: string }> = {
  1: { label: "Goalkeeper", short: "GKP", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" },
  2: { label: "Defender", short: "DEF", color: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  3: { label: "Midfielder", short: "MID", color: "bg-green-500/15 text-green-400 border-green-500/25" },
  4: { label: "Forward", short: "FWD", color: "bg-primary/15 text-primary border-primary/25" },
};

function PlayerRow({ player }: { player: PlayerCard }) {
  const img = resolveAssetUrl(player.imagePath);
  const pos = POSITIONS[player.positionId];

  return (
    <Link to={`/players/${player.id}`}>
      <div className="group flex items-center gap-3 rounded-xl border border-white/6 bg-card/50 px-4 py-3 transition-all duration-200 hover:border-primary/25 hover:bg-card hover:shadow-[0_0_15px_rgba(233,0,82,0.08)] cursor-pointer">
        {/* Avatar */}
        <div className="shrink-0">
          {img ? (
            <img
              src={img}
              alt={player.webName}
              className="h-11 w-11 rounded-lg object-cover border border-white/10 bg-secondary"
            />
          ) : (
            <div className="h-11 w-11 rounded-lg bg-secondary flex items-center justify-center">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Name + team */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white text-sm truncate">{player.webName}</p>
            {pos && (
              <span
                className={`hidden sm:inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase ${pos.color}`}
              >
                {pos.short}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{player.teamName}</p>
        </div>

        {/* Stats grid */}
        <div className="hidden md:grid grid-cols-5 gap-4 text-right">
          {[
            { label: "Pts", value: player.totalPoints, accent: "text-accent" },
            { label: "Form", value: Number(player.form).toFixed(1), accent: "" },
            { label: "Price", value: formatCost(player.nowCost), accent: "" },
            { label: "Sel%", value: formatPercent(Number(player.selectedByPercent)), accent: "" },
            { label: "xGI", value: player.expectedGoalInvolvements.toFixed(1), accent: "text-primary" },
          ].map(({ label, value, accent }) => (
            <div key={label}>
              <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
              <p className={`text-sm font-semibold ${accent || "text-white"}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Mobile pts */}
        <div className="md:hidden text-right shrink-0">
          <p className="text-lg font-display font-bold text-accent">{player.totalPoints}</p>
          <p className="text-[10px] text-muted-foreground">pts</p>
        </div>

        <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <TrendingUp className="h-4 w-4 text-primary" />
        </div>
      </div>
    </Link>
  );
}

export function PlayersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<AsyncState<PlayerCard[]>>({ status: "loading" });
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "total_points");
  const [position, setPosition] = useState(searchParams.get("position") ?? "all");

  const fetchPlayers = useCallback(
    (q: string, s: string, pos: string) => {
      setState({ status: "loading" });
      getPlayers({
        search: q || undefined,
        sort: s,
        position: pos !== "all" ? pos : undefined,
      })
        .then((data) => setState({ status: "ready", data }))
        .catch((e) => setState({ status: "error", message: e.message }));
    },
    [],
  );

  useEffect(() => {
    fetchPlayers(search, sort, position);
  }, [search, sort, position, fetchPlayers]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (sort !== "total_points") p.set("sort", sort);
    if (position !== "all") p.set("position", position);
    setSearchParams(p, { replace: true });
  }, [search, sort, position, setSearchParams]);

  const players = state.status === "ready" ? state.data : [];

  return (
    <div className="space-y-5 p-6 lg:p-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Players
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse and filter all FPL players
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search players…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={position} onValueChange={setPosition}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Position" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            <SelectItem value="1">Goalkeeper</SelectItem>
            <SelectItem value="2">Defender</SelectItem>
            <SelectItem value="3">Midfielder</SelectItem>
            <SelectItem value="4">Forward</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="total_points">Total Points</SelectItem>
            <SelectItem value="form">Form</SelectItem>
            <SelectItem value="cost">Price</SelectItem>
            <SelectItem value="minutes">Minutes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Column headers */}
      <div className="hidden md:flex items-center gap-3 px-4 text-[10px] uppercase tracking-wider text-muted-foreground">
        <div className="w-11 shrink-0" />
        <div className="flex-1">Player</div>
        <div className="grid grid-cols-5 gap-4 text-right w-72">
          <span>Pts</span>
          <span>Form</span>
          <span>Price</span>
          <span>Sel%</span>
          <span>xGI</span>
        </div>
        <div className="w-4 shrink-0" />
      </div>

      {/* Player list */}
      {state.status === "loading" && (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <p className="text-xs text-muted-foreground">
            {players.length} player{players.length !== 1 ? "s" : ""}
            {search && ` matching "${search}"`}
          </p>
          <div className="space-y-1.5">
            {players.map((p) => (
              <PlayerRow key={p.id} player={p} />
            ))}
            {players.length === 0 && (
              <div className="py-16 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No players found</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
