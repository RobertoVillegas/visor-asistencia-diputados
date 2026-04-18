import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "./api";

export interface ResolvedPeriod {
  label: string;
  legislature: string;
  yearSpan: string;
  periodPageUrl: string;
  isImported: boolean;
  storedPeriodId?: string;
  discoveredAt?: string;
}

export interface PeriodsResolution {
  periods: ResolvedPeriod[];
  latestRemotePeriod: ResolvedPeriod | null;
  selectedPeriod?: ResolvedPeriod;
  selectedStoredPeriodId?: string;
  isLoading: boolean;
  error: Error | null;
}

interface ResolverInput {
  legislature?: string;
  periodPageUrl?: string;
}

export function usePeriodResolver({
  legislature,
  periodPageUrl,
}: ResolverInput): PeriodsResolution {
  const periodsQuery = useQuery({
    queryFn: async () => {
      const [remotePeriods, storedPeriods, latestResponse] = await Promise.all([
        api.listPeriods(),
        api.listStoredPeriods(),
        api.getLatestPeriod(),
      ]);

      const storedByUrl = new Map(storedPeriods.map((period) => [period.periodPageUrl, period]));
      const periods: ResolvedPeriod[] = remotePeriods.map((period) => {
        const stored = storedByUrl.get(period.periodPageUrl);
        return {
          ...period,
          discoveredAt: stored?.discoveredAt,
          isImported: Boolean(stored),
          storedPeriodId: stored?.id,
        };
      });

      const latestRemote: ResolvedPeriod | null = latestResponse.latest
        ? {
            ...latestResponse.latest,
            isImported: Boolean(
              storedByUrl.get(latestResponse.latest.periodPageUrl) ?? latestResponse.stored,
            ),
            storedPeriodId:
              storedByUrl.get(latestResponse.latest.periodPageUrl)?.id ?? latestResponse.stored?.id,
          }
        : null;

      return { latestRemote, periods };
    },
    queryKey: ["dashboard-periods"],
    staleTime: 60_000,
  });

  const periods = periodsQuery.data?.periods ?? [];
  const latestRemotePeriod = periodsQuery.data?.latestRemote ?? null;

  const selectedPeriod = useMemo(() => {
    if (!periodPageUrl) {
      return undefined;
    }
    const match = periods.find((period) => period.periodPageUrl === periodPageUrl);
    if (!match) {
      return undefined;
    }
    if (legislature && match.legislature !== legislature) {
      return undefined;
    }
    return match;
  }, [legislature, periodPageUrl, periods]);

  return {
    error: (periodsQuery.error as Error | null) ?? null,
    isLoading: periodsQuery.isPending,
    latestRemotePeriod,
    periods,
    selectedPeriod,
    selectedStoredPeriodId: selectedPeriod?.storedPeriodId,
  };
}
