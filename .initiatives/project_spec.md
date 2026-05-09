
## ✅ ACCEPTANCE CRITERIA

### UI Layer
- **App shell**: Fixed or sticky **top bar** with product title / context, global actions (e.g. refresh, settings placeholder), and consistent height and spacing.
- **Primary search controls**: Prominent **search bar** (full-width on mobile, constrained max-width on desktop), primary **Search** button or equivalent submit control, and visible loading state while the agent runs.
- **Source filters / tabs**: A **secondary bar** or segmented control with clear controls to switch or filter by source type; each option is a **button** or tab with icon + label:
  - `LIVE`
  - `HISTORY`
  - `BOOKMARK`
- **Results area**: Scrollable **results list** with card-style rows (title, summary snippet, domain or site name, **explicit link** to source). Empty and error states are designed (not a blank screen).
- **Pagination / loading**: Pagination controls **or** progressive / infinite loading; show page or “load more” affordances and **skeleton or spinner** during fetch.
- **Visual polish (“slick”)**: Coherent **color system**, **typography scale**, spacing rhythm, rounded corners or elevation on cards, hover/focus states on interactive elements, and responsive layout (readable from ~320px width upward). The UI should feel intentional and demo-ready, not a raw HTML list.

### Search answers (not “link dumps”)
- **Summarized response**: For each search, the system presents a **short, readable summary** (paragraph or bullet answer) that directly addresses the user’s query—**not** only a flat list of URLs.
- **Grounded citations**: Summary points are **tied to sources**: each material claim or bullet should reference **which web result** supports it (e.g. inline citation markers, footnotes, or a “Sources” block).
- **Structured references**: Each cited source entry includes at minimum: **title**, **URL**, and **one-line context** (why it was used or what it supports). Links are **stable, clickable references**, not opaque or duplicated “random” URLs without context.
- **Contracts**: The UI ↔ API contract includes fields for **answer_summary** (or equivalent) and **citations** / **references** so the generator can implement this consistently.

### Agent Layer (CRITICAL)
Search execution is agent-driven. Agents must:
- Orchestrate tool usage
- Control pagination / chunk retrieval
- Manage data flow between layers
- No “thin wrapper” APIs pretending to be agentic

### Web Search Integration
Must use a real web search tool/API. Must:
- Fetch live results
- Parse results into structured format
- Handle failures + retries
- **Produce answer-quality output**: The agent (or a dedicated synthesis step) turns raw hits into a **concise summary** with **explicit web references** (see “Search answers” under UI / product expectations above). Raw search results remain available for pagination and detail, but the primary user-facing response is **summarized and cited**, not an unordered link list.

### Data Layer
Must include:
1. History Store
  - Persist all searches + results
2. Bookmark Store
  - Allow saving + retrieving bookmarks
3. Indexed Search Cache
  - Store fetched web results
  - Must support retrieval by query

### Large Data Requirement (MANDATORY)
System must handle large result sets:
 - Simulate or fetch 1000+ results per query
Must:
  - Chunk data into partitions
  - Store as segmented JSON or indexed structure
  - Retrieve only relevant chunks

### Chunking + Indexing
Must demonstrate:
 - Chunking strategy (size, boundaries)
 - Indexing strategy (lookup method)
 - Retrieval efficiency (not full-scan)

### Contract Binding (MANDATORY)
System must use explicit contracts:
- Input/output contracts between:
  - UI ↔ Backend/API
  - Backend/API ↔ Agent layer
  - Agent layer ↔ Tools
  - Agent layer ↔ Data layer
Contracts must be:
- Structured
- Reusable
- Clearly defined

### MCP / Tooling Layer
Must include:
- At least 2 tools, such as:
  - Web search tool
  - Data storage/retrieval tool
Show:
- Tool interface design
- How agents invoke tools
- Error handling

### Architecture
Must demonstrate:
- Separation of concerns:
  - UI
  - Agent orchestration
  - Data layer
- Clear system boundaries
- Scalable design (not hardcoded flows)

---

## 📊 REQUIRED DELIVERABLES

1. Working System
- End-to-end functional prototype

2. Architecture Document
Must include:
- System diagram
- Data flow
- Agent interactions
- Tool interactions

3. Problem Decomposition (“Show Your Work”)
- Explicitly document:
  - How you broke down the problem
  - Why you chose your architecture
  - Tradeoffs considered

4. Agent Design
- Agent responsibilities
- How decisions are made
- How orchestration works

5. Data Strategy
- Chunking approach
- Indexing approach
- Storage format

6. Contracts
- Defined schemas
- Example payloads

7. Design Patterns Used (Workflow related)
This section refers specifically to **Neo workflow design patterns** used in your solution, not general application architecture patterns.
- Examples:
  - Contract binding
  - Agent orchestration
  - Data partitioning
  - Tool abstraction

8. Test Cases
- Must include:
  - Search returns live results
  - Response includes a **summary** plus **cited references** (titles + URLs + context), not only bare links
  - History persists + retrieves
  - Bookmarks persist + retrieve
  - Chunked data retrieval works
  - System handles large dataset without failure
  - UI: source filters/tabs, search bar + primary action, and pagination or progressive loading behave as specified

---

## 🚫 NON-ACCEPTABLE
- Pure “vibe-coded” outputs with no reasoning
- Hardcoded mock-only systems
- No agent orchestration
- No chunking/indexing
- No contracts
- Broken or non-functional PRs

---

## 🧪 EVALUATION CRITERIA
You will be assessed on:
- Does it work?
- Is it architecturally sound?
- Is it agentic or fake-agentic?
- Can it scale beyond demo size?
- Do you understand what you built?