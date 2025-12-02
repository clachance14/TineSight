import { task, logger } from "@trigger.dev/sdk/v3";

/**
 * Trigger.dev client for TineSight background jobs.
 *
 * This module provides the core primitives for defining and executing
 * background tasks via Trigger.dev SDK v4.
 *
 * @module trigger/client
 */

/**
 * Re-export task primitive for job definitions.
 * Use this to define background tasks that can be triggered from API routes.
 *
 * @example
 * ```typescript
 * import { task } from "./client";
 *
 * export const processPhoto = task({
 *   id: "process-photo",
 *   run: async (payload: { imageId: string }) => {
 *     // Job implementation
 *   }
 * });
 * ```
 */
export { task };

/**
 * Re-export logger for structured logging within jobs.
 * Logs are automatically captured and displayed in the Trigger.dev dashboard.
 *
 * @example
 * ```typescript
 * import { logger } from "./client";
 *
 * logger.info("Processing started", { imageId });
 * logger.error("Detection failed", { error });
 * ```
 */
export { logger };

/**
 * Trigger.dev project configuration.
 * The actual project ID is configured in trigger.config.ts at the project root.
 *
 * Environment variables:
 * - TRIGGER_API_KEY: API key for triggering jobs (set in .env.local)
 *
 * For configuration reference, see:
 * @see {@link /home/clachance14/projects/TineSight/trigger.config.ts}
 */
