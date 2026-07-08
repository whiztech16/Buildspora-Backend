# BuildSpora Backend Documentation

## Demo Access

Thank you for reviewing BuildSpora. To explore the platform without creating a new account, please use the demo credentials below.

### Live Application
- **Frontend**: [https://buildspora.vercel.app/](https://buildspora.vercel.app/)
- **Backend API**: [https://buildspora-backend.onrender.com](https://buildspora-backend.onrender.com)

### Getting Started
1. Open the BuildSpora application.
2. Click **Start Project** on the landing page.
3. On the Role Selection screen, click the **Sign In** link located below the available roles.
4. Sign in using one of the demo accounts below.

### Demo Accounts

#### Client Account
- **Email**: `fortuneokpara7@gmail.com`
- **Password**: `Nkemakolam@19`

**Use this account to:**
- Create and manage construction projects
- Fund projects using Virtual Accounts
- Monitor milestone progress
- Review submitted milestones
- Approve or reject milestone submissions
- Make contractor or supplier payments
- View reconciliation reports and project dashboards

#### Contractor Account
- **Email**: `ssgstoresnoreply@gmail.com`
- **Password**: `Nkemakolam`

**Use this account to:**
- View assigned projects
- Submit milestones
- Upload live site progress (where implemented)
- Track milestone status
- Receive payments
- Withdraw available funds

---

## Project Overview

### What the application does
BuildSpora is a construction project management and financial escrow platform that connects clients, contractors, and suppliers. It facilitates the creation of construction projects, tracks progress via milestones and site check-ins, and manages payments securely through dedicated virtual bank accounts.

### Problem it solves
The platform solves the critical issues of trust, transparency, and accountability in construction projects. It ensures that clients only release funds when verifiable progress (milestones) is made, and contractors are guaranteed payment for completed work. Site check-ins and photo uploads with geolocation data prevent fraudulent progress claims.

### Target users
- **Clients**: Individuals or entities looking to fund and oversee construction or renovation projects.
- **Contractors**: Construction professionals and companies executing the projects.
- **Suppliers**: Businesses that provide construction materials and equipment to contractors.

### Core features
- **Role-Based Accounts**: Distinct profiles for Clients, Contractors, and Suppliers.
- **Project & Milestone Management**: Detailed tracking of project phases and associated budgets.
- **Verifiable Site Check-ins**: Geolocation-tagged check-ins/check-outs and photo uploads for contractors.
- **Integrated Financial System**: Virtual bank accounts for users, secure milestone payouts, withdrawals, and bank transfers via Nomba.
- **Transaction PINs**: Enhanced security for approving payments and withdrawing funds.
- **Notifications & Invites**: Automated emails and in-app notifications for project invitations and status updates.

### Tech stack
- **Server Environment**: Node.js & Express.js
- **Database**: PostgreSQL (Neon Serverless)
- **ORM**: Drizzle ORM
- **Authentication**: Supabase Auth
- **File Storage**: Cloudinary (Avatars, Milestone Photos)
- **Payment Gateway**: Nomba (Virtual Accounts, Transfers)
- **Caching & Rate Limiting**: Upstash Redis
- **Email Delivery**: ElasticEmail / Resend
- **Validation**: Zod

---

## System Architecture

### Frontend-Backend Interaction
The client applications communicate with the backend via a RESTful API. Requests are secured using JWT access tokens issued by Supabase. Cross-Origin Resource Sharing (CORS) is configured to allow requests only from authorized origins (e.g., local development and Vercel production).

### Database Integration
The system relies on a relational PostgreSQL database hosted on Neon. **Drizzle ORM** is used for schema definition, migrations, and type-safe query execution. The schema enforces referential integrity across users, specific role profiles, projects, milestones, virtual accounts, and transactions.

### Authentication & Authorization
**Supabase** serves as the Identity Provider (IdP). When a user registers, an account is created in Supabase Auth, and a corresponding record is saved in the local `users` table along with their role-specific profile. Subsequent API requests include a Bearer Token which is verified by custom `authMiddleware`.

### Payment & Wallet Flow (Nomba Integration)
1. **Virtual Accounts**: When a user registers, they can generate a dedicated Nomba virtual bank account.
2. **Funding**: Clients transfer fiat to their virtual account to fund the project.
3. **Escrow/Milestone Payments**: Once a contractor completes a milestone and the client approves it using their Transaction PIN, the system moves funds from the client's virtual account to the contractor's virtual account.
4. **Withdrawals**: Contractors can withdraw their earned balance to an external bank account.

### Storage
Images (user avatars and site photos) are uploaded as `multipart/form-data` using `multer` (in memory). The buffer is securely streamed to **Cloudinary**, and the returned secure URL is stored in the PostgreSQL database along with associated metadata (e.g., geolocation for site photos).

---

## API Documentation

**Base URLs for Postman:**
- **Local Development**: `http://localhost:3000/api`
- **Production**: `https://<your-production-url>/api`

All endpoints listed below are relative to this Base URL. For example, to hit the `Sign Up` endpoint locally in Postman, you would use:
`http://localhost:3000/api/auth/signup`

Endpoints requiring authentication must include the header: `Authorization: Bearer <token>`.

### 1. Authentication Routes (`/api/auth`)

#### Sign Up
- **Method**: `POST`
- **Endpoint**: `/signup`
- **Description**: Registers a new user and creates their role-specific profile.
- **Authentication Required**: No
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword",
    "fullName": "John Doe",
    "role": "client", // "client" | "contractor" | "supplier"
    "phone": "+1234567890",
    "specialty": "Plumbing", // Required for contractor
    "state": "Lagos", // Required for contractor/supplier
    "city": "Ikeja", // Required for contractor/supplier
    "businessName": "Doe Supplies", // Required for supplier
    "businessType": "Hardware" // Required for supplier
  }
  ```
- **Response**: `201 Created` - `{ "success": true, "message": "Account created successfully." }`

#### Sign In
- **Method**: `POST`
- **Endpoint**: `/signin`
- **Description**: Authenticates a user and returns a session token.
- **Authentication Required**: No
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword"
  }
  ```
- **Response**: `200 OK` - Returns JWT token and user details.

#### Forgot Password
- **Method**: `POST`
- **Endpoint**: `/forgot-password`
- **Description**: Sends a password reset OTP to the user's email.
- **Authentication Required**: No
- **Request Body**: `{ "email": "user@example.com" }`
- **Response**: `200 OK`

#### Reset Password
- **Method**: `POST`
- **Endpoint**: `/reset-password`
- **Description**: Resets the user's password using the OTP.
- **Authentication Required**: No
- **Request Body**: `{ "email": "user@example.com", "otp": "123456", "newPassword": "newpassword123" }`
- **Response**: `200 OK`

---

### 2. User Routes (`/api/user`)

#### Get Current User Profile
- **Method**: `GET`
- **Endpoint**: `/me`
- **Description**: Fetches the authenticated user's base info and role-specific profile.
- **Authentication Required**: Yes
- **Response**: `200 OK` - `{ "success": true, "user": {...}, "profile": {...} }`

#### Update Profile
- **Method**: `PATCH`
- **Endpoint**: `/profile`
- **Description**: Updates the user's profile and saves bank details if provided.
- **Authentication Required**: Yes
- **Request Body**: Varied based on role (e.g., `fullName`, `phone`, `bio`, `bankName`, `accountNum`, etc.)
- **Response**: `200 OK` - Returns updated profile.

#### Upload Avatar
- **Method**: `POST`
- **Endpoint**: `/avatar`
- **Description**: Uploads a profile picture to Cloudinary.
- **Authentication Required**: Yes
- **Request Body**: `multipart/form-data` with `avatar` field.
- **Response**: `200 OK` - `{ "success": true, "avatarUrl": "https://..." }`

---

### 3. Project Routes (`/api/projects`)

#### Create Project
- **Method**: `POST`
- **Endpoint**: `/`
- **Description**: Creates a new project and initializes its milestones. Only clients can create projects.
- **Authentication Required**: Yes
- **Request Body**:
  ```json
  {
    "name": "Luxury Villa",
    "type": "new_build", // "new_build" | "renovation"
    "address": "123 Main St",
    "city": "Lagos",
    "state": "Lagos",
    "description": "A 5-bedroom villa",
    "milestoneBudgets": {
      "Foundation": 500000,
      "Roofing": 300000
    }
  }
  ```
- **Response**: `201 Created` - Returns created project and milestones.

#### Get User Projects
- **Method**: `GET`
- **Endpoint**: `/`
- **Description**: Fetches all projects associated with the authenticated user (client or contractor).
- **Authentication Required**: Yes
- **Response**: `200 OK` - List of projects.

#### Get Project Details
- **Method**: `GET`
- **Endpoint**: `/:id`
- **Description**: Fetches project details along with its milestones.
- **Authentication Required**: Yes
- **Response**: `200 OK` - Project and ordered milestones array.

---

### 4. Milestone Routes (`/api/milestones`)

#### Get Milestone Details
- **Method**: `GET`
- **Endpoint**: `/:id`
- **Description**: Fetches details, uploaded photos, and site check-ins for a milestone.
- **Authentication Required**: Yes
- **Response**: `200 OK` - Milestone details including images and check-ins (with Google Maps URLs).

#### Site Check-In
- **Method**: `POST`
- **Endpoint**: `/:id/checkin`
- **Description**: Logs a contractor's arrival at the site with geolocation.
- **Authentication Required**: Yes
- **Request Body**: `{ "lat": 6.5244, "lng": 3.3792, "locationName": "Site Address" }`
- **Response**: `200 OK` - Check-in record.

#### Site Check-Out
- **Method**: `POST`
- **Endpoint**: `/:id/checkout`
- **Description**: Logs a contractor's departure from the site.
- **Authentication Required**: Yes
- **Request Body**: `{ "lat": 6.5244, "lng": 3.3792, "locationName": "Site Address" }`
- **Response**: `200 OK`

#### Upload Milestone Photo
- **Method**: `POST`
- **Endpoint**: `/:id/photos`
- **Description**: Uploads progress photos with geolocation data.
- **Authentication Required**: Yes
- **Request Body**: `multipart/form-data` with `photo` field, `lat`, `lng`, and `locationName`.
- **Response**: `200 OK`

#### Submit Milestone
- **Method**: `PUT`
- **Endpoint**: `/:id/submit`
- **Description**: Submits a milestone for client review. Requires at least one uploaded photo.
- **Authentication Required**: Yes
- **Response**: `200 OK`

#### Reject Milestone
- **Method**: `PUT`
- **Endpoint**: `/:id/reject`
- **Description**: Client rejects a submitted milestone with a reason.
- **Authentication Required**: Yes
- **Request Body**: `{ "reason": "Roofing materials are substandard." }`
- **Response**: `200 OK`

---

### 5. Payments Routes (`/api/payments`)

#### Generate Virtual Account
- **Method**: `POST`
- **Endpoint**: `/generate-account`
- **Description**: Generates a dedicated Nomba virtual bank account for the user.
- **Authentication Required**: Yes
- **Response**: `200 OK` - Virtual account details.

#### Set Transaction PIN
- **Method**: `POST`
- **Endpoint**: `/set-pin`
- **Description**: Sets the secure PIN for approving transactions.
- **Authentication Required**: Yes
- **Request Body**: `{ "pin": "1234", "confirmPin": "1234" }`
- **Response**: `200 OK`

#### Approve Milestone (Payout)
- **Method**: `POST`
- **Endpoint**: `/approve-milestone/:milestoneId`
- **Description**: Client approves a milestone, moving funds to the contractor's virtual account.
- **Authentication Required**: Yes
- **Request Body**: `{ "pin": "1234" }`
- **Response**: `200 OK`

#### Withdraw Funds
- **Method**: `POST`
- **Endpoint**: `/withdraw`
- **Description**: Withdraws funds from virtual account to saved external bank account.
- **Authentication Required**: Yes
- **Request Body**: `{ "amount": 50000, "pin": "1234" }`
- **Response**: `200 OK`

#### Send Money
- **Method**: `POST`
- **Endpoint**: `/send-money`
- **Description**: Transfers funds to any external bank account.
- **Authentication Required**: Yes
- **Request Body**: `{ "amount": 10000, "accountNumber": "0123456789", "accountName": "Jane Doe", "bankCode": "033", "bankName": "UBA", "narration": "Payment", "pin": "1234" }`
- **Response**: `200 OK`

#### Get Payments Summary
- **Method**: `GET`
- **Endpoint**: `/`
- **Description**: Retrieves virtual account balance and transaction history.
- **Authentication Required**: Yes
- **Response**: `200 OK` - Account balance and transaction list.

---

### 6. Invites Routes (`/api/invites`)

#### Create Invite
- **Method**: `POST`
- **Endpoint**: `/`
- **Description**: Client invites a contractor to a project via ID or email.
- **Authentication Required**: Yes
- **Request Body**: `{ "projectId": "uuid", "contractorId": "uuid", "email": "contractor@example.com" }`
- **Response**: `201 Created`

#### Get My Invites
- **Method**: `GET`
- **Endpoint**: `/`
- **Description**: Fetches pending project invitations for a contractor.
- **Authentication Required**: Yes
- **Response**: `200 OK`

#### Accept / Decline Invite
- **Method**: `PUT`
- **Endpoint**: `/:id/accept` OR `/:id/decline`
- **Description**: Contractor accepts or declines a project invitation.
- **Authentication Required**: Yes
- **Response**: `200 OK`

---

### 7. Notifications Routes (`/api/notifications`)

#### Get Notifications
- **Method**: `GET`
- **Endpoint**: `/`
- **Description**: Fetches user notifications (recent 50) and unread count.
- **Authentication Required**: Yes
- **Response**: `200 OK`

#### Mark as Read / Mark All as Read
- **Method**: `PUT`
- **Endpoint**: `/:id/read` OR `/read-all`
- **Description**: Marks specific or all notifications as read.
- **Authentication Required**: Yes
- **Response**: `200 OK`
