export async function register() {
  // Only run in-process scheduler in dev mode.
  // In production, the Railway worker handles cron scheduling.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV !== "production") {
    const { initScheduler } = await import("@/lib/scheduler");
    await initScheduler();
    console.log("[Instrumentation] Scheduler initialized (dev mode)");
  }
}
