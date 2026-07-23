"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentPhase } from "@/db/phase";
import { requireAdmin } from "@/lib/auth/session";
import { runAndStoreLotteryDraft } from "@/lottery/database";

const idSchema = z.uuid();

export async function runLotteryDraftAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const phase = await getCurrentPhase();
  if (phase !== "LOTTERY_DRAFT") {
    throw new Error("Lottery drafts can be run only during the LOTTERY_DRAFT phase");
  }

  const dayId = idSchema.parse(formData.get("dayId"));
  const requestedSeed = formData.get("seed");
  const seed =
    typeof requestedSeed === "string" && /^\d+$/.test(requestedSeed)
      ? z.coerce.number().int().min(0).max(2_147_483_647).parse(requestedSeed)
      : randomInt(0, 2_147_483_648);

  const { runId } = await runAndStoreLotteryDraft(dayId, seed, admin.id);
  revalidatePath("/admin");
  revalidatePath("/admin/lottery");
  redirect(`/admin/lottery?day=${dayId}&run=${runId}`);
}
