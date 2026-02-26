import type { IsolationLevel } from "kysely";
import type { AccessMode } from "kysely";
import { Kysely, Transaction } from "kysely";

export type KyselyLike<DatabaseSchema> = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

export type GetCurrentKyselyLike<DatabaseSchema> = () => KyselyLike<DatabaseSchema>;

export type TransactionOptions = {
  accessMode?: AccessMode;
  isolationLevel?: IsolationLevel;
  savePointName?: string;
};

export type RunWithKyselyTx = <Return>(
  fn: () => Promise<Return>,
  options?: TransactionOptions,
) => Promise<Return>;

export type KyselyContext<Schema> = {
  current: GetCurrentKyselyLike<Schema>;
  inTx: RunWithKyselyTx;
};
