import { Kysely, PostgresDialect } from "kysely";
import { makeKyselyContext, type GetCurrentKyselyLike } from "../src";
import { Pool } from "pg";
import type { Database, NewPerson, Person } from "./schema";

export class PersonRepository {
  constructor(private readonly current: GetCurrentKyselyLike<Database>) {}

  create(person: NewPerson): Promise<Person | undefined> {
    return this.current().insertInto("person").values(person).returningAll().executeTakeFirst();
  }
}

async function main() {
  const kysely = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool(),
    }),
  });
  const ctx = makeKyselyContext(kysely);

  const repository = new PersonRepository(ctx.current);

  await ctx.inTx(async () => {
    await repository.create({ last_name: "pupa", first_name: "lupa" });
    await repository.create({ last_name: "pupa", first_name: "lupa" });
  });
}

main();
