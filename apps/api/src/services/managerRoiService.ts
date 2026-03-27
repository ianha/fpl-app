import type { AppDatabase } from "../db/database.js";

export type ManagerRoiTransferOutcome = {
  transferId: string;
  gameweekId: number | null;
  transferredAt: string;
  playerInId: number;
  playerOutId: number;
  playerInFuturePoints: number;
  playerOutFuturePoints: number;
  eventTransfersCost: number;
  netPointsGain: number;
  wasHit: boolean;
  wasSuccessful: boolean;
};

export type ManagerRoiProfile = {
  accountId: number;
  sampleSize: number;
  sampleThreshold: number;
  usedGlobalBaseline: boolean;
  posteriorWeight: number;
  averageNetPointsGain: number;
  hitRoi: number;
  successRate: number;
  recommendedRiskPosture: "safe" | "balanced" | "upside";
  globalBaseline: {
    averageNetPointsGain: number;
    hitRoi: number;
    successRate: number;
  };
  outcomes: ManagerRoiTransferOutcome[];
};

type TransferOutcomeRow = {
  transferId: string;
  gameweekId: number | null;
  transferredAt: string;
  playerInId: number;
  playerOutId: number;
  eventTransfersCost: number;
  playerInFuturePoints: number;
  playerOutFuturePoints: number;
};

type AggregateMetrics = {
  averageNetPointsGain: number;
  hitRoi: number;
  successRate: number;
};

const DEFAULT_SAMPLE_THRESHOLD = 15;
const DEFAULT_FUTURE_WINDOW = 3;

export class ManagerRoiService {
  constructor(private readonly db: AppDatabase) {}

  evaluateManagerRoi(input: {
    accountId: number;
    fromGameweek?: number;
    toGameweek?: number;
    futureWindow?: number;
    sampleThreshold?: number;
  }): ManagerRoiProfile {
    const accountId = input.accountId;
    const futureWindow = input.futureWindow ?? DEFAULT_FUTURE_WINDOW;
    const sampleThreshold = input.sampleThreshold ?? DEFAULT_SAMPLE_THRESHOLD;

    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error("accountId must be a positive integer.");
    }

    if (!Number.isInteger(futureWindow) || futureWindow <= 0) {
      throw new Error("futureWindow must be a positive integer.");
    }

    if (!Number.isInteger(sampleThreshold) || sampleThreshold <= 0) {
      throw new Error("sampleThreshold must be a positive integer.");
    }

    const outcomes = this.getTransferOutcomes({
      accountId,
      fromGameweek: input.fromGameweek,
      toGameweek: input.toGameweek,
      futureWindow,
    });
    const globalOutcomes = this.getTransferOutcomes({
      futureWindow,
    });

    const managerMetrics = this.computeMetrics(outcomes);
    const globalMetrics =
      globalOutcomes.length > 0
        ? this.computeMetrics(globalOutcomes)
        : managerMetrics;

    const sampleSize = outcomes.length;
    const fullyPersonalized = sampleSize >= sampleThreshold;
    const personalizedWeight = fullyPersonalized
      ? 1
      : sampleSize / sampleThreshold;

    const averageNetPointsGain = this.mixMetric(
      managerMetrics.averageNetPointsGain,
      globalMetrics.averageNetPointsGain,
      personalizedWeight,
    );
    const hitRoi = this.mixMetric(
      managerMetrics.hitRoi,
      globalMetrics.hitRoi,
      personalizedWeight,
    );
    const successRate = this.mixMetric(
      managerMetrics.successRate,
      globalMetrics.successRate,
      personalizedWeight,
    );

