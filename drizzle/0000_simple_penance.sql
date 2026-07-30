CREATE TYPE "public"."event_stage" AS ENUM('CREATE', 'SUBMIT', 'PURCHASE_RECEIPT', 'FINAL_APPROVAL', 'RETURN', 'REJECT', 'CANCEL', 'CLOSE', 'AMEND');--> statement-breakpoint
CREATE TYPE "public"."indent_status" AS ENUM('DRAFT', 'PENDING_PURCHASE', 'PENDING_APPROVAL', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('NORMAL', 'URGENT', 'CRITICAL');--> statement-breakpoint
CREATE TABLE "counters" (
	"fy" text NOT NULL,
	"prefix" text NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "counters_fy_prefix_pk" PRIMARY KEY("fy","prefix")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name"),
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "indent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"indent_id" uuid NOT NULL,
	"stage" "event_stage" NOT NULL,
	"from_status" "indent_status",
	"to_status" "indent_status" NOT NULL,
	"actor_id" uuid,
	"actor_name_snapshot" text NOT NULL,
	"actor_designation_snapshot" text NOT NULL,
	"note" text,
	"lines_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indent_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"indent_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid,
	"custom_description" text,
	"specification" text,
	"uom_id" uuid NOT NULL,
	"balance_qty" numeric(14, 3),
	"required_qty" numeric(14, 3) NOT NULL,
	"expected_date" date,
	"remarks" text,
	CONSTRAINT "indent_lines_item_or_description" CHECK (("indent_lines"."item_id" IS NOT NULL) <> ("indent_lines"."custom_description" IS NOT NULL)),
	CONSTRAINT "indent_lines_required_qty_positive" CHECK ("indent_lines"."required_qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "indents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"indent_no" text,
	"legacy_serial_no" text,
	"fy" text,
	"indent_date" date NOT NULL,
	"raised_by_id" uuid,
	"requester_name" text NOT NULL,
	"requester_designation" text NOT NULL,
	"department_id" uuid NOT NULL,
	"purpose" text,
	"expected_date" date,
	"dept_ref" text,
	"status" "indent_status" DEFAULT 'DRAFT' NOT NULL,
	"priority" "priority" DEFAULT 'NORMAL' NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indents_indent_no_unique" UNIQUE("indent_no")
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "item_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"specification" text,
	"category_id" uuid,
	"default_uom_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"designation" text NOT NULL,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "uoms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "indent_events" ADD CONSTRAINT "indent_events_indent_id_indents_id_fk" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indent_events" ADD CONSTRAINT "indent_events_actor_id_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_indent_id_indents_id_fk" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indent_lines" ADD CONSTRAINT "indent_lines_uom_id_uoms_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indents" ADD CONSTRAINT "indents_raised_by_id_people_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indents" ADD CONSTRAINT "indents_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_uom_id_uoms_id_fk" FOREIGN KEY ("default_uom_id") REFERENCES "public"."uoms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indent_events_indent_idx" ON "indent_events" USING btree ("indent_id");--> statement-breakpoint
CREATE INDEX "indent_events_created_idx" ON "indent_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "indent_lines_indent_line_idx" ON "indent_lines" USING btree ("indent_id","line_no");--> statement-breakpoint
CREATE INDEX "indent_lines_item_idx" ON "indent_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "indents_status_idx" ON "indents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "indents_department_idx" ON "indents" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "indents_date_idx" ON "indents" USING btree ("indent_date");--> statement-breakpoint
CREATE INDEX "indents_submitted_idx" ON "indents" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "items_name_idx" ON "items" USING btree ("name");--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category_id");