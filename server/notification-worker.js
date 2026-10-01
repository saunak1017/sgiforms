import { drain } from "./mail.js";
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(drain(env));
  },
  async fetch() {
    return new Response("SGI submission email queue worker");
  },
};
