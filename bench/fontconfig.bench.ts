/**
 * Fontconfig WASM Benchmarks
 */

import FontconfigWASM from "../src/lib/index.ts"

Deno.bench("fontconfig initialization", {
  baseline: true
}, async () => {
  const lib = new FontconfigWASM()
  await lib.initialize()
})
