<div align="center">
  <h1>🏗️ BuildSpora Backend API</h1>
  <p>The robust, scalable, and secure backend powering the BuildSpora platform. Connecting clients, contractors, and suppliers seamlessly through milestones and secure payments.</p>

  <p>
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
    <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  </p>
</div>

---

## 📖 Table of Contents
- [Overview](#overview)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Core Workflows](#core-workflows)
- [Database Schema Outline](#database-schema-outline)
- [Environment Variables](#environment-variables)
- [Installation & Setup](#installation--setup)
- [API Documentation](#api-documentation)
- [Security & Rate Limiting](#security--rate-limiting)
- [Available Scripts](#available-scripts)
- [Contributing](#contributing)

---

## 📖 Overview

The **BuildSpora Backend** handles complex business logic involving multi-party authentication (Clients, Contractors, Suppliers), project lifecycle management (Invites -> Milestones -> Approvals), secure Escrow-like payment flows via Nomba, real-time WebSocket notifications, and cloud file management.

---

## 💻 Architecture & Tech Stack

- **Framework:** Node.js (v18+) with Express.js.
- **Language:** Fully typed with TypeScript.
- **Database:** PostgreSQL hosted on [Neon Serverless](https://neon.tech/), interfaced via [Drizzle ORM](https://orm.drizzle.team/).
- **Authentication:** [Supabase Auth](https://supabase.com/) issues JWTs; Express validates them via `authMiddleware`.
- **Payments:** [Nomba](https://nomba.com/) is used to generate Virtual Accounts per project/user, handle incoming funds via Webhooks, and process outbound bank transfers.
- **Caching & Limiting:** [Upstash Redis](https://upstash.com/) for global rate-limiting and fast caching.
- **Media Storage:** [Cloudinary](https://cloudinary.com/) for profile avatars, milestone progress photos, and receipts.
- **Communication:** Brevo, Resend, and ElasticEmail for OTPs and notifications. WebSockets (`ws`) for real-time in-app alerts.

---

## 🔄 Core Workflows

### 💳 The Payment & Milestone Flow
1. A **Project** is created by a Client. A Contractor accepts an **Invite**.
2. A **Virtual Account** is generated via Nomba and mapped to the Project/Client.
3. The Client transfers money into the Virtual Account. Nomba hits the `/webhooks/nomba` endpoint, and the funds are credited as `inbound` **Transactions**.
4. The Client creates **Milestones** (e.g., "Foundation Level").
5. The Contractor submits the milestone (with photos). 
6. The Client **approves** the milestone (requiring a secure Transaction PIN validation).
7. The system moves funds from the Project Virtual Account to the Contractor's Virtual Account (`milestone_payout`).
8. The Contractor can withdraw funds to their actual Bank Account (`withdrawal` via Nomba's bank transfer API).

---

## 🗄️ Database Schema Outline

Key tables managed by Drizzle ORM:
- **`users`**: Base table for Supabase ID mappings, email, roles (`client`, `contractor`, `supplier`), and `transaction_pin_hash`.
- **`client_profiles`, `contractor_profiles`, `supplier_profiles`**: Role-specific profile data (NIN, avatars, ratings, specialties).
- **`projects`**: Core entity linking a client to a contractor, storing budgets, start dates, and status.
- **`project_invites`**: State machine for inviting contractors (`pending`, `accepted`, `declined`).
- **`milestones`**: Tied to projects. Tracks budget, dates, and status (`pending`, `in_progress`, `submitted`, `approved`).
- **`virtual_accounts`**: Stores Nomba account references, names, and balances linked to projects/users.
- **`transactions`**: Immutable ledger tracking all money movement.
- **`notifications`**: Real-time app alerts.

---

## 🔐 Environment Variables

Create a `.env` file based on `.env.example`.

```env
# Server
PORT=3000
NODE_ENV=development

# Database (Neon Serverless)
DATABASE_URL="postgres://user:pass@ep-rest-of-url.neon.tech/neondb"

# Supabase Auth
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_JWT_SECRET="your-jwt-secret"

# Redis (Upstash)
UPSTASH_REDIS_REST_URL="https://your-upstash.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"

# Nomba (Payments)
NOMBA_BASE_URL="https://api.nomba.com/v1"
NOMBA_CLIENT_ID="your-client-id"
NOMBA_PRIVATE_KEY="your-private-key"
NOMBA_ACCOUNT_ID="your-parent-account-id"

# Cloudinary
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-secret"
```

---

## 🛠️ Installation & Setup

1. **Clone & Install:**
   ```bash
   git clone <repo-url>
   cd Backend
   npm install
   ```

2. **Database Push:**
   Once `.env` is set, push the Drizzle schema to your Postgres DB:
   ```bash
   npm run db:push
   ```

3. **Start the Server:**
   ```bash
   npm run dev
   ```

---

## 📡 API Documentation

Below is a high-level overview of the most critical endpoints.

### Authentication (`/api/auth`)
- `POST /signup` - Registers a user via Supabase and creates their base profile in the DB.
- `POST /signin` - Authenticates user.
- `POST /forgot-password` - Triggers OTP flow.
- `POST /reset-password` - Validates OTP and updates password.

### User & Profiles (`/api/users`)
- `GET /me` - Returns safe user data (excluding PIN hash) and specific role profiles.
- `PATCH /profile` - Updates role-specific details (e.g., Contractor specialty).
- `POST /avatar` - Uploads Avatar to Cloudinary.

### Payments (`/api/payments`)
*Note: All sensitive payment endpoints require PIN validation and are heavily rate-limited.*
- `GET /banks` - Returns a list of supported Nigerian banks.
- `POST /set-pin` / `POST /reset-pin` - Manages transaction PINs via bcrypt hashing.
- `POST /generate-account` - Creates a Virtual Account for a user/project.
- `POST /fund-milestone` - Creates an intent to fund.
- `POST /approve-milestone/:id` - Securely releases funds for a completed milestone.
- `POST /withdraw` - Initiates a withdrawal to an external bank.
- `GET /receipt/:id` - Generates a PDF receipt for a transaction.

### Webhooks (`/api/webhooks`)
- `POST /nomba` - Receives real-time payment notifications. Reconciles and credits `Virtual Accounts` automatically.

---

## 🛡️ Security & Rate Limiting

1. **Authentication Middleware (`authMiddleware`)**: Verifies Supabase JWTs and injects the user ID into `req.user`.
2. **Transaction PINs**: Approving milestones or withdrawing funds requires a 4-6 digit PIN, distinct from the user's login password.
3. **Rate Limiters**: 
   - `authRateLimiter` restricts brute-forcing logins.
   - `pinRateLimiter` restricts brute-forcing transaction PINs.
   - Powered by **Upstash Redis** to easily scale horizontally across serverless environments.
4. **Error Logging**: Centralized error logging prevents sensitive stack traces from leaking to the client in production.

---

## 📜 Available Scripts

- `npm run dev` - Starts development server with hot reload (`tsx`).
- `npm run build` - Compiles TypeScript to `dist/`.
- `npm start` - Starts production server.
- `npm run db:generate` - Generates SQL migrations.
- `npm run db:push` - Directly pushes schema to the database (good for rapid prototyping).
- `npm run db:studio` - Launches Drizzle Studio on `localhost:4983` to visually explore the database.

---
<div align="center">
  <p>Built with ❤️ by the BuildSpora Team.</p>
</div>