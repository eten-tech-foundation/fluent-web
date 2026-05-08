#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Configuration ─────────────────────────────────────────────────────────────

CONTAINER_NAME="${CONTAINER_NAME:-fluent-web}"
IMAGE_NAME="${IMAGE_NAME:-fluent-web}"
PORT="${PORT:-5173}"
VITE_API_URL="${VITE_API_URL:-http://localhost:9999}"
WEB_CONTEXT="${WEB_CONTEXT:-$SCRIPT_DIR}"

# ── Runtime detection (prefer Podman) ────────────────────────────────────────

detect_runtime() {
  if command -v podman &>/dev/null; then
    RUNTIME="podman"
  elif command -v docker &>/dev/null; then
    RUNTIME="docker"
  else
    echo "Error: No container runtime found. Install podman or docker."
    exit 1
  fi
}

detect_runtime

# ── Helper functions ─────────────────────────────────────────────────────────

container_exists() {
  $RUNTIME ps -a --format "{{.Names}}" 2>/dev/null | grep -qx "$CONTAINER_NAME" || false
}

container_running() {
  $RUNTIME ps --format "{{.Names}}" 2>/dev/null | grep -qx "$CONTAINER_NAME" || false
}

build_image() {
  echo "Building image $IMAGE_NAME..."
  $RUNTIME build -t "$IMAGE_NAME" -f Dockerfile.dev .
}

