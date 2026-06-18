# Fluent Web

A modern web application built with React, TypeScript, and TanStack Router.

## Features

- **Authentication**: better-auth integration with email/password login, password reset, and invitation-based onboarding
- **Modern UI**: Beautiful, responsive design with Tailwind CSS
- **Type Safety**: Full TypeScript support
- **Routing**: TanStack Router for type-safe routing
- **Internationalization**: i18next for multi-language support
- **State Management**: Zustand for global state
- **Form Validation**: Zod for schema validation
- **UI Components**: Radix UI primitives with custom styling
- **Containerized Development**: Docker/Podman support for consistent environments

## Authentication

Authentication is powered by [better-auth](https://www.better-auth.com/). The browser client lives in `src/lib/auth-client.ts` and talks to the better-auth server exposed by the Fluent API (configured via `VITE_BETTER_AUTH_URL`).

- **Login** (`/login`): email and password sign-in.
- **Password reset** (`/reset-password`): request a reset email, then set a new password.
- **Invitation onboarding** (`/accept-invitation`): new users join by accepting an emailed invitation — there is no self-service signup.
- **Sessions**: read the current session with `authClient.useSession()`, or use the `useAuth()` hook (`src/hooks/useAuth.ts`), which exposes `user`, `isAuthenticated`, `isLoading`, `login`, and `logout`.
- **Protected routes**: pages under the `_authenticated` layout route are guarded — unauthenticated visitors are redirected to `/login?returnTo=<url>`, where `returnTo` is the full URL they were trying to reach.

### Quick Start

1. Create a `.env` file with the required variables. At minimum you must set `VITE_API_URL`, `VITE_ENVIRONMENT`, `VITE_AQUIFER_API_URL`, `VITE_AQUIFER_API_KEY`, and `VITE_BETTER_AUTH_URL` — they are all validated at startup, and missing any of them fails with an "Invalid environment configuration" error. See [Environment Configuration](docs/environment-config.md) for the full list and how to manage per-environment files. To point the app at a better-auth server, set:

   ```env
   VITE_BETTER_AUTH_URL=http://localhost:9999/api/auth
   ```

2. Start the development server:

   ```bash
   pnpm dev
   ```

3. Visit `/login` to sign in.

## Development

### Prerequisites

- Node.js 24.13.x
- pnpm

### Installation

```bash
pnpm install
```

### Development Server

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Linting

```bash
pnpm lint
pnpm lint:fix
```

### Type Checking

```bash
pnpm typecheck
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── auth/           # Authentication components
│   └── ui/             # Base UI components
├── hooks/              # Custom React hooks
├── layouts/            # Page layouts
├── lib/                # Utility libraries
├── routes/             # Route definitions
├── store/              # Global state management
└── app.tsx             # Main app component
```

## Technologies

- **React 18** - UI framework
- **TypeScript** - Type safety
- **TanStack Router** - Type-safe routing
- **Tailwind CSS** - Styling
- **better-auth** - Authentication
- **Zustand** - State management
- **Zod** - Schema validation
- **i18next** - Internationalization
- **Vite** - Build tool
- **Docker/Podman** - Containerized development
- **ESLint** - Code linting
- **Prettier** - Code formatting

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: This project requires Node.js version 24.13.x
  - We recommend using [nvm (Node Version Manager)](https://github.com/nvm-sh/nvm) to manage Node.js versions
- **pnpm**: This project uses pnpm as the package manager

## Getting Started

Follow these steps to set up and run the project locally:

### 1. Clone the repository

```bash
git clone https://github.com/eten-tech-foundation/fluent-web.git
cd fluent-web
```

### 2. Set up Node.js version

The project uses Node.js 24.13.0 as specified in the `.nvmrc` file. If you're using nvm, run:

```bash
nvm install  # This will read the .nvmrc file and install the specified version
nvm use      # This will switch to the version specified in .nvmrc
```

### 3. Install dependencies

```bash
pnpm install
```

### 4. Start the development server

```bash
pnpm start
# or
pnpm dev
```

The application will be available at [http://localhost:5173](http://localhost:5173) by default.

## Containerized Development

This project supports containerized development using **Docker** or **Podman**. The container setup provides a consistent, isolated environment with hot-reload support.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) or [Podman](https://podman.io/getting-started/installation)
- No local Node.js installation required

### Quick Start with Containers

**Linux/macOS:**

```bash
# Initial setup - create .env file
./fweb.sh setup

# Start the containerized dev server
./fweb.sh up
```

**Windows (PowerShell):**

```powershell
# Initial setup - create .env file
.\fweb.ps1 setup

# Start the containerized dev server
.\fweb.ps1 up
```

The application will be available at [http://localhost:5173](http://localhost:5173).

### Container Commands

| Command        | Description                                    |
| -------------- | ---------------------------------------------- |
| `up`           | Build image and start container                |
| `down`         | Stop and remove container                      |
| `restart`      | Restart the container                          |
| `logs`         | Tail container logs                            |
| `status`       | Show container status                          |
| `shell`        | Open shell inside container                    |
| `test`         | Run test suite inside container                |
| `lint`         | Run ESLint inside container                    |
| `lint:fix`     | Run ESLint with auto-fix                       |
| `format`       | Format code with Prettier                      |
| `typecheck`    | Run TypeScript type checking                   |
| `precheck`     | Run all checks (lint, format, typecheck, test) |
| `preview`      | Preview production build                       |
| `clean`        | Remove container and volumes                   |
| `fresh`        | Complete reset (container, volumes, image)     |
| `build`        | Rebuild container image                        |
| `run <script>` | Run any pnpm script inside container           |

### Container Configuration

Configure the container via environment variables:

| Variable         | Default                 | Description           |
| ---------------- | ----------------------- | --------------------- |
| `CONTAINER_NAME` | `fluent-web`            | Container name        |
| `IMAGE_NAME`     | `fluent-web`            | Image name            |
| `PORT`           | `5173`                  | Host port to bind     |
| `VITE_API_URL`   | `http://localhost:9999` | API URL for the app   |
| `WEB_CONTEXT`    | project root            | Path for config files |

Example:

```bash
PORT=3000 VITE_API_URL=http://api.example.com ./fweb.sh up
```

### Container Features

- **Rootless execution**: Runs as non-root user (UID 1001)
- **Read-only filesystem**: Container root is read-only with tmpfs for `/tmp`
- **Security hardened**: Drops all capabilities, prevents privilege escalation
- **Volume caching**: `node_modules` and cache directories are persisted in named volumes
- **Hot reload**: Source code changes are reflected immediately

### Troubleshooting Containers

**Port already in use:**

```bash
PORT=3000 ./fweb.sh up  # Use a different port
```

**Container fails to start:**

```bash
./fweb.sh fresh  # Complete rebuild from scratch
```

**Check container logs:**

```bash
./fweb.sh logs
```

## Available Scripts

### Development

- `pnpm start` or `pnpm dev` - Start the development server
- `pnpm preview` - Preview the production build

### Build

- `pnpm build` - Build the application for production
- `pnpm build:analyze` - Build with bundle analysis

### Environment Configuration

- `pnpm set-env <environment>` - Switch between environments (local, development, staging, production)

See [Environment Configuration](docs/environment-config.md) for detailed documentation on how to set up and use environment variables.

### Code Quality

- `pnpm lint` - Run ESLint to check for code issues
- `pnpm lint:fix` - Run ESLint and automatically fix issues
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check formatting without making changes
- `pnpm typecheck` - Run TypeScript type checking

### Dependencies

- `pnpm deps:clean` - Prune and reinstall dependencies
- `pnpm deps:reset` - Remove node_modules and lock file, then reinstall

## Development Guidelines

- This project uses TypeScript for type safety
- We follow ESLint and Prettier for code quality and formatting
- Git commits are checked using Husky and lint-staged
- The project enforces the Node.js version specified in `.nvmrc` and package.json
- Line endings are standardized to LF (Unix-style) via:
  - `.gitattributes`: Enforces LF line endings in Git
  - `.editorconfig`: Sets consistent coding styles across editors
  - `.prettierrc.js`: Configures Prettier to use LF
  - VS Code settings: Configures the editor to use LF
  - Husky pre-commit hook: Automatically converts CRLF to LF

### Git Line Ending Configuration

This project enforces consistent line endings (LF) across all platforms to prevent issues with mixed line endings, especially on cross-platform teams.

#### Automatic Protection

We have multiple layers of protection against line ending issues:

1. **`.gitattributes` file**: Enforces LF line endings for all text files
2. **Pre-commit hook**: Automatically converts CRLF to LF for staged files before commit

#### Setup for Windows Users

Windows users should configure Git to respect the `.gitattributes` file by running:

```bash
git config --global core.autocrlf false
git config --global core.eol lf
```

#### Troubleshooting Line Endings

If you experience line ending issues:

1. Check file status with:

   ```bash
   git ls-files --eol | grep -E 'w/(mixed|crlf)'
   ```

2. If you need to fix line endings for the entire repository:

   ```bash
   # First commit or stash your changes
   git rm --cached -r .
   git reset --hard
   git add .
   git commit -m "Normalize line endings"
   ```

3. For new clones, after configuring Git as above:
   ```bash
   git clone --config core.autocrlf=false <repository-url>
   ```

## Troubleshooting

### Node.js Version Issues

If you encounter errors related to Node.js version:

```bash
# Make sure you're using the correct Node.js version
nvm use
# Or install it if not available
nvm install
```

### Dependency Issues

If you encounter dependency-related errors:

```bash
# Try a clean install
pnpm deps:clean

# If that doesn't work, try a more aggressive reset
pnpm deps:reset
```

## License

See the [LICENSE](LICENSE) file for details.
