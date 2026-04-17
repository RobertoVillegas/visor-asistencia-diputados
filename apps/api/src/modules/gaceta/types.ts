export type LegislativePeriod = {
  label: string;
  legislature: string;
  yearSpan: string;
  periodPageUrl: string;
};

export type SessionDocumentLink = {
  kind: "attendance" | "absence";
  url: string;
  label: string;
};

export type DiscoveredSession = {
  title: string;
  gacetaNumber: number | null;
  sessionDate: Date | null;
  sessionType: "ordinary" | "permanent" | "special" | "vote" | "unknown";
  sessionPageUrl: string;
  sourceSlug: string;
  documents: SessionDocumentLink[];
};
