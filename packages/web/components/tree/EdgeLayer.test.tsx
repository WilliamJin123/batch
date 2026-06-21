import { it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EdgeLayer } from "./EdgeLayer";

const base = { edges: [], pos: new Map(), width: 1000, height: 400 } as any;

it("renders a comb bracket for a 3-arm connector: a spine + a drop per arm, plus a dot per arm", () => {
  const comb = { note: {}, anchors: [{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 700, y: 100 }], spine: { x1: 100, y1: 66, x2: 700 }, mx: 400, my: 66 };
  const { container } = render(<EdgeLayer {...base} connectors={[comb]} />);
  expect(container.querySelectorAll(".boconn path").length).toBe(4); // 1 spine + 3 drops
  expect(container.querySelectorAll(".boconn circle").length).toBe(3); // a dot at each arm
});

it("renders a single curved bracket for a 2-arm connector with a dot at each arm", () => {
  const pair = { note: {}, anchors: [{ x: 200, y: 50 }, { x: 400, y: 50 }], mx: 300, my: 50 };
  const { container } = render(<EdgeLayer {...base} connectors={[pair]} />);
  expect(container.querySelectorAll(".boconn path").length).toBe(1);
  expect(container.querySelectorAll(".boconn circle").length).toBe(2);
});
