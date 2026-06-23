import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { compareFingerprints } from "@/lib/fingerprint/compare";
import { compareDeer } from "./compare-deer";
import type { AntlerFingerprint } from "@/types/fingerprint";

/**
 * Reverse Re-ID Scan Job (ADR 0005)
 *
 * The ongoing complement to post-creation-scan. When a NEW, unassigned buck
 * Detection acquires a fingerprint, compare it against the account's Catalog and
 * propose Sightings ("this is probably Big-12") — never auto-assign.
 *
 * Cost-tiered, fingerprint-first:
 * - similarity >= STRONG_MATCH  -> propose a pending match_candidate directly (free)
 * - similarity in ambiguous band -> escalate to the Gemini compare-deer job
 * - below                        -> nothing
 *
 * Confirming the resulting match_candidate is what adds the Sighting
 * (sets detections.deer_id). Human-in-the-loop; no identities are auto-merged.
 *
 * @module trigger/jobs/reverse-reid-scan
 */

interface ReverseReidScanPayload {
  detectionId: string;
  userId: string;
}

// Fingerprint-similarity bands, in percent (compareFingerprints returns 0-100).
const STRONG_MATCH = 85; // >= this: propose a candidate directly
const AMBIGUOUS_MATCH = 70; // [AMBIGUOUS_MATCH, STRONG_MATCH): escalate to Gemini

interface CatalogRow {
  id: string;
  name: string | null;
  reference_detection_id: string | null;
  reference_detection: { antler_fingerprint: AntlerFingerprint | null } | null;
}

export const reverseReidScan = task({
  id: "reverse-reid-scan",
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000 },
  run: async (payload: ReverseReidScanPayload) => {
    const { detectionId, userId } = payload;
    logger.info("Starting reverse re-ID scan", { detectionId, userId });

    const supabase = createAdminClient();

    try {
      // 1. Load the new detection + its fingerprint. Bail if already assigned or unscored.
      const { data: detection, error: detErr } = await supabase
        .from("detections")
        .select("id, deer_id, antler_fingerprint")
        .eq("id", detectionId)
        .single();

      if (detErr != null || detection == null) {
        return { success: false, detectionId, error: detErr?.message ?? "Detection not found" };
      }
      if (detection.deer_id != null) {
        return { success: true, detectionId, matchesProposed: 0, message: "Detection already assigned" };
      }
      const detectionFp = detection.antler_fingerprint as AntlerFingerprint | null;
      if (detectionFp == null) {
        return { success: true, detectionId, matchesProposed: 0, message: "No fingerprint - cannot re-ID" };
      }

      // 2. Load the account's Catalog (deer with a reference fingerprint).
      const { data: catalogData, error: catErr } = await supabase
        .from("deer")
        .select(
          "id, name, reference_detection_id, reference_detection:detections!reference_detection_id(antler_fingerprint)"
        )
        .eq("user_id", userId)
        .not("reference_detection_id", "is", null);

      if (catErr != null) {
        return { success: false, detectionId, error: `Failed to load catalog: ${catErr.message}` };
      }
      const catalog = (catalogData ?? []) as unknown as CatalogRow[];
      if (catalog.length === 0) {
        return { success: true, detectionId, matchesProposed: 0, message: "Empty catalog" };
      }

      // 3. Fingerprint-compare against each cataloged buck; bucket by band.
      const strong: Array<{ deerId: string; similarity: number }> = [];
      const ambiguous: Array<{ id: string; name: string; reference_detection_id: string }> = [];

      for (const deer of catalog) {
        const refFp = deer.reference_detection?.antler_fingerprint ?? null;
        if (refFp == null || deer.reference_detection_id == null) continue;
        let similarity: number;
        try {
          similarity = compareFingerprints(detectionFp, refFp).overall_similarity;
        } catch (e) {
          logger.warn("Fingerprint compare failed", {
            deerId: deer.id,
            error: e instanceof Error ? e.message : String(e),
          });
          continue;
        }
        if (similarity >= STRONG_MATCH) {
          strong.push({ deerId: deer.id, similarity });
        } else if (similarity >= AMBIGUOUS_MATCH) {
          ambiguous.push({
            id: deer.id,
            name: deer.name ?? "Unnamed",
            reference_detection_id: deer.reference_detection_id,
          });
        }
      }

      // 4. Strong matches: propose pending candidates directly (no Gemini, no auto-assign).
      //    A reject/confirm is an operator decision and must be sticky — never
      //    resurrect a decided (detection, deer) pair back to pending on a rescan
      //    (human-in-the-loop, constitution). Pre-fetch decided pairs and skip them.
      const { data: decidedRows } = await supabase
        .from("match_candidates")
        .select("candidate_deer_id")
        .eq("detection_id", detectionId)
        .in("status", ["rejected", "confirmed"]);
      const decidedDeerIds = new Set((decidedRows ?? []).map((r) => r.candidate_deer_id));

      let proposed = 0;
      for (const m of strong) {
        if (decidedDeerIds.has(m.deerId)) continue;
        const sim01 = Math.round((m.similarity / 100) * 10000) / 10000;
        const { error: insErr } = await supabase.from("match_candidates").upsert(
          {
            detection_id: detectionId,
            candidate_deer_id: m.deerId,
            similarity_score: sim01,
            antler_print_similarity: sim01,
            status: "pending",
          },
          { onConflict: "detection_id,candidate_deer_id" }
        );
        if (insErr) {
          logger.error("Failed to insert match candidate", { deerId: m.deerId, error: insErr.message });
        } else {
          proposed++;
        }
      }

      // 5. Ambiguous band: hand off to the Gemini compare-deer job, which writes
      //    its own match_candidates. This is the only paid path, and it is narrow.
      let escalated = 0;
      if (ambiguous.length > 0) {
        try {
          await compareDeer.trigger({ detectionId, catalogDeer: ambiguous });
          escalated = ambiguous.length;
        } catch (e) {
          logger.error("Failed to escalate to compare-deer", {
            detectionId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info("Reverse re-ID scan complete", {
        detectionId,
        catalogSize: catalog.length,
        proposed,
        escalated,
      });
      return { success: true, detectionId, matchesProposed: proposed, escalatedToGemini: escalated };
    } catch (error) {
      logger.error("Reverse re-ID scan failed", {
        detectionId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, detectionId, error: error instanceof Error ? error.message : String(error) };
    }
  },
});
