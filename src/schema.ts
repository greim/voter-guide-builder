// The state-neutral shape every stage after "structure" works from.
// Booklet-specific layout never leaks past this point: if a guide needs a new
// kind of block (like the YES/NO boxes), add an optional field here and a
// matching piece of the template, and booklets without it render as plain
// Markdown sections.

export interface Guide {
  /** e.g. "Colorado" */
  jurisdiction: string;
  /** e.g. "2026 General Election" */
  election: string;
  /** Page title, e.g. "Colorado Ballot Initiative Voter Guide" */
  title: string;
  /** Where the booklet came from, linked from the guide's intro. */
  sourceUrl: string;
  measures: Measure[];
}

export interface Measure {
  /** URL-safe slug used for anchors and file names, e.g. "amendment-81" */
  id: string;
  /** e.g. "Amendment 81" */
  label: string;
  /** e.g. "Law Enforcement Communication with Federal Immigration Authorities" */
  title: string;
  /** e.g. "Passes with 55% of the vote" */
  voteThreshold?: string;
  /** The question exactly as it appears on the ballot. */
  ballotTitle?: string;
  /** Rendered as the YES/NO boxes when present. */
  voteMeaning?: VoteMeaning;
  /** The booklet's own sections for this measure, in booklet order. */
  sections: Section[];
  figures: FigureRef[];
  /** First and last PDF page (1-based) the measure's sections came from; used by verify. */
  pages: [number, number];
}

export interface VoteMeaning {
  yes: string;
  no: string;
}

export interface Section {
  heading: string;
  /** Section body as Markdown, text verbatim from the booklet. */
  markdown: string;
}

export interface FigureRef {
  /** e.g. "fig-1-state-revenue-limits-under-prop-nn" */
  id: string;
  /** 1-based PDF page the figure is on. */
  page: number;
  caption: string;
  /** Heading of the section the figure belongs after. */
  section: string;
}

/** One analysis per measure, written by the analyze stage. */
export interface Analysis {
  measureId: string;
  markdown: string;
}
