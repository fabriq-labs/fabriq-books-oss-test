# Chat Thread Persistence & UI

This document describes the **ChatGPT-style chat thread** feature added to Fabriq Books: server-side conversation history, a thread sidebar, and full-page dashboard chat layout.

**Last updated:** 2026-06-12

---

## Overview

Users can:

- Start a new financial inquiry from the dashboard or any page with chat
- See **past conversations** in a thread sidebar (only after they contain messages)
- **Switch threads** and restore full message history
- Use a **full-page chat layout** on the dashboard with the main nav minimized to icons

Agent responses still stream via the existing agent endpoint (`/api/agent/chat/stream`). Thread persistence is a separate layer that saves the full `UIMessage[]` after each turn.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  ChatShell (layout)                                              │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐ │
│  │ ChatThread   │  │ ChatUI                                    │ │
│  │ Sidebar      │  │  - useChat → /api/agent/chat/stream       │ │
│  │ (list/select)│  │  - onFinish → PUT /api/chat/:chatId         │ │
│  └──────────────┘  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   GET /api/chat                 chat_thread (PostgreSQL)
   POST /api/chat/threads
   GET /api/chat/:chatId
   PUT /api/chat/:chatId
```

| Layer | Role |
|-------|------|
| **Agent stream** | Real-time AI responses, tools, page context |
| **Chat thread API** | CRUD for conversation rows (`chat_thread` table) |
| **ChatShell** | Thread sidebar + active `ChatUI` instance |
| **ChatUI** | Composer, suggestions, message rendering, persistence hooks |

---

## Database

**Migration:** `backend/prisma/migration/add_chat_threads.sql`  
**Prisma model:** `chat_thread` in `backend/prisma/schema/data.prisma`

| Column | Purpose |
|--------|---------|
| `id` | Client-generated thread ID (e.g. `chat_<uuid>`) |
| `user_id` | Owner — all queries filter by authenticated user |
| `title` | Defaults to `New Financial Inquiry`; updated from first user message |
| `messages` | Full `UIMessage[]` as JSONB |
| `metadata` | Page context, entity ID/name at save time |
| `model_used` | Last model used |
| `total_tokens_used` | Accumulated token count |
| `created_at` / `updated_at` | Sorting and sidebar timestamps |

**Apply migration** (user runs manually):

```bash
psql "$DATABASE_URL" -f backend/prisma/migration/add_chat_threads.sql
```

---

## Backend API

**Router:** `backend/src/routes/chat.ts` (mounted at `/api/chat` in `backend/src/index.ts`)  
**Store:** `backend/src/lib/chat-store.ts`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/chat` | List threads for current user (**only threads with `message_count > 0`**, ordered by `created_at ASC` — first created stays first; updates do not reorder) |
| `POST` | `/api/chat/threads` | Create empty thread (idempotent if ID exists) |
| `GET` | `/api/chat/:chatId` | Load thread + messages |
| `PUT` | `/api/chat/:chatId` | Upsert full `messages[]`, derive title, merge metadata |
| `POST` | `/api/chat` | Separate simple streaming financial chat (`streamText`) — not used by main `ChatUI` |

**Title derivation:** First user message text, truncated to 60 characters (`deriveThreadTitle` in `chat-store.ts`).

---

## Frontend

### Key files

| File | Purpose |
|------|---------|
| `frontend-1/src/lib/chatThreadApi.ts` | API client (`list`, `create`, `load`, `save`) |
| `frontend-1/src/hooks/useChatThreads.ts` | Thread list state + `refresh` / `createThread` |
| `frontend-1/src/components/chat/ChatShell.tsx` | Thread sidebar + `ChatUI`; draft vs persisted threads |
| `frontend-1/src/components/chat/ChatThreadSidebar.tsx` | “New chat” / “New prompt”, thread list, collapse |
| `frontend-1/src/components/chat/ChatUI.tsx` | Composer, suggestions, load/save on `chatId` |
| `frontend-1/src/components/layout/AppLayout.tsx` | Full-page dashboard chat + minimized nav |

