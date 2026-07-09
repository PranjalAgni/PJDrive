import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every suite talks to one shared Postgres + MinIO. Running files in
    // parallel spins up a separate pg pool per worker (~10 workers x 10
    // connections approaches Postgres' default max_connections of 100) and lets
    // suites mutate each other's rows, producing intermittent failures. Run
    // files serially so the integration suite is deterministic.
    fileParallelism: false,
  },
});
