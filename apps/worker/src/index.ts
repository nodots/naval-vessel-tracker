async function main(): Promise<void> {
  console.log("[worker] M1 placeholder — no ingestion loop yet");
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
