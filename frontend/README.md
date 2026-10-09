# AgentFlow — Enterprise AI Agent Console

AgentFlow is a multi-tenant AI agent platform frontend for enterprise business administrators to monitor autonomous agent interactions, verify policy compliance gates, analyze foundation model token consumption, and audit real-time telemetry.

Built for business administrators with a **read-only monitoring and configuration console** experience inspired by leading B2B SaaS platforms (Linear, Vercel, Stripe).

---

## 🛠 Tech Stack

- **Framework**: React 19 + Vite 8
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite`
- **Routing**: `react-router-dom` v7
- **Authentication**: `amazon-cognito-identity-js` (via `USER_PASSWORD_AUTH` flow)
- **HTTP Client**: `axios` with interceptors for `Bearer` tokens, `X-Tenant-Id`, and automatic `401` session revocation
- **Icons**: `lucide-react`
- **Visual Analytics**: `recharts`
- **Animations & Microinteractions**: `framer-motion`

---

## 🚀 Quick Start & Run Instructions

### 1. Installation

Ensure Node.js (v18+) is installed. Navigate to the `frontend/` directory and install dependencies:

```bash
cd frontend
npm install
```

### 2. Configure Environment Variables

Copy the `.env.example` file to `.env`:

```bash
cp .env.example .env
```

Set your configuration values:

```env
# Backend FastAPI Gateway
VITE_API_BASE_URL=http://localhost:8000

# Amazon Cognito Configuration (USER_PASSWORD_AUTH flow)
VITE_COGNITO_USER_POOL_ID=us-east-1_examplePoolId
VITE_COGNITO_CLIENT_ID=exampleClientId1234567890
```

> **Demo / Local Mode**: If AWS Cognito credentials are not yet provisioned, you can log in immediately using the demo credentials provided in the console UI:
> - **Email**: `admin@demo.com`
> - **Password**: Any demo password (e.g., `DemoPassword123!`)
> - **Tenant ID**: `boc-tenant-01` (Bank of Commerce)

### 3. Start Local Development Server

```bash
npm run dev
```

Vite will start the dev server at `http://localhost:5173`.

### 4. Build for Production

```bash
npm run build
```

The optimized static production assets will be built in the `dist/` directory.

To preview the production build locally:

```bash
npm run preview
```

---

## 🔐 Authentication & API Integration

- **Cognito Integration**: Uses `amazon-cognito-identity-js` with `USER_PASSWORD_AUTH` flow (no SRP required).
- **Session Tokens**: On successful authentication, stores `id_token`, expiration timestamp, and `tenant_id` (extracted from the `custom:tenant_id` JWT claim).
- **Request Headers**: All outgoing requests made via `src/api/client.js` automatically append:
  ```http
  Authorization: Bearer <id_token>
  X-Tenant-Id: <tenant_id>
  ```
- **Safe 401 Interceptor**: Any 401 Unauthorized response triggers immediate session revocation in `localStorage` and redirects the user safely to the login screen with an expiration alert.
- **Read-Only Informational Admin**: In compliance with enterprise isolation guidelines, user approval events are displayed as read-only informational entries representing user consent granted or rejected at the end-user website widget.

---

## 📂 File Architecture

```
frontend/src/
├── api/
│   └── client.js               # Central Axios client, interceptors & API methods
├── components/
│   ├── Login.jsx               # Cognito USER_PASSWORD_AUTH login card
│   ├── Navbar.jsx              # Sticky header with tenant badge & dark mode toggle
│   ├── Sidebar.jsx             # Left navigation (5 exact items)
│   ├── SummaryCard.jsx         # Metric card with hover lift & subtle glow
│   ├── StatusBadge.jsx         # Badges for completed, pending (pulsing), rejected
│   ├── ActivityFeed.jsx        # Recent 10 executions feed
│   ├── LiveActivityTable.jsx   # Real-time executions table with filters
│   ├── ActivityDrawer.jsx      # Telemetry drawer (RAG chunks, tool calls, policy)
│   ├── AuditViewer.jsx         # Split-screen audit trail with 5s polling & JSON viewer
│   ├── TokenUsage.jsx          # Recharts token charts & per-model spend
│   └── Settings.jsx            # Tenant profile, model selector & embed snippet
├── pages/
│   ├── LoginPage.jsx           # Login route
│   ├── OverviewPage.jsx        # Dashboard summary, velocity line chart & distribution
│   ├── LiveActivityPage.jsx    # Real-time streaming table (5s polling)
│   ├── AuditPage.jsx           # Forensic timeline of agent events
│   ├── UsagePage.jsx           # Token metering & budget breakdown
│   └── SettingsPage.jsx        # Policy thresholds & chatbot widget embed script
├── context/
│   └── AuthContext.jsx         # Authentication, Cognito flow & theme state
├── App.jsx                     # Protected routing & main layout
├── main.jsx                    # Application entrypoint
└── index.css                   # Tailwind CSS v4 design tokens & glassmorphism
```
