"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { Shield, ShieldCheck, ShieldAlert, RefreshCw, Filter } from "lucide-react";

interface AuditRow {
  id: number;
  createdAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  prevHash: string;
  hash: string;
}

interface VerifyResult {
  ok: true;
  intact: boolean;
  break?: { brokenAtId: number; reason: string; expected: string; stored: string };
}

// Radix Select rejects empty-string values (collision with "clear selection"),
// so use a sentinel "__all__" that the route treats as "no filter".
const ALL_ACTIONS = "__all__";
const ACTION_FILTER_OPTIONS = [
  { value: ALL_ACTIONS, label: "All actions" },
  { value: "engine.started", label: "engine.started" },
  { value: "engine.stopped", label: "engine.stopped" },
  { value: "engine.halted", label: "engine.halted" },
  { value: "engine.mode_switched", label: "engine.mode_switched" },
  { value: "engine.live_blocked", label: "engine.live_blocked" },
  { value: "order.placed", label: "order.placed" },
  { value: "order.rejected", label: "order.rejected" },
  { value: "broker.connection.created", label: "broker.connection.created" },
  { value: "broker.connection.updated", label: "broker.connection.updated" },
  { value: "broker.connection.deleted", label: "broker.connection.deleted" },
  { value: "risk_profile.updated", label: "risk_profile.updated" },
  { value: "auth.login_success", label: "auth.login_success" },
  { value: "auth.login_failed", label: "auth.login_failed" },
  { value: "auth.user_registered", label: "auth.user_registered" },
  { value: "invite.sent", label: "invite.sent" },
];

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function actionVariant(action: string): "bullish" | "bearish" | "warning" | "neutral" {
  if (action.includes("login_failed") || action.includes("rejected") || action === "engine.halted")
    return "bearish";
  if (action.includes("live") || action.includes("invite_sent")) return "warning";
  if (action.includes("login_success") || action.includes("registered")) return "bullish";
  return "neutral";
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState(ALL_ACTIONS);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [totalMatching, setTotalMatching] = useState(0);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (actionFilter && actionFilter !== ALL_ACTIONS) params.set("action", actionFilter);
      const res = await fetch(`/api/admin/audit?${params}`);
      if (res.status === 403) {
        setError("Admin access required");
        return;
      }
      if (!res.ok) {
        setError("Failed to load audit log");
        return;
      }
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotalMatching(data.pagination?.totalMatching ?? 0);
    } catch {
      setError("Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  async function runVerify() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/admin/audit/verify", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setVerifyResult({ ok: true, intact: false, break: { brokenAtId: 0, reason: data.error ?? "request_failed", expected: "", stored: "" } });
        return;
      }
      setVerifyResult(data);
    } catch {
      setVerifyResult({ ok: true, intact: false, break: { brokenAtId: 0, reason: "network_error", expected: "", stored: "" } });
    } finally {
      setVerifying(false);
    }
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        title="Audit Log"
        description="Append-only, hash-chained record of every privileged action. Tamper-evident — verify the chain to detect modification."
      />
      <SubNav tabs={SUB_NAV.admin} />

      {/* Chain integrity card */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            {verifyResult === null ? (
              <Shield className="w-5 h-5 text-text-muted" />
            ) : verifyResult.intact ? (
              <ShieldCheck className="w-5 h-5 text-bullish" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-bearish" />
            )}
            <div>
              <div className="text-sm font-semibold text-text-primary">Chain integrity</div>
              <div className="text-xs text-text-muted">
                {verifyResult === null
                  ? "Click verify to recompute every row's SHA-256 and check chain links."
                  : verifyResult.intact
                  ? "All rows match. No tampering detected."
                  : `Chain broken at row #${verifyResult.break?.brokenAtId ?? "?"} — reason: ${verifyResult.break?.reason ?? "unknown"}.`}
              </div>
            </div>
          </div>
          <Button onClick={runVerify} loading={verifying} variant="secondary" className="min-h-[44px]">
            <RefreshCw className="w-4 h-4" /> Verify chain
          </Button>
        </div>
        {verifyResult && !verifyResult.intact && verifyResult.break && verifyResult.break.brokenAtId > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-bearish/10 border border-bearish/30 text-xs font-mono space-y-1">
            <div>broken_at_id: {verifyResult.break.brokenAtId}</div>
            <div>reason: {verifyResult.break.reason}</div>
            {verifyResult.break.expected && <div>expected: {verifyResult.break.expected.slice(0, 64)}…</div>}
            {verifyResult.break.stored && <div>stored: {verifyResult.break.stored.slice(0, 64)}…</div>}
          </div>
        )}
      </Card>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Select
              label="Filter by action"
              options={ACTION_FILTER_OPTIONS}
              value={actionFilter}
              onChange={(v) => setActionFilter(v)}
            />
          </div>
          <Button onClick={loadRows} variant="secondary" className="min-h-[44px]">
            <Filter className="w-4 h-4" /> Apply
          </Button>
          <div className="text-xs text-text-muted">
            Showing {rows.length} of {totalMatching} matching rows
          </div>
        </div>
      </Card>

      {/* Rows */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-6 text-center text-sm text-bearish">{error}</Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Shield className="w-8 h-8" />}
          title="No audit entries match"
          description="Try a different action filter, or perform an action elsewhere in the app to populate the log."
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-3 font-medium">ID</th>
                  <th className="p-3 font-medium">Time</th>
                  <th className="p-3 font-medium">Actor</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">Resource</th>
                  <th className="p-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => toggleExpand(r.id)}
                      className="border-b border-border/50 hover:bg-bg-hover cursor-pointer"
                    >
                      <td className="p-3 text-text-muted">#{r.id}</td>
                      <td className="p-3 whitespace-nowrap">{formatTimestamp(r.createdAt)}</td>
                      <td className="p-3">
                        <div className="text-text-primary">{r.actorEmail ?? "—"}</div>
                        {r.actorRole && (
                          <div className="text-[10px] text-text-muted uppercase tracking-wide">{r.actorRole}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant={actionVariant(r.action)}>{r.action}</Badge>
                      </td>
                      <td className="p-3 text-text-secondary">
                        {r.resourceType ? (
                          <>
                            {r.resourceType}
                            {r.resourceId && (
                              <span className="text-text-muted"> · {r.resourceId.slice(0, 8)}</span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3 text-text-muted">{r.ip ?? "—"}</td>
                    </tr>
                    {expanded.has(r.id) && (
                      <tr className="bg-bg-secondary border-b border-border/50">
                        <td colSpan={6} className="p-4 space-y-2">
                          {r.metadata && (
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Metadata</div>
                              <pre className="text-xs bg-bg-primary border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                                {JSON.stringify(r.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-text-muted">Hash</div>
                              <div className="break-all text-text-secondary">{r.hash}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-text-muted">Prev hash</div>
                              <div className="break-all text-text-muted">{r.prevHash}</div>
                            </div>
                            {r.userAgent && (
                              <div className="md:col-span-2">
                                <div className="text-[10px] uppercase tracking-wide text-text-muted">User agent</div>
                                <div className="break-all text-text-muted">{r.userAgent}</div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
