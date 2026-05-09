---
title: Glossary
read_when: encountering a domain term
---

# Glossary

Project-specific definitions for terms used in the initiative. When a term in this glossary appears in a requirement, it carries this meaning unless the requirement explicitly says otherwise.

### Agent

An LLM-driven component that orchestrates tool usage, decides what to call next, and manages data flow between layers. Distinguished from a fixed procedural script: the agent decides the steps, not a hardcoded pipeline. See FR-011.

### Agent orchestration

The control discipline by which the agent (above) coordinates tool calls, pagination, and synthesis to produce a search response. Listed by the initiative as one of the required Neo workflow design patterns.

### MCP (Model Context Protocol) / tooling layer

The layer that exposes invocable tools to the agent through a documented interface. The initiative requires at least two tools — a web search tool and a data storage / retrieval tool — accessible through this layer. See FR-022. The implementation MAY be MCP servers, in-process tool handlers, or another agentic tool-calling mechanism, as long as the interface is documented.

### Contract / contract binding

An explicit, structured, reusable input/output schema at a layer boundary. The initiative requires four such contracts — UI ↔ API, API ↔ Agent, Agent ↔ Tools, Agent ↔ Data — see FR-021. "Contract binding" is the Neo workflow design pattern that names this discipline.

### Chunking

The strategy of splitting a query's result set into multiple stored partitions ("chunks") so that no single chunk holds the entire set. Defined by chunk size and chunk boundary criterion. See FR-017 and FR-019.

### Indexing

A lookup structure that maps a query, identifier, or filter to the chunk(s) that satisfy it, without scanning all chunks. See FR-016, FR-018, and FR-020.

### Citation / grounded citation

A reference marker tying a specific claim or bullet in the answer summary to a specific entry in the references list. "Grounded" means every material claim has at least one such reference. See FR-008.

### Reference entry

A structured record about a cited source, containing at minimum a title, a URL, and a one-line context. See FR-009.

### LIVE / HISTORY / BOOKMARK

The three named source types the user can switch between via the source filter bar (FR-003):

- **LIVE** — results produced by a fresh web search executed now (FR-012).
- **HISTORY** — searches and their results that the system previously persisted (FR-014).
- **BOOKMARK** — items the user has explicitly saved (FR-015).

### Neo workflow design patterns

The pattern vocabulary the initiative requires the architecture document to use (see constraints.md). Examples called out: contract binding, agent orchestration, data partitioning, tool abstraction. This is distinct from general application architecture patterns.

### Synthesis step

The agent activity (or a dedicated component invoked by the agent) that converts raw web search hits into the final summary + citations payload. See FR-013.

### Answer summary

The short, readable, query-addressing text returned alongside the results. The primary user-facing response. See FR-007 and FR-010.