    return {
      accountId,
      sampleSize,
      sampleThreshold,
      usedGlobalBaseline: !fullyPersonalized,
      posteriorWeight: Number(personalizedWeight.toFixed(4)),
      averageNetPointsGain: Number(averageNetPointsGain.toFixed(4)),
      hitRoi: Number(hitRoi.toFixed(4)),
      successRate: Number(successRate.toFixed(4)),
      recommendedRiskPosture: this.deriveRiskPosture({
        hitRoi,
        successRate,
        averageNetPointsGain,
      }),
      globalBaseline: {
        averageNetPointsGain: Number(globalMetrics.averageNetPointsGain.toFixed(4)),
        hitRoi: Number(globalMetrics.hitRoi.toFixed(4)),
        successRate: Number(globalMetrics.successRate.toFixed(4)),
      },
      outcomes,
    };
  }

  private getTransferOutcomes(input: {
    accountId?: number;
    fromGameweek?: number;
    toGameweek?: number;
    futureWindow: number;
  }): ManagerRoiTransferOutcome[] {
    const filters = ["t.gameweek_id IS NOT NULL"];
    const params: Record<string, number> = {
      futureWindow: input.futureWindow,
    };

    if (input.accountId !== undefined) {
      filters.push("t.account_id = @accountId");
      params.accountId = input.accountId;
    }

    if (input.fromGameweek !== undefined) {
      filters.push("t.gameweek_id >= @fromGameweek");
      params.fromGameweek = input.fromGameweek;
    }

    if (input.toGameweek !== undefined) {
      filters.push("t.gameweek_id <= @toGameweek");
      params.toGameweek = input.toGameweek;
    }

    const where = `WHERE ${filters.join(" AND ")}`;

    const rows = this.db
      .prepare(
        `SELECT
           t.transfer_id AS transferId,
           t.gameweek_id AS gameweekId,
           t.transferred_at AS transferredAt,
           t.player_in_id AS playerInId,
           t.player_out_id AS playerOutId,
           COALESCE(mtg.event_transfers_cost, 0) AS eventTransfersCost,
           COALESCE((
             SELECT SUM(ph.total_points)
             FROM player_history ph
             WHERE ph.player_id = t.player_in_id
               AND ph.round > t.gameweek_id
               AND ph.round <= (t.gameweek_id + @futureWindow)
           ), 0) AS playerInFuturePoints,
           COALESCE((
             SELECT SUM(ph.total_points)
             FROM player_history ph
             WHERE ph.player_id = t.player_out_id
               AND ph.round > t.gameweek_id
               AND ph.round <= (t.gameweek_id + @futureWindow)
           ), 0) AS playerOutFuturePoints
         FROM my_team_transfers t
         LEFT JOIN my_team_gameweeks mtg
           ON mtg.account_id = t.account_id
          AND mtg.gameweek_id = t.gameweek_id
         ${where}
         ORDER BY t.account_id, t.gameweek_id, t.transferred_at`,
      )
      .all(params) as TransferOutcomeRow[];

    return rows.map((row) => {
      const netPointsGain =
        row.playerInFuturePoints - row.playerOutFuturePoints - row.eventTransfersCost;

      return {
        transferId: row.transferId,
        gameweekId: row.gameweekId,
        transferredAt: row.transferredAt,
        playerInId: row.playerInId,
        playerOutId: row.playerOutId,
        playerInFuturePoints: row.playerInFuturePoints,
        playerOutFuturePoints: row.playerOutFuturePoints,
        eventTransfersCost: row.eventTransfersCost,
        netPointsGain,
        wasHit: row.eventTransfersCost > 0,
        wasSuccessful: netPointsGain > 0,
      };
    });
  }

  private computeMetrics(outcomes: ManagerRoiTransferOutcome[]): AggregateMetrics {
    if (outcomes.length === 0) {
      return {
        averageNetPointsGain: 0,
        hitRoi: 0,
        successRate: 0,
      };
    }

    const totalNetPoints = outcomes.reduce(
      (sum, outcome) => sum + outcome.netPointsGain,
      0,
    );
    const hitOutcomes = outcomes.filter((outcome) => outcome.wasHit);
    const hitRoi =
      hitOutcomes.length === 0
        ? 0
        : hitOutcomes.reduce((sum, outcome) => sum + outcome.netPointsGain, 0) /
          hitOutcomes.length;
    const successRate =
      outcomes.filter((outcome) => outcome.wasSuccessful).length / outcomes.length;

    return {
      averageNetPointsGain: totalNetPoints / outcomes.length,
      hitRoi,
      successRate,
    };
  }

  private mixMetric(
    personalizedValue: number,
    globalValue: number,
    personalizedWeight: number,
  ) {
    return (
      personalizedValue * personalizedWeight +
      globalValue * (1 - personalizedWeight)
    );
  }

  private deriveRiskPosture(input: {
    hitRoi: number;
    successRate: number;
    averageNetPointsGain: number;
  }): "safe" | "balanced" | "upside" {
    if (input.hitRoi >= 1 && input.successRate >= 0.6) {
      return "upside";
    }

    if (input.hitRoi <= -1 || input.successRate <= 0.45 || input.averageNetPointsGain < 0) {
      return "safe";
    }

    return "balanced";
  }
}
