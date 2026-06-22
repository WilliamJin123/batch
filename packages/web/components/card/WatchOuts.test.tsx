import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WatchOuts } from "./WatchOuts";

it("WatchOuts lists each note with its kind under a Watch-outs heading", () => {
  render(<WatchOuts notes={[{ kind: "pitfall", text: "don't overbake" }, { kind: "technique", text: "room-temp the cream cheese" }]} />);
  expect(screen.getByText(/Watch-outs/i)).toBeTruthy();
  expect(screen.getByText(/don't overbake/)).toBeTruthy();
  expect(screen.getByText(/room-temp the cream cheese/)).toBeTruthy();
  expect(screen.getByText(/pitfall/i)).toBeTruthy();
});

it("WatchOuts renders nothing when there are no notes", () => {
  const { container } = render(<WatchOuts notes={[]} />);
  expect(container.firstChild).toBeNull();
});
