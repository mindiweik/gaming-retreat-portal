"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession, requireAuth } from "@/lib/auth/session";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.union([z.literal(""), z.email()]).transform((value) => value || null),
  phone: z.string().trim().max(40).transform((value) => value || null),
  bio: z.string().trim().max(1000).transform((value) => value || null),
});

export async function updateProfileAction(formData: FormData): Promise<void> {
  const session = await requireAuth();
  const input = profileSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    bio: formData.get("bio"),
  });

  const [user] = await getDb()
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, session.id))
    .returning();
  if (!user) throw new Error("Profile could not be updated");

  await createSession({
    id: user.id,
    name: user.name,
    role: user.role,
    discordHandle: user.discordHandle ?? undefined,
  });
  redirect("/profile?saved=1");
}
