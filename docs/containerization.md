# Containerization

## Container Strategy

Prefer Podman for its default non-root execution environment.

Support Podman and Docker in the helper scripts.

### Single-Service Projects (e.g., fluent-web)

- Do not use compose

### Multi-Service Projects (e.g., fluent-ai, fluent-api)

- Use compose for Docker
- Use podman pods
- Do not use podman-compose
- All helper script commands should:
  - Handle all services by default (`./<script> up`)
  - Handle specific services by specification (`./<script> up <service>`)
  - Avoid port collisions with default port values
- Seed DB on start so that local development with a single project works
  - For example, AI and API projects should scaffold a PostgreSQL service

### Fluent-Platform

- Be the orchestrator and work with the other codebase scripts
