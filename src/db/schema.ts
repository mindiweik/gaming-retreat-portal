import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["USER", "GM", "ADMIN"]);
export const calendarBlockType = pgEnum("calendar_block_type", [
  "COCKTAIL_HOUR",
  "BREAKFAST",
  "MEAL",
  "OTHER",
]);
export const gameKind = pgEnum("game_kind", ["FEATURED", "ATTENDEE_LED"]);
export const gameStatus = pgEnum("game_status", ["ACTIVE", "CANCELLED"]);
export const registrationStatus = pgEnum("registration_status", [
  "CONFIRMED",
  "WAITLIST",
  "DROPPED",
]);
export const registrationSource = pgEnum("registration_source", [
  "LOTTERY",
  "OPEN_SIGNUP",
  "PROMOTION",
  "BACKFILL",
  "MANUAL",
]);
export const promotionOfferStatus = pgEnum("promotion_offer_status", [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
]);
export const retreatTableKind = pgEnum("retreat_table_kind", ["DEDICATED", "ROTATING"]);
export const retreatPhase = pgEnum("retreat_phase", [
  "SETUP",
  "LOTTERY_SIGNUP",
  "LOTTERY_DRAFT",
  "RESULTS_PUBLISHED",
  "ATTENDEE_SIGNUP",
  "TABLE_ASSIGNMENT",
  "LIVE",
]);
export const lotteryRunStatus = pgEnum("lottery_run_status", [
  "DRAFT",
  "APPROVED",
  "SUPERSEDED",
]);
export const lotteryAssignmentPass = pgEnum("lottery_assignment_pass", [
  "GUARANTEE",
  "BACKFILL",
  "SECOND",
  "TABLE_HEALTH",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  discordId: text("discord_id").unique(),
  discordHandle: text("discord_handle"),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone"),
  bio: text("bio"),
  role: userRole("role").notNull().default("USER"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const retreats = pgTable(
  "retreats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("retreats_date_range_check", sql`${table.endDate} >= ${table.startDate}`)],
);

export const days = pgTable(
  "days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    retreatId: uuid("retreat_id")
      .notNull()
      .references(() => retreats.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    label: text("label").notNull(),
    isCoreDay: boolean("is_core_day").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("days_retreat_date_unique").on(table.retreatId, table.date),
    index("days_retreat_id_idx").on(table.retreatId),
  ],
);

export const calendarBlocks = pgTable(
  "calendar_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dayId: uuid("day_id")
      .notNull()
      .references(() => days.id, { onDelete: "cascade" }),
    type: calendarBlockType("type").notNull().default("OTHER"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("calendar_blocks_day_id_idx").on(table.dayId),
    check("calendar_blocks_time_range_check", sql`${table.endTime} > ${table.startTime}`),
  ],
);

export const retreatTables = pgTable(
  "retreat_tables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    retreatId: uuid("retreat_id")
      .notNull()
      .references(() => retreats.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    label: text("label"),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    capacity: integer("capacity").notNull(),
    kind: retreatTableKind("kind").notNull().default("ROTATING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("retreat_tables_number_unique").on(table.retreatId, table.number),
    uniqueIndex("retreat_tables_grid_position_unique").on(table.retreatId, table.row, table.col),
    index("retreat_tables_retreat_id_idx").on(table.retreatId),
    check("retreat_tables_number_positive_check", sql`${table.number} > 0`),
    check("retreat_tables_row_check", sql`${table.row} BETWEEN 1 AND 4`),
    check("retreat_tables_col_check", sql`${table.col} BETWEEN 1 AND 6`),
    check("retreat_tables_capacity_positive_check", sql`${table.capacity} > 0`),
  ],
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dayId: uuid("day_id")
      .notNull()
      .references(() => days.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    system: text("system").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    minSeats: integer("min_seats").notNull(),
    maxSeats: integer("max_seats").notNull(),
    gmUserId: uuid("gm_user_id").references(() => users.id, { onDelete: "set null" }),
    kind: gameKind("kind").notNull(),
    status: gameStatus("status").notNull().default("ACTIVE"),
    seriesId: uuid("series_id"),
    tableId: uuid("table_id").references(() => retreatTables.id, { onDelete: "set null" }),
    locationNote: text("location_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("games_day_id_idx").on(table.dayId),
    index("games_gm_user_id_idx").on(table.gmUserId),
    index("games_table_id_idx").on(table.tableId),
    index("games_series_id_idx").on(table.seriesId),
    check("games_time_range_check", sql`${table.endTime} > ${table.startTime}`),
    check("games_min_seats_nonnegative_check", sql`${table.minSeats} >= 0`),
    check("games_max_seats_positive_check", sql`${table.maxSeats} > 0`),
    check("games_seat_range_check", sql`${table.maxSeats} >= ${table.minSeats}`),
  ],
);

export const lotteryEntries = pgTable(
  "lottery_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dayId: uuid("day_id")
      .notNull()
      .references(() => days.id, { onDelete: "cascade" }),
    openToOtherGames: boolean("open_to_other_games").notNull().default(false),
    avoidDuplicateSystems: boolean("avoid_duplicate_systems").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lottery_entries_user_day_unique").on(table.userId, table.dayId),
    index("lottery_entries_day_id_idx").on(table.dayId),
  ],
);

export const lotteryChoices = pgTable(
  "lottery_choices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotteryEntryId: uuid("lottery_entry_id")
      .notNull()
      .references(() => lotteryEntries.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lottery_choices_entry_rank_unique").on(table.lotteryEntryId, table.rank),
    uniqueIndex("lottery_choices_entry_game_unique").on(table.lotteryEntryId, table.gameId),
    index("lottery_choices_game_id_idx").on(table.gameId),
    check("lottery_choices_rank_positive_check", sql`${table.rank} > 0`),
  ],
);

export const lotteryRuns = pgTable(
  "lottery_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dayId: uuid("day_id")
      .notNull()
      .references(() => days.id, { onDelete: "cascade" }),
    seed: integer("seed").notNull(),
    status: lotteryRunStatus("status").notNull().default("DRAFT"),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table) => [
    index("lottery_runs_day_id_idx").on(table.dayId),
    index("lottery_runs_status_idx").on(table.status),
  ],
);

export const lotteryDraftAssignments = pgTable(
  "lottery_draft_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotteryRunId: uuid("lottery_run_id")
      .notNull()
      .references(() => lotteryRuns.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    pass: lotteryAssignmentPass("pass").notNull(),
    rank: integer("rank"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lottery_draft_assignments_run_user_game_unique").on(
      table.lotteryRunId,
      table.userId,
      table.gameId,
    ),
    index("lottery_draft_assignments_game_id_idx").on(table.gameId),
    check("lottery_draft_assignments_rank_positive_check", sql`${table.rank} IS NULL OR ${table.rank} > 0`),
  ],
);

export const lotteryDraftWaitlistEntries = pgTable(
  "lottery_draft_waitlist_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotteryRunId: uuid("lottery_run_id")
      .notNull()
      .references(() => lotteryRuns.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    hasConflict: boolean("has_conflict").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lottery_draft_waitlist_run_user_game_unique").on(
      table.lotteryRunId,
      table.userId,
      table.gameId,
    ),
    index("lottery_draft_waitlist_game_id_idx").on(table.gameId),
    check("lottery_draft_waitlist_rank_positive_check", sql`${table.rank} > 0`),
  ],
);

export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    status: registrationStatus("status").notNull(),
    source: registrationSource("source").notNull(),
    hasConflict: boolean("has_conflict").notNull().default(false),
    removedReason: text("removed_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("registrations_user_game_unique").on(table.userId, table.gameId),
    index("registrations_game_status_created_idx").on(table.gameId, table.status, table.createdAt),
    index("registrations_user_status_idx").on(table.userId, table.status),
  ],
);

export const promotionOffers = pgTable(
  "promotion_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    offeredAt: timestamp("offered_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: promotionOfferStatus("status").notNull().default("PENDING"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    index("promotion_offers_expiry_idx").on(table.status, table.expiresAt),
    index("promotion_offers_game_user_idx").on(table.gameId, table.userId),
    check("promotion_offers_expiry_check", sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.offeredAt}`),
  ],
);

export const phaseState = pgTable(
  "phase_state",
  {
    id: integer("id").primaryKey().default(1),
    current: retreatPhase("current").notNull().default("SETUP"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [check("phase_state_singleton_check", sql`${table.id} = 1`)],
);

export const usersRelations = relations(users, ({ many }) => ({
  gamesRun: many(games),
  lotteryEntries: many(lotteryEntries),
  registrations: many(registrations),
  promotionOffers: many(promotionOffers),
  lotteryRunsCreated: many(lotteryRuns),
}));

export const retreatsRelations = relations(retreats, ({ many }) => ({
  days: many(days),
  tables: many(retreatTables),
}));
export const daysRelations = relations(days, ({ one, many }) => ({
  retreat: one(retreats, { fields: [days.retreatId], references: [retreats.id] }),
  calendarBlocks: many(calendarBlocks),
  games: many(games),
  lotteryEntries: many(lotteryEntries),
  lotteryRuns: many(lotteryRuns),
}));
export const calendarBlocksRelations = relations(calendarBlocks, ({ one }) => ({
  day: one(days, { fields: [calendarBlocks.dayId], references: [days.id] }),
}));
export const retreatTablesRelations = relations(retreatTables, ({ one, many }) => ({
  retreat: one(retreats, { fields: [retreatTables.retreatId], references: [retreats.id] }),
  games: many(games),
}));
export const gamesRelations = relations(games, ({ one, many }) => ({
  day: one(days, { fields: [games.dayId], references: [days.id] }),
  gm: one(users, { fields: [games.gmUserId], references: [users.id] }),
  table: one(retreatTables, { fields: [games.tableId], references: [retreatTables.id] }),
  lotteryChoices: many(lotteryChoices),
  registrations: many(registrations),
  promotionOffers: many(promotionOffers),
}));
export const lotteryEntriesRelations = relations(lotteryEntries, ({ one, many }) => ({
  user: one(users, { fields: [lotteryEntries.userId], references: [users.id] }),
  day: one(days, { fields: [lotteryEntries.dayId], references: [days.id] }),
  choices: many(lotteryChoices),
}));
export const lotteryChoicesRelations = relations(lotteryChoices, ({ one }) => ({
  entry: one(lotteryEntries, {
    fields: [lotteryChoices.lotteryEntryId],
    references: [lotteryEntries.id],
  }),
  game: one(games, { fields: [lotteryChoices.gameId], references: [games.id] }),
}));
export const lotteryRunsRelations = relations(lotteryRuns, ({ one, many }) => ({
  day: one(days, { fields: [lotteryRuns.dayId], references: [days.id] }),
  createdBy: one(users, { fields: [lotteryRuns.createdByUserId], references: [users.id] }),
  assignments: many(lotteryDraftAssignments),
  waitlistEntries: many(lotteryDraftWaitlistEntries),
}));
export const lotteryDraftAssignmentsRelations = relations(lotteryDraftAssignments, ({ one }) => ({
  run: one(lotteryRuns, {
    fields: [lotteryDraftAssignments.lotteryRunId],
    references: [lotteryRuns.id],
  }),
  user: one(users, { fields: [lotteryDraftAssignments.userId], references: [users.id] }),
  game: one(games, { fields: [lotteryDraftAssignments.gameId], references: [games.id] }),
}));
export const lotteryDraftWaitlistEntriesRelations = relations(
  lotteryDraftWaitlistEntries,
  ({ one }) => ({
    run: one(lotteryRuns, {
      fields: [lotteryDraftWaitlistEntries.lotteryRunId],
      references: [lotteryRuns.id],
    }),
    user: one(users, { fields: [lotteryDraftWaitlistEntries.userId], references: [users.id] }),
    game: one(games, { fields: [lotteryDraftWaitlistEntries.gameId], references: [games.id] }),
  }),
);
export const registrationsRelations = relations(registrations, ({ one }) => ({
  user: one(users, { fields: [registrations.userId], references: [users.id] }),
  game: one(games, { fields: [registrations.gameId], references: [games.id] }),
}));
export const promotionOffersRelations = relations(promotionOffers, ({ one }) => ({
  user: one(users, { fields: [promotionOffers.userId], references: [users.id] }),
  game: one(games, { fields: [promotionOffers.gameId], references: [games.id] }),
}));
export const phaseStateRelations = relations(phaseState, ({ one }) => ({
  updatedBy: one(users, { fields: [phaseState.updatedByUserId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Retreat = typeof retreats.$inferSelect;
export type Day = typeof days.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Registration = typeof registrations.$inferSelect;
export type Phase = (typeof retreatPhase.enumValues)[number];
