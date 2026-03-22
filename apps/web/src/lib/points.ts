import type { PlayerHistoryPoint } from "@fpl/contracts";

export type PointBreakdownItem = {
  label: string;
  stat: number | string;
  points: number;
};

const GOAL_POINTS: Record<number, number> = { 1: 6, 2: 6, 3: 5, 4: 4 };
const CLEAN_SHEET_POINTS: Record<number, number> = { 1: 4, 2: 4, 3: 1, 4: 0 };

export function computePointBreakdown(
  h: PlayerHistoryPoint,
  positionId: number,
): PointBreakdownItem[] {
  const items: PointBreakdownItem[] = [];

  // Appearance
  if (h.minutes >= 60) {
    items.push({ label: "Minutes played", stat: h.minutes, points: 2 });
  } else if (h.minutes > 0) {
    items.push({ label: "Minutes played", stat: h.minutes, points: 1 });
  }

  // Goals scored
  if (h.goalsScored > 0) {
    const pts = h.goalsScored * (GOAL_POINTS[positionId] ?? 4);
    items.push({ label: "Goals scored", stat: h.goalsScored, points: pts });
  }

  // Assists
  if (h.assists > 0) {
    items.push({ label: "Assists", stat: h.assists, points: h.assists * 3 });
  }

  // Clean sheets
  if (h.cleanSheets > 0) {
    const pts = h.cleanSheets * (CLEAN_SHEET_POINTS[positionId] ?? 0);
    if (pts > 0) {
      items.push({ label: "Clean sheet", stat: h.cleanSheets, points: pts });
    }
  }

  // Saves (GKP only — 1pt per 3 saves)
  if (h.saves > 0) {
    const pts = Math.floor(h.saves / 3);
    if (pts > 0) {
      items.push({ label: "Saves", stat: h.saves, points: pts });
    }
  }

  // Penalties saved
  if (h.penaltiesSaved > 0) {
    items.push({ label: "Penalties saved", stat: h.penaltiesSaved, points: h.penaltiesSaved * 5 });
  }

  // Penalties missed
  if (h.penaltiesMissed > 0) {
    items.push({ label: "Penalties missed", stat: h.penaltiesMissed, points: h.penaltiesMissed * -2 });
  }

  // Own goals
  if (h.ownGoals > 0) {
    items.push({ label: "Own goals", stat: h.ownGoals, points: h.ownGoals * -2 });
  }

  // Yellow cards
  if (h.yellowCards > 0) {
    items.push({ label: "Yellow cards", stat: h.yellowCards, points: h.yellowCards * -1 });
  }

  // Red cards
  if (h.redCards > 0) {
    items.push({ label: "Red cards", stat: h.redCards, points: h.redCards * -3 });
  }

  // Goals conceded (GKP/DEF only — -1 per 2 conceded)
  if (h.goalsConceded > 0 && (positionId === 1 || positionId === 2)) {
    const pts = -Math.floor(h.goalsConceded / 2);
    if (pts !== 0) {
      items.push({ label: "Goals conceded", stat: h.goalsConceded, points: pts });
    }
  }

  // Defensive contributions (DEF: 10+, MID/FWD: 12+ → +2 pts; GKP not eligible)
  if (positionId !== 1) {
    const threshold = positionId === 2 ? 10 : 12;
    if (h.defensiveContribution >= threshold) {
      items.push({ label: "Defensive contributions", stat: h.defensiveContribution, points: 2 });
    }
  }

  // Bonus
  if (h.bonus > 0) {
    items.push({ label: "Bonus", stat: h.bonus, points: h.bonus });
  }

  return items;
}
