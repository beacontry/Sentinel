"use client";

import { useState, useEffect } from "react";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Building2, Calendar, Globe } from "lucide-react";

interface CompanyProfile {
  name: string;
  country: string;
  currency: string;
  exchange: string;
  ticker: string;
  ipo: string;
  logo: string;
  marketCapitalization: number;
  shareOutstanding: number;
  industry: string;
}

interface CompanyProfileProps {
  symbol: string;
}

function formatMarketCap(capInMillions: number): string {
  if (capInMillions >= 1_000_000) return `$${(capInMillions / 1_000_000).toFixed(2)}T`;
  if (capInMillions >= 1_000) return `$${(capInMillions / 1_000).toFixed(2)}B`;
  return `$${capInMillions.toFixed(0)}M`;
}

export function CompanyProfile({ symbol }: CompanyProfileProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;

    async function fetchProfile() {
      setLoading(true);
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setConfigured(data.configured !== false);
          setProfile(data.profile ?? null);
        }
      } catch {
        // Non-critical data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton width="40px" height="40px" rounded="lg" />
          <div className="space-y-1.5 flex-1">
            <Skeleton width="140px" height="16px" rounded="sm" />
            <Skeleton width="100px" height="12px" rounded="sm" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton width="80px" height="24px" rounded="lg" />
          <Skeleton width="60px" height="24px" rounded="lg" />
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-xs">
        <Building2 className="w-3.5 h-3.5" />
        <span>Set FINNHUB_API_KEY to enable profiles</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-xs text-text-muted text-center py-3">
        No profile data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Company name + logo */}
      <div className="flex items-center gap-3">
        {profile.logo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={profile.logo}
            alt={profile.name}
            className="w-10 h-10 rounded-lg object-contain bg-bg-elevated p-1"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-bg-elevated flex items-center justify-center">
            <Building2 className="w-5 h-5 text-text-muted" />
          </div>
        )}
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-text-primary truncate">
            {profile.name}
          </h4>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="font-mono">{profile.ticker}</span>
            <span>-</span>
            <span>{profile.exchange}</span>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {profile.industry && (
          <Badge variant="default" className="text-[10px]">
            {profile.industry}
          </Badge>
        )}
        {profile.country && (
          <Badge variant="neutral" className="text-[10px]">
            <Globe className="w-3 h-3" />
            {profile.country}
          </Badge>
        )}
        {profile.marketCapitalization > 0 && (
          <Badge variant="neutral" className="text-[10px] font-mono">
            {formatMarketCap(profile.marketCapitalization)}
          </Badge>
        )}
        {profile.ipo && (
          <Badge variant="neutral" className="text-[10px]">
            <Calendar className="w-3 h-3" />
            IPO {profile.ipo}
          </Badge>
        )}
      </div>
    </div>
  );
}
