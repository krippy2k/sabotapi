# SabotAPI — Product Brief

## Project Overview

SabotAPI is a developer dashboard and dynamic mock API gateway that lets frontend teams unblock themselves while backend APIs are still in progress. Users define mock endpoints with custom JSON bodies and HTTP status codes, then route traffic through a proxy that can simulate real-world network pain—latency spikes and intermittent server errors—so frontends can be hardened before production.

## Target Audience

- Frontend engineers who need realistic API responses without waiting on backend delivery
- Full-stack and freelance developers building resilient UIs who want to prove proxy, async request control, and interceptor patterns
- Teams doing integration testing and chaos-style frontend validation

## Primary Benefits & Features

- **Rapid mock endpoint setup** — Define paths, response bodies, and status codes from a dashboard
- **Chaos injection** — Toggle controls for intentional failure modes, e.g. random ~2s delay or a configurable chance of `500 Internal Server Error`
- **Dynamic request handling** — Incoming requests (e.g. `GET /mock/user/1`) resolve against live dashboard configuration at request time
- **Frontend resilience testing** — Exercise loading states, retries, and error handling under degraded conditions without touching a real backend

## High-Level Tech & Architecture

| Layer | Stack | Role |
|-------|-------|------|
| Frontend | React | Configuration UI: endpoint forms, response editor, chaos toggles |
| Backend | Node.js + Express | Dynamic proxy; applies latency middleware and returns configured payloads |
| Data | Database | Persists endpoint definitions, response templates, and chaos settings |

**Request flow:** Client → Express proxy → load matching mock config from DB → apply delay/error middleware → respond with configured JSON and status code.
