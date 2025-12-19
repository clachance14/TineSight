import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_rtasprdfdazkqkobaydv",
  runtime: "node",
  logLevel: "log",
  maxDuration: 600, // 10 minutes for ML jobs
  dirs: ["./trigger"],
});
