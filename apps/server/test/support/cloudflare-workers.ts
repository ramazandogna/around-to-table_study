/** Stand-in for the Workers runtime's base class, for running Durable Objects under Node. */
export class DurableObject<Env = unknown> {
  ctx: unknown;
  env: Env;
  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
