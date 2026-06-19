export function StateDot({ made, rating }: { made: boolean; rating?: string }) {
  if (!made) return <span className="ringa" aria-label="to-make" />;
  if (rating === "excellent") return <span className="star" aria-label="excellent">★</span>;
  return <span className="dotg" aria-label="made" />;
}
