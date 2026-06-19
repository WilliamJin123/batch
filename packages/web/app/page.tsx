// app/page.tsx — imports @batch/core so the build PROVES webpack resolves the raw-TS
// ESM package (the `.js`-specifier resolution gate) at real build time, not just typecheck.
import { RecipeService } from "@batch/core";
export default function Page() {
  return <main>Batch web — scaffold (core: {RecipeService.name})</main>;
}
