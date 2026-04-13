import type { H2HPlayerRef, H2HPositionTrend } from "@fpl/contracts";

export function formatOverlapLabel(overlapPct: number) {
  return `${overlapPct.toFixed(1)}% overlap`;
}

export function formatPlayerTag(player: H2HPlayerRef) {
  return `${player.webName} · ${player.positionName} · ${player.teamShortName}`;
}

export function formatSignedPoints(value: number) {
  return `${value > 0 ? "+" : ""}${value} pts`;
}

export function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

export function formatGapShare(value: number | null) {
  if (value === null) {
    return "No overall gap";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}% of gap`;
}

export function describeBenchDelta(delta: number) {
  if (delta === 0) {
    return "You matched your rival on unused bench points";
  }
  if (delta < 0) {
    return `You left ${Math.abs(delta)} more pts on the bench`;
  }
  return `Your rival left ${delta} more pts on the bench`;
}

export function getTrendLabel(trend: H2HPositionTrend) {
  switch (trend) {
    case "lead":
      return "Lead";
    case "trail":
      return "Trail";
    default:
      return "Level";
  }
}
