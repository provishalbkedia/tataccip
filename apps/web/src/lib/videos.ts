// Official CCIP platform walkthrough videos, embedded (privacy-enhanced
// youtube-nocookie.com host) on the Help guide and Dashboard. Shared here so
// both pages -- and the VideoModal that plays them -- reference one source
// of truth for video IDs and copy.
export type VideoOrientation = "vertical" | "widescreen";

export type VideoAsset = {
  videoId: string;
  embedUrl: string;
  orientation: VideoOrientation;
  duration: string;
  title: string;
  subtitle: string;
};

export const BRIEF_VIDEO: VideoAsset = {
  videoId: "gzGFi3I8mck",
  embedUrl: "https://www.youtube-nocookie.com/embed/gzGFi3I8mck",
  orientation: "vertical",
  duration: "~80 seconds",
  title: "CCIP in 80 Seconds — Solving Telecom's Messy Data Problem",
  subtitle: "Quick executive summary on GSMA IR.21 ground truth vs. wholesale reach lists.",
};

export const MASTERCLASS_VIDEO: VideoAsset = {
  videoId: "gimsbkd-rOo",
  embedUrl: "https://www.youtube-nocookie.com/embed/gimsbkd-rOo",
  orientation: "widescreen",
  duration: "~7.5 minutes",
  title: "Complete CCIP Platform & Architecture Guide",
  subtitle: "Deep-dive explainer covering delta detection, routing changes, multi-carrier ingestion, and exclusivity audits.",
};
