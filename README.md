# Fluent Web

A modern web application built with React, TypeScript, and TanStack Router.

## Features

- **Authentication**: Complete Auth0 integration with login, signup, and user management
- **Modern UI**: Beautiful, responsive design with Tailwind CSS
- **Type Safety**: Full TypeScript support
- **Routing**: TanStack Router for type-safe routing
- **Internationalization**: i18next for multi-language support
- **State Management**: Zustand for global state
- **Form Validation**: Zod for schema validation
- **UI Components**: Radix UI primitives with custom styling

## Authentication

This application includes a complete authentication system powered by Auth0:

- **Login Page**: Beautiful sign-in interface at `/login`
- **User Profile**: Dropdown menu with user information and logout
- **Protected Routes**: Easy-to-use `ProtectedRoute` component
- **Dashboard**: Example protected page showing user information
- **Account Creation**: Seamless signup flow integrated with login

### Quick Start with Auth0

1. Create a `.env` file with your Auth0 credentials:

   ```env
   VITE_AUTH0_DOMAIN=your-tenant.auth0.com
   VITE_AUTH0_CLIENT_ID=your-client-id
   VITE_AUTH0_AUDIENCE=your-api-audience
   ```

2. Configure your Auth0 application:
   - Allowed Callback URLs: `http://localhost:5173/callback`
   - Allowed Logout URLs: `http://localhost:5173`
   - Allowed Web Origins: `http://localhost:5173`

3. Start the development server:

   ```bash
   pnpm dev
   ```

4. Visit `/login` to test the authentication flow

For detailed setup instructions, see [docs/AUTH_SETUP.md](docs/AUTH_SETUP.md).

## Development

### Prerequisites

- Node.js 22.15.x
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
- **Auth0** - Authentication
- **Zustand** - State management
- **Zod** - Schema validation
- **i18next** - Internationalization
- **Vite** - Build tool
- **ESLint** - Code linting
- **Prettier** - Code formatting

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: This project requires Node.js version 22.15.x
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

The project uses Node.js 22.15.0 as specified in the `.nvmrc` file. If you're using nvm, run:

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
