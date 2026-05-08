#Requires -Version 5.1
param(
    [Parameter(Position = 0)]
    [string]$Command = "help",
    [Parameter(Position = 1, ValueFromRemainingArguments)]
    [string[]]$Args
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# ── Configuration ─────────────────────────────────────────────────────────────

$ContainerName = $env:CONTAINER_NAME -or "fluent-web"
$ImageName = $env:IMAGE_NAME -or "fluent-web"
$Port = $env:PORT -or "5173"
$ViteApiUrl = $env:VITE_API_URL -or "http://localhost:9999"
$WebContext = $env:WEB_CONTEXT -or $ScriptDir

# ── Runtime detection (prefer Podman) ────────────────────────────────────────

function Get-Runtime {
    if (Get-Command podman -ErrorAction SilentlyContinue) {
        return "podman"
    }
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        return "docker"
    }
    Write-Error "No container runtime found. Install podman or docker."
    exit 1
}

$Runtime = Get-Runtime

# ── Helper functions ─────────────────────────────────────────────────────────

function Test-ContainerExists {
    $containers = & $Runtime ps -a --format "{{.Names}}" 2>$null
    return $containers -contains $ContainerName
}

function Test-ContainerRunning {
    $containers = & $Runtime ps --format "{{.Names}}" 2>$null
    return $containers -contains $ContainerName
}

function Build-Image {
    Write-Host "Building image $ImageName..."
    & $Runtime build -t $ImageName -f Dockerfile.dev .
}

function Run-Container {
    Write-Host "Starting container $ContainerName on port $Port..."

    # Remove existing container if exists
    if (Test-ContainerExists) {
        & $Runtime rm -f $ContainerName 2>$null | Out-Null
    }

    # Build volume mounts
    $volumeMounts = @(
        "-v", "$ScriptDir\src:/app/src",
        "-v", "$ScriptDir\public:/app/public:ro",
        "-v", "$ScriptDir\index.html:/app/index.html:ro",
        "-v", "$ScriptDir\vite.config.ts:/app/vite.config.ts",
        "-v", "$ScriptDir\tsconfig.json:/app/tsconfig.json:ro",
        "-v", "$ScriptDir\tsconfig.node.json:/app/tsconfig.node.json:ro",
        "-v", "$ScriptDir\components.json:/app/components.json:ro",
        "-v", "$ScriptDir\eslint.config.js:/app/eslint.config.js:ro",
        "-v", "$ScriptDir\.env:/app/.env:ro",
        "-v", "$WebContext\.prettierrc.js:/app/.prettierrc.js:ro",
        "-v", "$WebContext\.prettierignore:/app/.prettierignore:ro",
        "-v", "${ContainerName}-node-modules:/app/node_modules",
        "-v", "${ContainerName}-cache:/app/.cache",
        "-v", "${ContainerName}-eslintcache:/app/.eslintcache"
    )

    # Environment variables
    $envVars = @(
        "-e", "VITE_API_URL=$ViteApiUrl",
        "-e", "COREPACK_HOME=/app/.cache/corepack",
        "-e", "COREPACK_ENABLE_AUTO_PIN=0"
    )

    # Load additional env vars from .env if it exists
    if (Test-Path .env) {
        Get-Content .env | ForEach-Object {
            if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
            if ($_ -match '^([^=]+)=(.*)$') {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                # Remove quotes if present
                $value = $value -replace '^["\'']|["\'']$'
                $envVars += "-e"
                $envVars += "$key=$value"
            }
        }
    }

    $runArgs = @(
        "run", "-d",
        "--name", $ContainerName,
        "-p", "${Port}:5173"
    ) + $volumeMounts + $envVars + @(
        "--user", "1001:1001",
        "--read-only",
        "--tmpfs", "/tmp:nosuid,size=64m",
        "--security-opt", "no-new-privileges:true",
        "--cap-drop", "ALL",
        $ImageName
    )

    & $Runtime @runArgs
    Write-Host "Container started. Access at http://localhost:$Port"
}

function Invoke-ContainerCommand {
    param([string]$Cmd, [string[]]$CmdArgs)
    if (-not (Test-ContainerRunning)) {
        Write-Error "Container is not running. Run '.\fweb.ps1 up' first."
        exit 1
    }
    & $Runtime exec $ContainerName $Cmd @CmdArgs
}

# ── Commands ─────────────────────────────────────────────────────────────────

