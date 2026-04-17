# The Next Big Thing Theory

AI-powered market strategy analysis platform that generates Blue Ocean Strategy opportunities with evidence-based insights.

## Overview

This MVP analyzes a business, maps its current strategic position, compares it to competitors, and generates three distinct "next big thing" strategic directions using Blue Ocean Strategy principles.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **Database**: SQLite (local file) with Drizzle ORM
- **Validation**: Zod
- **Charts**: Recharts
- **AI**: Together.ai integration

## Project Structure

```
├── app/
│   ├── api/
│   │   └── projects/
│   │       ├── route.ts                 # POST/GET projects
│   │       └── [id]/
│   │           ├── route.ts            # GET/DELETE project
│   │           ├── analyze/route.ts    # Analysis pipeline
│   │           ├── canvas/route.ts     # Strategy canvas data
│   │           ├── report/route.ts    # Final report
│   │           ├── rescore/route.ts   # Rescore factors
│   │           └── next-big-thing/route.ts
│   ├── components/
│   │   ├── StrategyCanvas.tsx
│   │   ├── NextBigThingOptions.tsx
│   │   └── ReportView.tsx
│   ├── projects/
│   │   ├── page.tsx                   # Projects list
│   │   ├── new/page.tsx               # New project form
│   │   └── [id]/page.tsx              # Project detail
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                        # Landing page
├── lib/
│   ├── db/
│   │   ├── client.ts                  # Database client
│   │   └── schema.ts                  # Drizzle schema
│   ├── services/
│   │   ├── ai-service.ts             # AI model abstraction
│   │   └── db-service.ts              # Database operations
│   ├── types/
│   │   └── domain.ts                  # Shared TypeScript types
│   └── pipeline/
│       └── pipeline.ts
├── drizzle.config.ts
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Together.ai API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd the-next-big-thing-theory
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env.local
```

4. Edit `.env.local` and add your Together.ai API key:
```env
TOGETHER_API_KEY=your_api_key_here
AI_MODEL_SUMMARY=meta-llama/Meta-Llama-3-70B-Instruct-Turbo
AI_MODEL_ANALYSIS=meta-llama/Meta-Llama-3-70B-Instruct-Turbo
AI_MODEL_STRATEGY=meta-llama/Meta-Llama-3-70B-Instruct-Turbo
DATABASE_URL=./db.sqlite
```

5. Generate database schema:
```bash
npm run db:generate
```

6. Push schema to database:
```bash
npm run db:push
```

7. Start the development server:
```bash
npm run dev
```

8. Open [http://localhost:3000](http://localhost:3000)

## Database Setup (SQLite)

The project uses SQLite as a local file-based database. The database file (`db.sqlite`) is created automatically when you run the push command.

### Database Commands

```bash
# Generate migration files
npm run db:generate

# Push schema to database
npm run db:push

# Open Drizzle Studio (database GUI)
npm run db:studio
```

## Switching to Turso/Postgres

The database layer is abstracted to support easy migration:

### To Turso (SQLite in the cloud)

1. Install Turso CLI and create a database:
```bash
curl -fsSL https://tursodatabase.com/install.sh | sh
turso db create next-big-thing-theory
turso db show next-big-thing-theory --url
```

2. Update `.env.local`:
```env
DATABASE_URL=https://your-database-name.turso.io
TURSO_AUTH_TOKEN=your_auth_token
```

3. Install libSQL client:
```bash
npm install @libsql/client
```

### To Postgres (via Drizzle)

1. Install Postgres driver:
```bash
npm install postgres
```

2. Update `drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
```

3. Update `lib/db/client.ts`:
```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || "";
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | POST | Create new project |
| `/api/projects` | GET | List all projects |
| `/api/projects/:id` | GET | Get project details |
| `/api/projects/:id` | DELETE | Delete project |
| `/api/projects/:id/analyze` | POST | Start analysis pipeline |
| `/api/projects/:id/canvas` | GET | Get strategy canvas data |
| `/api/projects/:id/report` | GET | Get final report |
| `/api/projects/:id/rescore` | POST | Update factor scores |
| `/api/projects/:id/next-big-thing` | GET | Get strategy options |

## Analysis Pipeline

The analysis runs through these stages:

1. **Business Research** - AI gathers info about the business
2. **Competitor Discovery** - Find direct competitors
3. **Competitor Normalization** - Deduplicate and organize
4. **Factor Generation** - Create strategy canvas factors
5. **Company Scoring** - Score each company on factors
6. **Strategy Canvas** - Generate visual canvas
7. **Next Big Thing** - Create 3 strategic options
8. **Report Assembly** - Compile final report

## Deployment to Netlify

This project is designed for Netlify deployment:

1. Push to GitHub
2. Connect repository in Netlify
3. Set environment variables in Netlify dashboard:
   - `TOGETHER_API_KEY`
   - `AI_MODEL_SUMMARY`
   - `AI_MODEL_ANALYSIS`
   - `AI_MODEL_STRATEGY`
4. Deploy

### Netlify Configuration

Create `netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

## Cost Considerations

AI costs are tracked per analysis run. Monitor costs by checking the `costCents` field in analysis runs.

Model costs (Together.ai, approximate):
- Llama 3 70B: $0.90/1M tokens (input/output)

## License

MIT