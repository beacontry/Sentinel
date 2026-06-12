/**
 * One-off reconciliation script: walks every PENDING trader_trades row
 * older than 24h (across all users), looks each one up at the broker by
 * id, and reconciles fill_price / fill_time / pnl / status.
 *
 * Motivation: admin's 2026-06-09 consecutive_losses halt suppressed all
 * runScan-driven reconciles for ~50h, so when the engine restarted on
 * 06-11 the prior 24h cutoff in reconcilePendingTrades silently stranded
 * 3 PENDING rows (AAPL / DELL / ADI sells, all broker-filled). The
 * engine's reconcile window is now 7d and runs from runExitCheck too,
 * but rows from before that change must be cleaned manually.
 *
 * Usage:
 *   npx tsx scripts/reconcile-stuck-trades.ts                    # dry-run
 *   npx tsx scripts/reconcile-stuck-trades.ts --apply             # write
 *   npx tsx scripts/reconcile-stuck-trades.ts --user-id <uuid>    # one user
 *
 * Idempotent: a second --apply run finds nothing to reconcile (the rows
 * are already FILLED / CANCELED / etc.).
 *
 * Mirrors the same fill-price / P&L delta math as reconcilePendingTrades
 * in src/lib/trading-engine.ts. If you change the engine logic, change
 * here too — or refactor to extract a shared helper. (Kept inline so
 * the script can run without dragging the trading-engine module's
 * import surface, which loads many side-effecting modules at import.)
 */

import { db } from "@/lib/db";
import { traderTrades } from "@/lib/db/schema/trader";
import { brokerConnections } from "@/lib/db/schema/broker-connections";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { createBrokerClient, type BrokerOrder, type BrokerClient } from "@/lib/brokers";
import { decrypt } from "@/lib/crypto";

function parseArgs(): { apply: boolean; userId: string | null } {
  const args = process.argv.slice(2);
  let apply = false;
  let userId: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apply") apply = true;
    else if (args[i] === "--user-id" && args[i + 1]) {
      userId = args[i + 1];
      i++;
    }
  }
  return { apply, userId };
}

interface PendingRow {
  id: string;
  userId: string | null;
  symbol: string;
  action: string;
  signal: string;
  quantity: number;
  fillPrice: number | null;
  pnl: number | null;
  brokerOrderId: string | null;
  createdAt: Date;
}

interface ReconcileDecision {
  newStatus: string;
  newFillPrice: number | null;
  newFillTime: Date | null;
  newPnl: number | null;
}

/**
 * Mirror of the per-row decision branch inside reconcilePendingTrades.
 * Returns null when the broker still shows the order as in-flight (leave
 * as PENDING) or the status is one we don't recognize.
 */
function decideReconcile(row: PendingRow, brokerOrder: BrokerOrder): ReconcileDecision | null {
  const bs = brokerOrder.status;
  // Still in-flight at the broker → no decision
  if (["new", "accepted", "pending_new", "held", "accepted_for_bidding"].includes(bs)) {
    return null;
  }

  if (bs === "filled") {
    const newFillPrice = brokerOrder.filledPrice ?? row.fillPrice;
    const newFillTime = brokerOrder.filledAt ? new Date(brokerOrder.filledAt) : new Date();
    let newPnl: number | null = row.pnl;
    if (
      row.action === "SELL" &&
      row.pnl !== null &&
      row.fillPrice !== null &&
      newFillPrice !== null
    ) {
      // The PENDING row's P&L was computed against the price at exit-decision
      // time, which is typically off the actual fill by a few cents. Correct
      // via delta math so we don't need a schema change. BUYs have null P&L
      // so no correction needed.
      const delta = (newFillPrice - row.fillPrice) * row.quantity;
      newPnl = row.pnl + delta;
    }
    return { newStatus: "FILLED", newFillPrice, newFillTime, newPnl };
  }

  if (bs === "partially_filled") {
    const newFillPrice = brokerOrder.filledPrice ?? row.fillPrice;
    const newFillTime = brokerOrder.filledAt ? new Date(brokerOrder.filledAt) : new Date();
    let newPnl: number | null = row.pnl;
    if (row.action === "SELL" && row.pnl !== null && row.fillPrice !== null && newFillPrice !== null && row.quantity > 0) {
      const filledQty = brokerOrder.filledQty;
      const deltaPerShare = newFillPrice - row.fillPrice;
      const pnlPerShare = row.pnl / row.quantity;
      newPnl = (pnlPerShare + deltaPerShare) * filledQty;
    }
    return { newStatus: "PARTIAL_FILLED", newFillPrice, newFillTime, newPnl };
  }

  if (bs === "canceled") return { newStatus: "CANCELED", newFillPrice: null, newFillTime: null, newPnl: null };
  if (bs === "expired") return { newStatus: "EXPIRED", newFillPrice: null, newFillTime: null, newPnl: null };
  if (bs === "rejected") return { newStatus: "REJECTED", newFillPrice: null, newFillTime: null, newPnl: null };
  return null;
}

