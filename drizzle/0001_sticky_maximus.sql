CREATE TYPE "public"."calendar_block_type" AS ENUM('COCKTAIL_HOUR', 'BREAKFAST', 'MEAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."game_kind" AS ENUM('FEATURED', 'ATTENDEE_LED');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('ACTIVE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."lottery_assignment_pass" AS ENUM('GUARANTEE', 'BACKFILL', 'SECOND', 'TABLE_HEALTH');--> statement-breakpoint
CREATE TYPE "public"."lottery_run_status" AS ENUM('DRAFT', 'APPROVED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."promotion_offer_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."registration_source" AS ENUM('LOTTERY', 'OPEN_SIGNUP', 'PROMOTION', 'BACKFILL', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('CONFIRMED', 'WAITLIST', 'DROPPED');--> statement-breakpoint
CREATE TYPE "public"."retreat_phase" AS ENUM('SETUP', 'LOTTERY_SIGNUP', 'LOTTERY_DRAFT', 'RESULTS_PUBLISHED', 'ATTENDEE_SIGNUP', 'TABLE_ASSIGNMENT', 'LIVE');--> statement-breakpoint
CREATE TYPE "public"."retreat_table_kind" AS ENUM('DEDICATED', 'ROTATING');--> statement-breakpoint
CREATE TABLE "calendar_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"type" "calendar_block_type" DEFAULT 'OTHER' NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_blocks_time_range_check" CHECK ("calendar_blocks"."end_time" > "calendar_blocks"."start_time")
);
--> statement-breakpoint
CREATE TABLE "days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retreat_id" uuid NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"is_core_day" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"system" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"min_seats" integer NOT NULL,
	"max_seats" integer NOT NULL,
	"gm_user_id" uuid,
	"kind" "game_kind" NOT NULL,
	"status" "game_status" DEFAULT 'ACTIVE' NOT NULL,
	"series_id" uuid,
	"table_id" uuid,
	"location_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_time_range_check" CHECK ("games"."end_time" > "games"."start_time"),
	CONSTRAINT "games_min_seats_nonnegative_check" CHECK ("games"."min_seats" >= 0),
	CONSTRAINT "games_max_seats_positive_check" CHECK ("games"."max_seats" > 0),
	CONSTRAINT "games_seat_range_check" CHECK ("games"."max_seats" >= "games"."min_seats")
);
--> statement-breakpoint
CREATE TABLE "lottery_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lottery_entry_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_choices_rank_positive_check" CHECK ("lottery_choices"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "lottery_draft_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lottery_run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"pass" "lottery_assignment_pass" NOT NULL,
	"rank" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_draft_assignments_rank_positive_check" CHECK ("lottery_draft_assignments"."rank" IS NULL OR "lottery_draft_assignments"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "lottery_draft_waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lottery_run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"has_conflict" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_draft_waitlist_rank_positive_check" CHECK ("lottery_draft_waitlist_entries"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "lottery_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"open_to_other_games" boolean DEFAULT false NOT NULL,
	"avoid_duplicate_systems" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"seed" integer NOT NULL,
	"status" "lottery_run_status" DEFAULT 'DRAFT' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "phase_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"current" "retreat_phase" DEFAULT 'SETUP' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "phase_state_singleton_check" CHECK ("phase_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "promotion_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "promotion_offer_status" DEFAULT 'PENDING' NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "promotion_offers_expiry_check" CHECK ("promotion_offers"."expires_at" IS NULL OR "promotion_offers"."expires_at" > "promotion_offers"."offered_at")
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"status" "registration_status" NOT NULL,
	"source" "registration_source" NOT NULL,
	"has_conflict" boolean DEFAULT false NOT NULL,
	"removed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retreat_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retreat_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"label" text,
	"row" integer NOT NULL,
	"col" integer NOT NULL,
	"capacity" integer NOT NULL,
	"kind" "retreat_table_kind" DEFAULT 'ROTATING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retreat_tables_number_positive_check" CHECK ("retreat_tables"."number" > 0),
	CONSTRAINT "retreat_tables_row_check" CHECK ("retreat_tables"."row" BETWEEN 1 AND 4),
	CONSTRAINT "retreat_tables_col_check" CHECK ("retreat_tables"."col" BETWEEN 1 AND 6),
	CONSTRAINT "retreat_tables_capacity_positive_check" CHECK ("retreat_tables"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "retreats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retreats_date_range_check" CHECK ("retreats"."end_date" >= "retreats"."start_date")
);
--> statement-breakpoint
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_retreat_id_retreats_id_fk" FOREIGN KEY ("retreat_id") REFERENCES "public"."retreats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_gm_user_id_users_id_fk" FOREIGN KEY ("gm_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_table_id_retreat_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."retreat_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_choices" ADD CONSTRAINT "lottery_choices_lottery_entry_id_lottery_entries_id_fk" FOREIGN KEY ("lottery_entry_id") REFERENCES "public"."lottery_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_choices" ADD CONSTRAINT "lottery_choices_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_draft_assignments" ADD CONSTRAINT "lottery_draft_assignments_lottery_run_id_lottery_runs_id_fk" FOREIGN KEY ("lottery_run_id") REFERENCES "public"."lottery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_draft_assignments" ADD CONSTRAINT "lottery_draft_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_draft_assignments" ADD CONSTRAINT "lottery_draft_assignments_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_draft_waitlist_entries" ADD CONSTRAINT "lottery_draft_waitlist_entries_lottery_run_id_lottery_runs_id_fk" FOREIGN KEY ("lottery_run_id") REFERENCES "public"."lottery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_draft_waitlist_entries" ADD CONSTRAINT "lottery_draft_waitlist_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_draft_waitlist_entries" ADD CONSTRAINT "lottery_draft_waitlist_entries_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_entries" ADD CONSTRAINT "lottery_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_entries" ADD CONSTRAINT "lottery_entries_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_runs" ADD CONSTRAINT "lottery_runs_day_id_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_runs" ADD CONSTRAINT "lottery_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_state" ADD CONSTRAINT "phase_state_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_offers" ADD CONSTRAINT "promotion_offers_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_offers" ADD CONSTRAINT "promotion_offers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retreat_tables" ADD CONSTRAINT "retreat_tables_retreat_id_retreats_id_fk" FOREIGN KEY ("retreat_id") REFERENCES "public"."retreats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_blocks_day_id_idx" ON "calendar_blocks" USING btree ("day_id");--> statement-breakpoint
CREATE UNIQUE INDEX "days_retreat_date_unique" ON "days" USING btree ("retreat_id","date");--> statement-breakpoint
CREATE INDEX "days_retreat_id_idx" ON "days" USING btree ("retreat_id");--> statement-breakpoint
CREATE INDEX "games_day_id_idx" ON "games" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "games_gm_user_id_idx" ON "games" USING btree ("gm_user_id");--> statement-breakpoint
CREATE INDEX "games_table_id_idx" ON "games" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "games_series_id_idx" ON "games" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_choices_entry_rank_unique" ON "lottery_choices" USING btree ("lottery_entry_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_choices_entry_game_unique" ON "lottery_choices" USING btree ("lottery_entry_id","game_id");--> statement-breakpoint
CREATE INDEX "lottery_choices_game_id_idx" ON "lottery_choices" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_draft_assignments_run_user_game_unique" ON "lottery_draft_assignments" USING btree ("lottery_run_id","user_id","game_id");--> statement-breakpoint
CREATE INDEX "lottery_draft_assignments_game_id_idx" ON "lottery_draft_assignments" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_draft_waitlist_run_user_game_unique" ON "lottery_draft_waitlist_entries" USING btree ("lottery_run_id","user_id","game_id");--> statement-breakpoint
CREATE INDEX "lottery_draft_waitlist_game_id_idx" ON "lottery_draft_waitlist_entries" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_entries_user_day_unique" ON "lottery_entries" USING btree ("user_id","day_id");--> statement-breakpoint
CREATE INDEX "lottery_entries_day_id_idx" ON "lottery_entries" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "lottery_runs_day_id_idx" ON "lottery_runs" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "lottery_runs_status_idx" ON "lottery_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "promotion_offers_expiry_idx" ON "promotion_offers" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "promotion_offers_game_user_idx" ON "promotion_offers" USING btree ("game_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_user_game_unique" ON "registrations" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "registrations_game_status_created_idx" ON "registrations" USING btree ("game_id","status","created_at");--> statement-breakpoint
CREATE INDEX "registrations_user_status_idx" ON "registrations" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "retreat_tables_number_unique" ON "retreat_tables" USING btree ("retreat_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "retreat_tables_grid_position_unique" ON "retreat_tables" USING btree ("retreat_id","row","col");--> statement-breakpoint
CREATE INDEX "retreat_tables_retreat_id_idx" ON "retreat_tables" USING btree ("retreat_id");