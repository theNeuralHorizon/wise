import { WorkerEntrypoint } from "cloudflare:workers";
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
