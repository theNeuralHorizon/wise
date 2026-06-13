import { execSync } from "child_process";
import { mkdirSync, cpSync, existsSync } from "fs";

const outDir = "build/worker";
mkdirSync(outDir, { recursive: true });

// Find wasm-bindgen in worker-build cache or PATH
const wasmBindgenPaths = [
  "wasm-bindgen",
  `${process.env.HOME}/.cache/worker-build/wasm-bindgen-x86_64-pc-windows-msvc-0.2.125/wasm-bindgen.exe`,
  `${process.env.HOME}/.cache/worker-build/wasm-bindgen-x86_64-unknown-linux-musl-0.2.125/wasm-bindgen`,
  `${process.env.HOME}/.cache/worker-build/wasm-bindgen-aarch64-unknown-linux-musl-0.2.125/wasm-bindgen`,
];

let wasmBindgen = "wasm-bindgen";
for (const p of wasmBindgenPaths) {
  if (existsSync(p)) {
    wasmBindgen = p;
    break;
  }
}

const wasmPath = "target/wasm32-unknown-unknown/release/wise_worker.wasm";

console.log(`Running wasm-bindgen: ${wasmBindgen}`);
execSync(
  `"${wasmBindgen}" "${wasmPath}" --out-dir "${outDir}" --no-typescript --target module --out-name index`,
  { stdio: "inherit" }
);

// Copy shim.mjs from source if it exists, otherwise use the template
if (existsSync("shim.mjs")) {
  cpSync("shim.mjs", `${outDir}/shim.mjs`);
} else {
  // Write the shim template
  const { writeFileSync } = await import("fs");
  writeFileSync(
    `${outDir}/shim.mjs`,
    `import { WorkerEntrypoint } from "cloudflare:workers";
import { fetch as workerFetch, SplitSocket, init } from "./index.js";

init();

class Entrypoint extends WorkerEntrypoint {
    async fetch(request) {
        let response = workerFetch(request, this.env, this.ctx);
        $WAIT_UNTIL_RESPONSE;
        return await response;
    }
}

export { SplitSocket };
export default Entrypoint;
`
  );
}

console.log("Build complete!");
