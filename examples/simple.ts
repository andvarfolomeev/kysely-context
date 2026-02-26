import { Kysely, PostgresDialect } from "kysely";
import { makeKyselyContext } from "../src";
import type { Database } from "./schema";
import { Pool } from "pg";

async function main() {
  const kysely = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool(),
    }),
  });
  const ctx = makeKyselyContext(kysely);

  // Get current connection (root or transaction)
  const current = ctx.current();
  await current.selectFrom("person").selectAll().execute();

  // Run in transaction
  await ctx.inTx(async () => {
    // ctx.current() returns transaction instance
    await ctx
      .current()
      .insertInto("person")
      .values({ first_name: "lupa", last_name: "zapupa" })
      .execute();
  });

  // Nested transactions are flattened automatically
  await ctx.inTx(async () => {
    await ctx.inTx(async () => {
      // Same transaction context
    });
  });
}

main();