switch ($Command) {
    "up" {
        Build-Image
        Run-Container
    }
    "down" {
        Write-Host "Stopping and removing container..."
        & $Runtime rm -f $ContainerName 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Container not found."
        }
    }
    "restart" {
        if (Test-ContainerRunning) {
            Write-Host "Restarting container..."
            & $Runtime restart $ContainerName
        } else {
            Write-Host "Container not running. Starting fresh..."
            Run-Container
        }
    }
    "logs" {
        if (-not (Test-ContainerExists)) {
            Write-Error "Container does not exist. Run '.\fweb.ps1 up' first."
            exit 1
        }
        & $Runtime logs -f $ContainerName @Args
    }
    "status" {
        if (Test-ContainerRunning) {
            Write-Host "Container '$ContainerName' is running."
            & $Runtime ps -f "name=$ContainerName" --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"
        } elseif (Test-ContainerExists) {
            Write-Host "Container '$ContainerName' exists but is not running."
        } else {
            Write-Host "Container '$ContainerName' does not exist."
        }
    }
    "shell" {
        if (-not (Test-ContainerRunning)) {
            Write-Error "Container is not running. Run '.\fweb.ps1 up' first."
            exit 1
        }
        & $Runtime exec -it $ContainerName sh
    }

    # ── Development commands ─────────────────────────────────────────────────

    "test" {
        Invoke-ContainerCommand "pnpm" (@("test") + $Args)
    }
    "lint" {
        Invoke-ContainerCommand "pnpm" (@("lint") + $Args)
    }
    "lint:fix" {
        Invoke-ContainerCommand "pnpm" (@("lint:fix") + $Args)
    }
    "format" {
        Invoke-ContainerCommand "pnpm" (@("format") + $Args)
    }
    "format:check" {
        Invoke-ContainerCommand "pnpm" (@("format:check") + $Args)
    }
    "typecheck" {
        Invoke-ContainerCommand "pnpm" (@("typecheck") + $Args)
    }
    "precheck" {
        Invoke-ContainerCommand "pnpm" (@("precheck") + $Args)
    }
    "preview" {
        Invoke-ContainerCommand "pnpm" (@("preview") + $Args)
    }
    "run" {
        Invoke-ContainerCommand "pnpm" $Args
    }

    # ── Lifecycle commands ─────────────────────────────────────────────────────

    "clean" {
        Write-Host "This will stop and remove the container and its volumes."
        $confirm = Read-Host "Continue? [y/N]"
        if ($confirm -match "^[Yy]$") {
            & $Runtime rm -f $ContainerName 2>$null | Out-Null
            & $Runtime volume rm -f "${ContainerName}-node-modules" 2>$null | Out-Null
            & $Runtime volume rm -f "${ContainerName}-cache" 2>$null | Out-Null
            & $Runtime volume rm -f "${ContainerName}-eslintcache" 2>$null | Out-Null
            Write-Host "Cleaned up."
        } else {
            Write-Host "Aborted."
        }
    }
    "fresh" {
        Write-Host "This will destroy the container, volumes, and image."
        Write-Host "Everything will be rebuilt from scratch."
        $confirm = Read-Host "Continue? [y/N]"
        if ($confirm -match "^[Yy]$") {
            & $Runtime rm -f $ContainerName 2>$null | Out-Null
            & $Runtime volume rm -f "${ContainerName}-node-modules" 2>$null | Out-Null
            & $Runtime volume rm -f "${ContainerName}-cache" 2>$null | Out-Null
            & $Runtime volume rm -f "${ContainerName}-eslintcache" 2>$null | Out-Null
            & $Runtime rmi -f $ImageName 2>$null | Out-Null
            Write-Host ""
            Write-Host "Clean slate. Run '.\fweb.ps1 up' to rebuild and start."
        } else {
            Write-Host "Aborted."
        }
    }
    "build" {
        Build-Image
    }
    "setup" {
        if (-not (Test-Path .env)) {
            if (Test-Path .env.example) {
                Copy-Item .env.example .env
                Write-Host "Created .env from .env.example"
            } else {
                New-Item .env -ItemType File | Out-Null
                Write-Host "Created empty .env file"
            }
        } else {
            Write-Host ".env already exists, skipping."
        }
        Write-Host "Remember to fill in credentials in .env (Auth0, etc.)"
    }
    default {
        @"
Usage: .\fweb.ps1 <command> [args]

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
"@
    }
}
