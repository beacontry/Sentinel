"use client";

// Small sidebar pill that cycles the global P&L format preference
// (dollar → percent → both → dollar). Sits next to the theme toggle.

import { DollarSign, Percent, Maximize } from "lucide-react";
import { useDisplayPrefs } from "@/components/display-prefs-provider";

const LABEL: Record<"dollar" | "percent" | "both", string> = {
  dollar: "Dollars",
  percent: "Percent",
  both: "Both",
};

export function PnlFormatToggle() {
  const { pnlFormat, togglePnlFormat } = useDisplayPrefs();
  const Icon =
    pnlFormat === "dollar"
      ? DollarSign
      : pnlFormat === "percent"
      ? Percent
      : Maximize;
  return (
    <button
      type="button"
      onClick={togglePnlFormat}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 10px",
        borderRadius: 6,
        fontSize: 13,
        width: "100%",
        border: "none",
        cursor: "pointer",
        color: "var(--color-text-secondary)",
        backgroundColor: "transparent",
        marginBottom: 1,
      }}
      title={`P&L display: ${LABEL[pnlFormat]} (click to cycle)`}
    >
      <Icon style={{ width: 16, height: 16 }} />
      <span>P&L: {LABEL[pnlFormat]}</span>
    </button>
  );
}
