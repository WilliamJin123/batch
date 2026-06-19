const LABEL = { excellent: "★ excellent", good: "good", okay: "okay", bad: "needs work" } as const;
export function RatingChip({ rating, made }: { rating?: "bad"|"okay"|"good"|"excellent"; made: boolean }) {
  if (!made) return <span className="rate plan">○ to make</span>;
  return <span className={`rate ${rating ?? "good"}`}>{rating ? LABEL[rating] : "made"}</span>;
}
