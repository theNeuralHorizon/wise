import { WorkerEntrypoint } from "cloudflare:workers";
import { fetch as workerFetch, SplitSocket, init } from "./index.js";

try {
    init();
} catch(e) {
    console.error("init() failed:", e);
}

class Entrypoint extends WorkerEntrypoint {
    async fetch(request) {
        try {
            return await workerFetch(request, this.env, this.ctx);
        } catch(e) {
            console.error("fetch() error:", e);
            return new Response(JSON.stringify({error: String(e), stack: e?.stack}), {status: 500, headers: {"content-type": "application/json"}});
        }
    }
}

export { SplitSocket };
export default Entrypoint;
