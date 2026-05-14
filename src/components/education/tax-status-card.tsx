"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Modal, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Pencil, Scale, Info } from "lucide-react";
import Link from "next/link";

interface TaxStatus {
  hasTraderTaxStatus: boolean;
  mtmElectionYear: number | null;
  mtmDeclaredAt: string | null;
  notes: string | null;
}

const EMPTY: TaxStatus = {
  hasTraderTaxStatus: false,
  mtmElectionYear: null,
  mtmDeclaredAt: null,
  notes: null,
};

/**
 * Self-attested Trader Tax Status / §475(f) MTM declaration.
 *
 * Visible on the Tax Center. Pure user-asserted state — no IRS validation.
 * Used to:
 *   - Display a TTS / MTM badge
 *   - Adjust messaging in the personalized education footer
 *   - Future: suppress wash-sale warnings for MTM-elected users
 *
 * Includes a strong disclaimer that the field is informational only and
 * directs users to the dedicated guide.
 */
export function TaxStatusCard() {
  const [status, setStatus] = useState<TaxStatus>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit-form state
  const [hasTTS, setHasTTS] = useState(false);
  const [mtmYear, setMtmYear] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/tax-status", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as TaxStatus;
        setStatus(data);
        setHasTTS(data.hasTraderTaxStatus);
        setMtmYear(data.mtmElectionYear ? String(data.mtmElectionYear) : "");
        setNotes(data.notes ?? "");
      } catch {
        // Silent — keeps default
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const yearVal = mtmYear.trim() === "" ? null : Number(mtmYear);
      const res = await fetch("/api/tax-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hasTraderTaxStatus: hasTTS,
          mtmElectionYear: yearVal,
          notes: notes.trim() === "" ? null : notes.trim(),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as TaxStatus;
        setStatus(data);
        setEditing(false);
      }
    } catch {
      // Ignore — modal stays open
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const hasMtm = status.mtmElectionYear !== null;

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Scale className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="text-sm font-semibold text-text-primary">
              Tax Status
            </span>
            {status.hasTraderTaxStatus && (
              <Badge variant="accent">Trader Tax Status</Badge>
            )}
            {hasMtm && (
              <Badge variant="bullish">
                §475(f) MTM • {status.mtmElectionYear}
              </Badge>
            )}
            {!status.hasTraderTaxStatus && !hasMtm && (
              <span className="text-xs text-text-muted">Not declared</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            {status.hasTraderTaxStatus || hasMtm ? "Edit" : "Declare"}
          </button>
        </div>
        <p className="mt-3 text-xs text-text-muted leading-relaxed flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Self-attested. Beacontry does not file or validate election with the
          IRS — record-keeping only.{" "}
          <Link
            href="/dashboard/education/guides/trader-tax-status-and-mtm-election"
            className="text-accent hover:underline"
          >
            Read the guide
          </Link>
          .
        </p>
      </Card>

      <Modal open={editing} onClose={() => setEditing(false)}>
          <ModalHeader>
            <ModalTitle>Trader Tax Status & MTM Election</ModalTitle>
          </ModalHeader>

          <div className="space-y-5 px-1">
            <div className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-xs leading-relaxed text-text-secondary">
              <strong className="text-text-primary">Self-attestation only.</strong>{" "}
              Beacontry records what you tell it but does not file Form 3115,
              attach the §475(f) election statement to your return, or validate
              your qualification for Trader Tax Status. Always work with a CPA
              familiar with trader tax issues (e.g., GreenTraderTax) before
              electing — the election is effectively irreversible.
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Toggle
                  checked={hasTTS}
                  onCheckedChange={setHasTTS}
                  label="I claim Trader Tax Status (Schedule C deductions)"
                />
                <p className="text-xs text-text-muted ml-14">
                  Self-employment-like treatment for trading expenses (home office, software, education). Doesn&apos;t change capital-gain treatment by itself.
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-border">
                <label
                  htmlFor="mtm-year"
                  className="text-xs font-medium text-text-secondary"
                >
                  §475(f) Mark-to-Market Election Year
                </label>
                <Input
                  id="mtm-year"
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g., 2026 (leave blank if not elected)"
                  value={mtmYear}
                  onChange={(e) => setMtmYear(e.target.value)}
                />
                <p className="text-[11px] text-text-muted">
                  The first tax year the election applies. Leave blank if you
                  haven&apos;t elected MTM. Once recorded, the &quot;declared at&quot;
                  timestamp is set by the server.
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="tax-notes"
                  className="text-xs font-medium text-text-secondary"
                >
                  Notes (optional)
                </label>
                <Textarea
                  id="tax-notes"
                  rows={3}
                  placeholder="e.g., Filed Form 3115 on 2026-04-15 with CPA Smith"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          <ModalFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Save
            </Button>
          </ModalFooter>
      </Modal>
    </>
  );
}
