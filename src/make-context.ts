import { Kysely } from "kysely";
import { AsyncLocalStorage } from "node:async_hooks";
import type { KyselyContext, KyselyLike, TransactionOptions } from "./types.js";

export function makeKyselyContext<DatabaseSchema>(
  root: Kysely<DatabaseSchema>,
): KyselyContext<DatabaseSchema> {
  const als = new AsyncLocalStorage<KyselyLike<DatabaseSchema>>();

  function current(): KyselyLike<DatabaseSchema> {
    return als.getStore() ?? root;
  }

  async function inTx<R>(fn: () => Promise<R>, options?: TransactionOptions): Promise<R> {
    if (als.getStore()) {
      return fn();
    }

    const txBuilder = root.transaction();

    if (options?.accessMode) {
      txBuilder.setAccessMode(options.accessMode);
    }

    if (options?.isolationLevel) {
      txBuilder.setIsolationLevel(options.isolationLevel);
    }

    return txBuilder.execute((tx) => als.run(tx, fn));
  }

  return { current, inTx };
}
