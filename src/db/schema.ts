import { pgTable, pgEnum, uuid, text, integer, numeric, boolean, timestamp, date,unique } from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["client", "contractor", "supplier"]);
export const projectTypeEnum = pgEnum("project_type", ["new_build", "renovation"]);
export const projectStatusEnum = pgEnum("project_status", ["pending", "active", "completed", "cancelled"]);
export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted", "declined"]);
export const milestoneStatusEnum = pgEnum("milestone_status", ["pending", "in_progress", "submitted", "approved", "rejected"]);
export const virtualAccountTypeEnum = pgEnum("virtual_account_type", ["client_project", "contractor_payout", "supplier_payout"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["inbound", "milestone_payout", "marketplace_payment", "withdrawal", "bank_transfer"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "success", "failed", "refunded"]);
export const quoteStatusEnum = pgEnum("quote_status", ["pending", "responded", "accepted", "declined", "paid"]);
export const reviewSourceTypeEnum = pgEnum("review_source_type", ["milestone", "marketplace"]);
export const reconciliationStatusEnum = pgEnum("reconciliation_status", ["pending", "matched", "underpaid", "overpaid"]);
// ─── Users & Profiles ───────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  supabaseId: text("supabase_id").notNull().unique(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  phone: text("phone"),
  transactionPinHash: text("transaction_pin_hash"),
  role: userRoleEnum("role").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const clientProfiles = pgTable("client_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  country: text("country"),
  avatarUrl: text("avatar_url"),
  nin: text("nin"),
  ninVerified: boolean("nin_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contractorProfiles = pgTable("contractor_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  nin: text("nin"),
  ninVerified: boolean("nin_verified").default(false),
  specialty: text("specialty").notNull(),
  state: text("state").notNull(),
  city: text("city").notNull(),
  yearsExp: integer("years_exp").default(0),
  workPreference: text("work_preference"),
  teamSize: text("team_size"),
  bio: text("bio"),
  rating: numeric("rating", { precision: 3, scale: 2 }).default("0"),
  reviewCount: integer("review_count").default(0),
  isAvailable: boolean("is_available").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supplierProfiles = pgTable("supplier_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  businessName: text("business_name").notNull(),
  businessType: text("business_type").notNull(),
  state: text("state").notNull(),
  city: text("city").notNull(),
  citiesServed: text("cities_served").array(),
  supplyCategories: text("supply_categories").array(),
  description: text("description"),
  cacNumber: text("cac_number"),
  cacDocumentUrl: text("cac_document_url"),
  cacVerified: boolean("cac_verified").default(false),
  rating: numeric("rating", { precision: 3, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Projects ────────────────────────────────────────
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => users.id),
  contractorId: uuid("contractor_id").references(() => users.id),
  name: text("name").notNull(),
  type: projectTypeEnum("type").notNull(),
  status: projectStatusEnum("status").default("pending"),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  budget: numeric("budget", { precision: 15, scale: 2 }),
  description: text("description"),
  startDate: date("start_date"),
  landDocUrl: text("land_doc_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectInvites = pgTable("project_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  contractorId: uuid("contractor_id").references(() => users.id), // ← remove .notNull()
  invitedEmail: text("invited_email"),                            // ← ADD THIS
  status: inviteStatusEnum("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Milestones ──────────────────────────────────────
export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  orderIndex: integer("order_index").notNull(),
  status: milestoneStatusEnum("status").default("pending"),
  allocatedAmount: numeric("allocated_amount", { precision: 15, scale: 2 }),
  resubmitCount: integer("resubmit_count").default(0),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  nombaPaymentRef: text("nomba_payment_ref"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const milestoneImages = pgTable("milestone_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  milestoneId: uuid("milestone_id").notNull().references(() => milestones.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  storageUrl: text("storage_url").notNull(),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  locationName: text("location_name"),
  takenAt: timestamp("taken_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const siteCheckIns = pgTable("site_check_ins", {
  id: uuid("id").primaryKey().defaultRandom(),
  milestoneId: uuid("milestone_id").notNull().references(() => milestones.id),
  contractorId: uuid("contractor_id").notNull().references(() => users.id),
  checkInTime: timestamp("check_in_time"),
  checkInLat: numeric("check_in_lat", { precision: 10, scale: 7 }),
  checkInLng: numeric("check_in_lng", { precision: 10, scale: 7 }),
  checkInLocation: text("check_in_location"),
  checkOutLocation: text("check_out_location"),
  checkOutTime: timestamp("check_out_time"),
  checkOutLat: numeric("check_out_lat", { precision: 10, scale: 7 }),
  checkOutLng: numeric("check_out_lng", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contractorPortfolios = pgTable("contractor_portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractorId: uuid("contractor_id").notNull().references(() => users.id),
  projectType: text("project_type").notNull(),
  location: text("location").notNull(),
  description: text("description"),
  photos: text("photos").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => users.id),
  projectId: uuid("project_id").references(() => projects.id),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  state: text("state"),
  city: text("city"),
  budgetType: text("budget_type").notNull(),
  budgetAmount: numeric("budget_amount", { precision: 15, scale: 2 }),
  startDate: date("start_date"),
  expectedCompletionDate: date("expected_completion_date"),
  attachments: text("attachments").array(),
  requireVerifiedPros: boolean("require_verified_pros").default(false),
  minimumRating: numeric("minimum_rating", { precision: 3, scale: 2 }),
  status: text("status").default("open"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Money: Virtual Accounts, Transactions, Bank Accounts ──
export const virtualAccounts = pgTable("virtual_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  projectId: uuid("project_id").references(() => projects.id),
  nombaAccountId: text("nomba_account_id").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  bankName: text("bank_name").notNull(),
  balance: numeric("balance", { precision: 15, scale: 2 }).default("0"),
  type: virtualAccountTypeEnum("type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  userIdUnique: unique("va_user_id_unique").on(t.userId),
}));

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromAccountId: uuid("from_account_id").references(() => virtualAccounts.id),
  toAccountId: uuid("to_account_id").references(() => virtualAccounts.id),
  userId: uuid("user_id").references(() => users.id),
  type: transactionTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  fee: numeric("fee", { precision: 15, scale: 2 }).default("0"),
  status: transactionStatusEnum("status").default("pending"),
  milestoneId: uuid("milestone_id").references(() => milestones.id),
  expectedAmount: numeric("expected_amount", { precision: 15, scale: 2 }),          // ← NEW
  reconciliationStatus: reconciliationStatusEnum("reconciliation_status"),          // ← NEW
  narration: text("narration"),
  nombaRef: text("nomba_ref"),
  merchantTxRef: text("merchant_tx_ref").unique(),
  recipientBank: text("recipient_bank"),
  recipientAcct: text("recipient_acct"),
  recipientName: text("recipient_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const savedBankAccounts = pgTable("saved_bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  bankName: text("bank_name").notNull(),
  bankCode: text("bank_code").notNull(),
  accountNum: text("account_num").notNull(),
  accountName: text("account_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Marketplace ─────────────────────────────────────
export const catalogueItems = pgTable("catalogue_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  listedPrice: numeric("listed_price", { precision: 15, scale: 2 }),
  description: text("description"),
  imageUrl: text("image_url"),
  sku: text("sku"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const quoteRequests = pgTable("quote_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => users.id),
  supplierId: uuid("supplier_id").notNull().references(() => users.id),
  catalogueItemId: uuid("catalogue_item_id").references(() => catalogueItems.id),
  quantity: integer("quantity").notNull(),
  deliveryAddress: text("delivery_address"),
  clientNote: text("client_note"),
  status: quoteStatusEnum("status").default("pending"),
  quotedPrice: numeric("quoted_price", { precision: 15, scale: 2 }),
  deliveryTimeline: text("delivery_timeline"),
  supplierNote: text("supplier_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Reviews & Notifications ─────────────────────────
export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewerId: uuid("reviewer_id").notNull().references(() => users.id),
  revieweeId: uuid("reviewee_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  sourceType: reviewSourceTypeEnum("source_type"),
  sourceId: uuid("source_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").default(false),
  isRead: boolean("is_read").default(false).notNull(),
  linkTo: text("link_to"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});