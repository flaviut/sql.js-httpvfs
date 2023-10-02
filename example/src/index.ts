import { createDbWorker } from "sql.js-httpvfs";

async function load() {
  const worker = await createDbWorker(
    [
      {
        from: "inline",
        config: {
          serverMode: "full",
          url: "/test.db",
          requestChunkSize: 8192,
          compression: 'zstdparts',
        },
      },
    ],
    {
      worker: new URL("sql.js-httpvfs/dist/sqlite.worker.js", import.meta.url).toString(),
      sqliteWasm: new URL("sql.js-httpvfs/dist/sql-wasm.wasm", import.meta.url).toString(),
      zstdWasm: new URL("sql.js-httpvfs/dist/zstd_decompress.wasm", import.meta.url).toString(),
    }
  );

  const result = await worker.db.query(`select * from stocks`);

  document.body.textContent = JSON.stringify(result);
}

load();
