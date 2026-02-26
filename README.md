# kysely-context

Context manager for Kysely using AsyncLocalStorage. Automatically propagates transactions through call chains without explicit parameter passing. Keeps Kysely simple while adding convenient transaction support to repositories.

```bash
npm i kysely-context
# or
bun add kysely-context
```

## Benefits

- **Simple** — Kysely doesn't become a monster, API stays clean
- **Automatic transaction propagation** — no need to pass `trx` through all application layers
- **Transparent** — repositories work the same inside and outside transactions

## Examples

See [examples/](./examples) directory.

## License

MIT
