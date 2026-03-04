declare module '../../../api/scripts/e2e-db.mjs' {
  export function resetAndSeedFullStackScenario(): Promise<void>;
  export function disconnectE2EDatabase(): Promise<void>;
}