async function resolveBrokerClient(userId: string): Promise<BrokerClient | null> {
  const [conn] = await db
    .select()
    .from(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.isActive, true)))
    .limit(1);
  if (!conn) return null;
  let apiKey: string, apiSecret: string;
  try {
    apiKey = decrypt(conn.apiKey);
    apiSecret = decrypt(conn.apiSecret);
  } catch (err) {
    console.error(`  [skip] credential decrypt failed for user ${userId}:`, err instanceof Error ? err.message : err);
    return null;
  }
  return createBrokerClient(conn.broker, apiKey, apiSecret, conn.environment);
}

async function main() {
  const { apply, userId: filterUserId } = parseArgs();
  console.log(`Mode: ${apply ? "APPLY (writes will be persisted)" : "DRY-RUN (no writes)"}`);
  if (filterUserId) console.log(`Filtered to user: ${filterUserId}`);

  // PENDING rows older than 24h, with broker_order_id.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const filters = [
    eq(traderTrades.status, "PENDING"),
    isNotNull(traderTrades.brokerOrderId),
    lt(traderTrades.createdAt, cutoff),
  ];
  if (filterUserId) filters.push(eq(traderTrades.userId, filterUserId));

  const rows = await db
    .select({
      id: traderTrades.id,
      userId: traderTrades.userId,
      symbol: traderTrades.symbol,
      action: traderTrades.action,
      signal: traderTrades.signal,
      quantity: traderTrades.quantity,
      fillPrice: traderTrades.fillPrice,
      pnl: traderTrades.pnl,
      brokerOrderId: traderTrades.brokerOrderId,
      createdAt: traderTrades.createdAt,
    })
    .from(traderTrades)
    .where(and(...filters));

  console.log(`\nFound ${rows.length} stuck PENDING row(s) older than 24h with broker_order_id.`);
  if (rows.length === 0) {
    console.log("Nothing to reconcile. Done.");
    process.exit(0);
  }

  // Group by user so we resolve the broker client once per user.
  const byUser = new Map<string, PendingRow[]>();
  for (const r of rows) {
    if (!r.userId) continue;
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push(r);
  }

  let resolved = 0;
  let leftPending = 0;
  let purgedAtBroker = 0;
  let failedLookup = 0;

  for (const [uid, userRows] of byUser) {
    console.log(`\n=== user ${uid} (${userRows.length} row(s)) ===`);
    const client = await resolveBrokerClient(uid);
    if (!client) {
      console.log(`  [skip] no active broker connection`);
      continue;
    }
    if (!client.getOrder) {
      console.log(`  [skip] broker has no getOrder support — rerun after deploy`);
      continue;
    }

    for (const row of userRows) {
      if (!row.brokerOrderId) continue;
      const ageH = ((Date.now() - row.createdAt.getTime()) / 3_600_000).toFixed(1);
      let brokerOrder: BrokerOrder | null;
      try {
        brokerOrder = await client.getOrder(row.brokerOrderId);
      } catch (err) {
        console.log(`  [fail] ${row.symbol} ${row.action} qty=${row.quantity} (age ${ageH}h): lookup error ${err instanceof Error ? err.message : "unknown"}`);
        failedLookup++;
        continue;
      }
      if (!brokerOrder) {
        console.log(`  [purged] ${row.symbol} ${row.action} qty=${row.quantity} (age ${ageH}h): broker 404 — order not at broker`);
        purgedAtBroker++;
        continue;
      }

      const decision = decideReconcile(row, brokerOrder);
      if (!decision) {
        console.log(`  [pending] ${row.symbol} ${row.action} qty=${row.quantity} (age ${ageH}h): broker still shows status=${brokerOrder.status}`);
        leftPending++;
        continue;
      }

      const pnlStr = decision.newPnl == null ? "(null)" : `$${decision.newPnl.toFixed(2)}`;
      const priceStr = decision.newFillPrice == null ? "(null)" : `$${decision.newFillPrice.toFixed(4)}`;
      console.log(
        `  [${apply ? "APPLY" : "would"}] ${row.symbol} ${row.action} qty=${row.quantity} (age ${ageH}h): ` +
        `PENDING → ${decision.newStatus} | fill ${priceStr} | pnl ${pnlStr} | broker_id=${row.brokerOrderId}`
      );

      if (apply) {
        try {
          await db
            .update(traderTrades)
            .set({
              status: decision.newStatus,
              ...(decision.newFillPrice !== null ? { fillPrice: decision.newFillPrice } : {}),
              ...(decision.newFillTime ? { fillTime: decision.newFillTime } : {}),
              pnl: decision.newPnl,
            })
            .where(eq(traderTrades.id, row.id));
          resolved++;
        } catch (err) {
          console.log(`    [fail] DB update: ${err instanceof Error ? err.message : "unknown"}`);
        }
      } else {
        resolved++;
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Reconciled:        ${resolved}`);
  console.log(`  Left PENDING:      ${leftPending} (broker still working)`);
  console.log(`  Purged at broker:  ${purgedAtBroker}`);
  console.log(`  Lookup failed:     ${failedLookup}`);
  if (!apply && resolved > 0) {
    console.log(`\nDry-run only. Re-run with --apply to persist.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
