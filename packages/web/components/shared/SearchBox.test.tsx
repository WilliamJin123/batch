import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { useState } from "react";
import { SearchBox } from "./SearchBox";

function Harness(props: Partial<React.ComponentProps<typeof SearchBox>>) {
  const [v, setV] = useState("");
  return <SearchBox value={v} onChange={setV} {...props} />;
}

it("shows a clear (✕) button only when non-empty, and clears on click", () => {
  render(<Harness />);
  const box = screen.getByRole("searchbox") as HTMLInputElement;
  expect(screen.queryByRole("button", { name: /clear search/i })).toBe(null);
  fireEvent.change(box, { target: { value: "smores" } });
  expect(box.value).toBe("smores");
  fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
  expect(box.value).toBe("");
});

it("calls onEnter on Enter and onDismiss on Escape", () => {
  const onEnter = vi.fn();
  const onDismiss = vi.fn();
  render(<Harness onEnter={onEnter} onDismiss={onDismiss} />);
  const box = screen.getByRole("searchbox");
  fireEvent.change(box, { target: { value: "x" } });
  fireEvent.keyDown(box, { key: "Enter" });
  expect(onEnter).toHaveBeenCalledOnce();
  fireEvent.keyDown(box, { key: "Escape" });
  expect(onDismiss).toHaveBeenCalledOnce();
});

it("Escape clears the field when no onDismiss is given", () => {
  render(<Harness />);
  const box = screen.getByRole("searchbox") as HTMLInputElement;
  fireEvent.change(box, { target: { value: "abc" } });
  fireEvent.keyDown(box, { key: "Escape" });
  expect(box.value).toBe("");
});
