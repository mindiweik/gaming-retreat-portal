"use server";

import { revalidatePath } from "next/cache";

import { advancePhase, PHASE_ORDER } from "@/db/phase";
import type { Phase } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export async function advancePhaseAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const expectedCurrent = formData.get("expectedCurrent");
  const next = formData.get("next");
  const confirmation = formData.get("confirmation");

  if (!isPhase(expectedCurrent) || !isPhase(next)) {
    throw new Error("Invalid phase transition request");
  }
  if (confirmation !== "ADVANCE") {
    throw new Error('Type "ADVANCE" to confirm the phase change');
  }

  await advancePhase(expectedCurrent, next, admin.id);
  revalidatePath("/");
  revalidatePath("/admin");
}

function isPhase(value: FormDataEntryValue | null): value is Phase {
  return typeof value === "string" && PHASE_ORDER.some((phase) => phase === value);
}
