import { it, expect } from "vitest";
import { isRatioWarn, RATIO_WARN } from "./format";

it("flags lean-light ratios above the threshold — not real recipes, nulls, or sub-recipes", () => {
  expect(RATIO_WARN).toBe(18);
  expect(isRatioWarn(20.3)).toBe(true); // Flourless Coconut cake — drifted
  expect(isRatioWarn(18.1)).toBe(true); // Mini Cheesecakes — just over
  expect(isRatioWarn(16.6)).toBe(false); // Fudgy Brownies (excellent) stays clean
  expect(isRatioWarn(8)).toBe(false);
  expect(isRatioWarn(null)).toBe(false);
  expect(isRatioWarn(40.5, true)).toBe(false); // a sub-recipe (crust/caramel) never warns
});
