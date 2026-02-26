import { describe, expect, test, mock } from "bun:test";
import { makeKyselyContext } from "./make-context.ts";
import type { Kysely, Transaction } from "kysely";

interface TestDB {
  users: {
    id: number;
    name: string;
  };
}

describe("makeKyselyContext", () => {
  test("should return current as root when no transaction is active", () => {
    const mockRoot = {} as Kysely<TestDB>;
    const ctx = makeKyselyContext(mockRoot);

    const current = ctx.current();

    expect(current).toBe(mockRoot);
  });

  test("should execute callback in transaction context", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const executeFn = mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
      return callback(mockTx);
    });

    const mockRoot = {
      transaction: mock(() => ({
        execute: executeFn,
      })),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    const result = await ctx.inTx(async () => {
      const current = ctx.current();
      expect(current).toBe(mockTx);
      return "success";
    });

    expect(result).toBe("success");
    expect(mockRoot.transaction).toHaveBeenCalledTimes(1);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  test("should return root after transaction completes", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const executeFn = mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
      return callback(mockTx);
    });

    const mockRoot = {
      transaction: mock(() => ({
        execute: executeFn,
      })),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    await ctx.inTx(async () => {
      expect(ctx.current()).toBe(mockTx);
    });

    // After transaction, current should be root again
    expect(ctx.current()).toBe(mockRoot);
  });

  test("should not create nested transaction when already in transaction", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const executeFn = mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
      return callback(mockTx);
    });

    const mockRoot = {
      transaction: mock(() => ({
        execute: executeFn,
      })),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    await ctx.inTx(async () => {
      expect(ctx.current()).toBe(mockTx);

      // Nested call should not create new transaction
      const nestedResult = await ctx.inTx(async () => {
        expect(ctx.current()).toBe(mockTx);
        return "nested";
      });

      expect(nestedResult).toBe("nested");
    });

    // Should only call transaction once (not for nested call)
    expect(mockRoot.transaction).toHaveBeenCalledTimes(1);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  test("should handle multiple sequential transactions", async () => {
    const mockTx1 = { isTx: true, id: 1 } as unknown as Transaction<TestDB>;
    const mockTx2 = { isTx: true, id: 2 } as unknown as Transaction<TestDB>;

    let callCount = 0;
    const mockRoot = {
      transaction: mock(() => ({
        execute: mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
          callCount++;
          return callback(callCount === 1 ? mockTx1 : mockTx2);
        }),
      })),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    await ctx.inTx(async () => {
      expect(ctx.current()).toBe(mockTx1);
    });

    await ctx.inTx(async () => {
      expect(ctx.current()).toBe(mockTx2);
    });

    expect(mockRoot.transaction).toHaveBeenCalledTimes(2);
  });

  test("should isolate transaction contexts in parallel async operations", async () => {
    const mockTx1 = { isTx: true, id: 1 } as unknown as Transaction<TestDB>;
    const mockTx2 = { isTx: true, id: 2 } as unknown as Transaction<TestDB>;

    let callCount = 0;
    const mockRoot = {
      transaction: mock(() => ({
        execute: mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
          callCount++;
          const tx = callCount === 1 ? mockTx1 : mockTx2;
          return callback(tx);
        }),
      })),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    const results = await Promise.all([
      ctx.inTx(async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        const current = ctx.current();
        return current;
      }),
      ctx.inTx(async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 5));
        const current = ctx.current();
        return current;
      }),
    ]);

    // Each transaction should have its own context
    expect(results).toHaveLength(2);
    expect(results[0]).toBe(mockTx1);
    expect(results[1]).toBe(mockTx2);
    expect(mockRoot.transaction).toHaveBeenCalledTimes(2);
  });

  test("should propagate errors from transaction callback", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const executeFn = mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
      return callback(mockTx);
    });

    const mockRoot = {
      transaction: mock(() => ({
        execute: executeFn,
      })),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);
    const error = new Error("Transaction failed");

    expect(
      ctx.inTx(async () => {
        throw error;
      }),
    ).rejects.toThrow("Transaction failed");
  });

  test("should return value from transaction callback", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const executeFn = mock((callback: (tx: Transaction<TestDB>) => Promise<number>) => {
      return callback(mockTx);
    });

    const mockRoot = {
      transaction: mock(() => ({
        execute: executeFn,
      })),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    const result = await ctx.inTx(async () => {
      return 42;
    });

    expect(result).toBe(42);
  });

  test("should handle complex return types from transaction callback", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const executeFn = mock(
      (callback: (tx: Transaction<TestDB>) => Promise<{ id: number; name: string }[]>) => {
        return callback(mockTx);
      },
    );

    const mockRoot = {
      transaction: mock(() => ({
        execute: executeFn,
      })),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    const result = await ctx.inTx(async () => {
      return [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];
    });

    expect(result).toEqual([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
  });

  test("should call setAccessMode when accessMode option is provided", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const setAccessModeFn = mock(() => txBuilder);
    const executeFn = mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
      return callback(mockTx);
    });

    const txBuilder = {
      setAccessMode: setAccessModeFn,
      setIsolationLevel: mock(() => txBuilder),
      execute: executeFn,
    };

    const mockRoot = {
      transaction: mock(() => txBuilder),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    await ctx.inTx(
      async () => {
        return "done";
      },
      { accessMode: "read only" },
    );

    expect(setAccessModeFn).toHaveBeenCalledTimes(1);
    expect(setAccessModeFn).toHaveBeenCalledWith("read only");
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  test("should call setIsolationLevel when isolationLevel option is provided", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const setIsolationLevelFn = mock(() => txBuilder);
    const executeFn = mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
      return callback(mockTx);
    });

    const txBuilder = {
      setAccessMode: mock(() => txBuilder),
      setIsolationLevel: setIsolationLevelFn,
      execute: executeFn,
    };

    const mockRoot = {
      transaction: mock(() => txBuilder),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    await ctx.inTx(
      async () => {
        return "done";
      },
      { isolationLevel: "serializable" },
    );

    expect(setIsolationLevelFn).toHaveBeenCalledTimes(1);
    expect(setIsolationLevelFn).toHaveBeenCalledWith("serializable");
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  test("should call both setAccessMode and setIsolationLevel when both options are provided", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const setAccessModeFn = mock(() => txBuilder);
    const setIsolationLevelFn = mock(() => txBuilder);
    const executeFn = mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
      return callback(mockTx);
    });

    const txBuilder = {
      setAccessMode: setAccessModeFn,
      setIsolationLevel: setIsolationLevelFn,
      execute: executeFn,
    };

    const mockRoot = {
      transaction: mock(() => txBuilder),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    await ctx.inTx(
      async () => {
        return "done";
      },
      {
        accessMode: "read write",
        isolationLevel: "read committed",
      },
    );

    expect(setAccessModeFn).toHaveBeenCalledTimes(1);
    expect(setAccessModeFn).toHaveBeenCalledWith("read write");
    expect(setIsolationLevelFn).toHaveBeenCalledTimes(1);
    expect(setIsolationLevelFn).toHaveBeenCalledWith("read committed");
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  test("should not call setAccessMode or setIsolationLevel when no options are provided", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const setAccessModeFn = mock(() => txBuilder);
    const setIsolationLevelFn = mock(() => txBuilder);
    const executeFn = mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
      return callback(mockTx);
    });

    const txBuilder = {
      setAccessMode: setAccessModeFn,
      setIsolationLevel: setIsolationLevelFn,
      execute: executeFn,
    };

    const mockRoot = {
      transaction: mock(() => txBuilder),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    await ctx.inTx(async () => {
      return "done";
    });

    expect(setAccessModeFn).toHaveBeenCalledTimes(0);
    expect(setIsolationLevelFn).toHaveBeenCalledTimes(0);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });

  test("should not call setAccessMode or setIsolationLevel when already in transaction", async () => {
    const mockTx = { isTx: true } as unknown as Transaction<TestDB>;
    const setAccessModeFn = mock(() => txBuilder);
    const setIsolationLevelFn = mock(() => txBuilder);
    const executeFn = mock((callback: (tx: Transaction<TestDB>) => Promise<void>) => {
      return callback(mockTx);
    });

    const txBuilder = {
      setAccessMode: setAccessModeFn,
      setIsolationLevel: setIsolationLevelFn,
      execute: executeFn,
    };

    const mockRoot = {
      transaction: mock(() => txBuilder),
    } as unknown as Kysely<TestDB>;

    const ctx = makeKyselyContext(mockRoot);

    await ctx.inTx(async () => {
      // Nested transaction with options should not create new transaction
      // and should not call setAccessMode/setIsolationLevel
      await ctx.inTx(
        async () => {
          return "nested";
        },
        {
          accessMode: "read only",
          isolationLevel: "serializable",
        },
      );
      return "done";
    });

    // Should be called only once for outer transaction (which has no options)
    expect(mockRoot.transaction).toHaveBeenCalledTimes(1);
    expect(setAccessModeFn).toHaveBeenCalledTimes(0);
    expect(setIsolationLevelFn).toHaveBeenCalledTimes(0);
    expect(executeFn).toHaveBeenCalledTimes(1);
  });
});