### Thread lifecycle

1. **Open chat** — `ChatShell` starts with a local draft ID (`chat_<uuid>`). No database row yet.
2. **Sidebar** — Shows only **New chat** plus threads that already have messages. Empty drafts are **not** listed.
3. **First message** — `ChatUI` calls `POST /api/chat/threads`, then streams via agent. On finish, `PUT /api/chat/:chatId` saves messages.
4. **Sidebar refresh** — `onThreadSaved` triggers `refresh()`; thread appears with title from the first user message.
5. **New chat** — New local draft ID; previous draft is discarded if never saved.
6. **Select thread** — `ChatUI` remounts (`key={activeChatId}`), loads history via `GET /api/chat/:chatId`.

### Persistence in ChatUI

- `ensureThreadExists()` — creates DB row on first send (does **not** refresh sidebar until save)
- `persistThread()` — `PUT` after each completed turn (`onFinish`)
- `metadata` saved: `pageContext`, `entityId`, `entityName`
- When `chatId` is set, messages are **not** synced through `ChatContext.messagesAi` (avoids cross-thread overwrites)

---

## UI / Layout

### Empty state (no messages)

- Centered heading: **“What can I help with?”**
- **Chat input** below the heading
- **Suggestion chips** below the input (context-aware via `getContextSuggestions`)
- Rounded pill input (`rounded-3xl`)

### Active conversation

- Scrollable messages in the middle
- Input bar pinned at the **bottom**
- Header shows thread title when messages exist

### Dashboard full-page mode (`fullPage` on `ChatShell`)

Used when chat is open on `/` (Fabriq, Requester, and PA dashboards):

| Behavior | Detail |
|----------|--------|
| **Nav sidebar** | Auto-collapses to icon rail; restores previous state when chat closes |
| **Main area** | Edge-to-edge (`p-0`), full height |
| **Thread panel** | Wider (`w-72`), “New prompt” button, “Chat history” label |
| **Composer** | Full-width (`sidebarMode={false}`) |

### Other routes

- Chat opens in a **right panel** (`AppLayout` / `PageLayout`) — **no thread sidebar**; only the composer
- Messages still persist to `chat_thread`; history is visible when you open full-page chat on the dashboard
- Dashboard nav is unchanged

---

## Where ChatShell is mounted

| Location | Mode |
|----------|------|
| `FabriqDashboard`, `RequestDashboard`, `ProcurementDashboardApproval` | `fullPage` when `isChatOpen` |
| `AppLayout` right aside | `compact` + `sidebarMode` |
| `PageLayout` right aside | `compact` + `sidebarMode` |
| `ChatDrawer` | Default (drawer; not wired in main `App.tsx` routes) |

---

## Setup & verification

```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend-1 && npm run dev

# Check threads (read-only)
DATABASE_URL=$(grep "^DATABASE_URL=" backend/.env | head -1 | sed 's/DATABASE_URL="//;s/"$//')
psql "${DATABASE_URL}" -c "
  SELECT id, title, jsonb_array_length(messages) AS msgs, updated_at
  FROM chat_thread
  ORDER BY updated_at DESC
  LIMIT 10;
"
```

**Manual test checklist**

1. Open dashboard → open chat → nav minimizes, full-page chat with input + suggestions
2. Send a message → thread appears in sidebar with derived title
3. Click **New chat** → fresh draft; old thread remains in list
4. Click past thread → messages reload
5. Navigate to another page → chat in right panel; dashboard widgets visible when chat closed

---

## Related docs

- [Agent conversational chat](./agent/15-CONVERSATIONAL_CHAT.md) — streaming, PageContext, session lifecycle, tool invocation rendering
- [Chat component internals](../frontend-1/src/components/chat/README.md) — `ChatUI`, tools, file attachments
- [AI agent overview](./AI_AGENT.md)