run_container() {
  echo "Starting container $CONTAINER_NAME on port $PORT..."

  # Remove existing container if exists
  if container_exists; then
    $RUNTIME rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi

  # Build volume mount flags
  local -a volume_flags=(
    -v "$SCRIPT_DIR/src:/app/src"
    -v "$SCRIPT_DIR/public:/app/public:ro"
    -v "$SCRIPT_DIR/index.html:/app/index.html:ro"
    -v "$SCRIPT_DIR/vite.config.ts:/app/vite.config.ts"
    -v "$SCRIPT_DIR/tsconfig.json:/app/tsconfig.json:ro"
    -v "$SCRIPT_DIR/tsconfig.node.json:/app/tsconfig.node.json:ro"
    -v "$SCRIPT_DIR/components.json:/app/components.json:ro"
    -v "$SCRIPT_DIR/eslint.config.js:/app/eslint.config.js:ro"
    -v "$SCRIPT_DIR/.env:/app/.env:ro"
    -v "$WEB_CONTEXT/.prettierrc.js:/app/.prettierrc.js:ro"
    -v "$WEB_CONTEXT/.prettierignore:/app/.prettierignore:ro"
    -v "${CONTAINER_NAME}-node-modules:/app/node_modules"
    -v "${CONTAINER_NAME}-cache:/app/.cache"
    -v "${CONTAINER_NAME}-eslintcache:/app/.eslintcache"
  )

  # Environment variables
  local -a env_flags=(
    -e "VITE_API_URL=$VITE_API_URL"
    -e "COREPACK_HOME=/app/.cache/corepack"
    -e "COREPACK_ENABLE_AUTO_PIN=0"
  )

  # Load additional env vars from .env if it exists
  if [[ -f .env ]]; then
    while IFS='=' read -r key value; do
      # Skip comments and empty lines
      [[ -z "$key" || "$key" =~ ^# ]] && continue
      # Remove quotes from value if present
      value="${value#\"}"
      value="${value%\"}"
      value="${value#\'}"
      value="${value%\'}"
      env_flags+=(-e "$key=$value")
    done < .env
  fi

  $RUNTIME run -d \
    --name "$CONTAINER_NAME" \
    -p "${PORT}:5173" \
    "${volume_flags[@]}" \
    "${env_flags[@]}" \
    --user "1001:1001" \
    --read-only \
    --tmpfs /tmp:nosuid,size=64m \
    --security-opt no-new-privileges:true \
    --cap-drop ALL \
    "$IMAGE_NAME"

  echo "Container started. Access at http://localhost:$PORT"
}

# ── Commands ─────────────────────────────────────────────────────────────────

cmd="${1:-help}"
shift || true

case "$cmd" in
  up)
    build_image
    run_container
    ;;

  down)
    echo "Stopping and removing container..."
    $RUNTIME rm -f "$CONTAINER_NAME" 2>/dev/null || echo "Container not found."
    ;;

  restart)
    if container_running; then
      echo "Restarting container..."
      $RUNTIME restart "$CONTAINER_NAME"
    else
      echo "Container not running. Starting fresh..."
      run_container
    fi
    ;;

  logs)
    if ! container_exists; then
      echo "Container does not exist. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME logs -f "$CONTAINER_NAME" "$@"
    ;;

  status)
    if container_running; then
      echo "Container '$CONTAINER_NAME' is running."
      $RUNTIME ps -f "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    elif container_exists; then
      echo "Container '$CONTAINER_NAME' exists but is not running."
    else
      echo "Container '$CONTAINER_NAME' does not exist."
    fi
    ;;

  shell)
    if ! container_running; then
      echo "Container is not running. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME exec -it "$CONTAINER_NAME" sh
    ;;

  # ── Development commands ─────────────────────────────────────────────────

  test)
    if ! container_running; then
      echo "Container is not running. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME exec "$CONTAINER_NAME" pnpm test "$@"
    ;;

  lint)
    if ! container_running; then
      echo "Container is not running. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME exec "$CONTAINER_NAME" pnpm lint "$@"
    ;;

  lint:fix)
    if ! container_running; then
      echo "Container is not running. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME exec "$CONTAINER_NAME" pnpm lint:fix "$@"
    ;;

  format)
    if ! container_running; then
      echo "Container is not running. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME exec "$CONTAINER_NAME" pnpm format "$@"
    ;;

  format:check)
    if ! container_running; then
      echo "Container is not running. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME exec "$CONTAINER_NAME" pnpm format:check "$@"
    ;;

  typecheck)
    if ! container_running; then
      echo "Container is not running. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME exec "$CONTAINER_NAME" pnpm typecheck "$@"
    ;;

  precheck)
    if ! container_running; then
      echo "Container is not running. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME exec "$CONTAINER_NAME" pnpm precheck "$@"
    ;;

  preview)
    if ! container_running; then
      echo "Container is not running. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME exec "$CONTAINER_NAME" pnpm preview "$@"
    ;;

  run)
    if ! container_running; then
      echo "Container is not running. Run './fweb.sh up' first."
      exit 1
    fi
    $RUNTIME exec "$CONTAINER_NAME" pnpm "$@"
    ;;

  # ── Lifecycle commands ─────────────────────────────────────────────────────

  clean)
    echo "This will stop and remove the container and its volumes."
    read -rp "Continue? [y/N] " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
      $RUNTIME rm -f "$CONTAINER_NAME" 2>/dev/null || true
      $RUNTIME volume rm -f "${CONTAINER_NAME}-node-modules" 2>/dev/null || true
      $RUNTIME volume rm -f "${CONTAINER_NAME}-cache" 2>/dev/null || true
      $RUNTIME volume rm -f "${CONTAINER_NAME}-eslintcache" 2>/dev/null || true
      echo "Cleaned up."
    else
      echo "Aborted."
    fi
    ;;

  fresh)
    echo "This will destroy the container, volumes, and image."
    echo "Everything will be rebuilt from scratch."
    read -rp "Continue? [y/N] " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
      $RUNTIME rm -f "$CONTAINER_NAME" 2>/dev/null || true
      $RUNTIME volume rm -f "${CONTAINER_NAME}-node-modules" 2>/dev/null || true
      $RUNTIME volume rm -f "${CONTAINER_NAME}-cache" 2>/dev/null || true
      $RUNTIME volume rm -f "${CONTAINER_NAME}-eslintcache" 2>/dev/null || true
      $RUNTIME rmi -f "$IMAGE_NAME" 2>/dev/null || true
      echo ""
      echo "Clean slate. Run './fweb.sh up' to rebuild and start."
    else
      echo "Aborted."
    fi
    ;;

  build)
    build_image
    ;;

  setup)
    if [[ ! -f .env ]]; then
      if [[ -f .env.example ]]; then
        cp .env.example .env
        echo "Created .env from .env.example"
      else
        touch .env
        echo "Created empty .env file"
      fi
    else
      echo ".env already exists, skipping."
    fi
    echo "Remember to fill in credentials in .env (Auth0, etc.)"
    ;;

  help|*)
    cat <<'USAGE'
Usage: ./fweb.sh <command> [args]

Services:
  up                     Start the dev server (build + run)
  down                   Stop and remove the container
  restart                Restart the container
  logs                   Tail container logs
  status                 Show container status
  shell                  Open a shell in the container

Development:
  test                   Run vitest test suite
  lint                   Run ESLint
  lint:fix               Run ESLint with auto-fix
  format                 Format code with Prettier
  format:check           Check formatting with Prettier
  typecheck              Run TypeScript type checking
  precheck               Run lint + format:check + typecheck + test
  preview                Preview the production build
  run <script>           Run a pnpm script inside the container

Lifecycle:
  clean                  Remove container and volumes
  fresh                  Nuke everything: container, volumes, and image
  build                  Rebuild image
  setup                  Create .env from .env.example if missing

Environment variables:
  CONTAINER_NAME         Container name (default: fluent-web)
  IMAGE_NAME             Image name (default: fluent-web)
  PORT                   Host port to bind (default: 5173)
  VITE_API_URL           API URL for the app (default: http://localhost:9999)
  WEB_CONTEXT            Path for prettier config files (default: project root)
USAGE
    ;;
esac
