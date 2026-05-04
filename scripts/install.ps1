# C-Office one-line installer for Windows.
# Usage: irm https://raw.githubusercontent.com/vrzycodex/c-office/main/scripts/install.ps1 | iex
#
# Idempotent. Skips anything already installed. Does NOT require admin —
# winget runs user-scoped, npm -g lands under $env:APPDATA\npm.
#
# Override the source repo by setting $env:COFFICE_REPO_URL before running.

$ErrorActionPreference = 'Stop'
$ProgressPreference   = 'SilentlyContinue'

# ---------- Banner ----------
Write-Host ""
Write-Host "  ___       _____   __  __  _      ___    " -ForegroundColor Magenta
Write-Host " / __|     / __ \ \ / _|/ _|(_)__ |__ \   " -ForegroundColor Magenta
Write-Host "| (__   - | |  | | | |_| |_  / _|/ _/    " -ForegroundColor Magenta
Write-Host " \___|     \____/  |_| |_|  \__|\__|     " -ForegroundColor Magenta
Write-Host ""
Write-Host "  AI Agent Command Center  -  ศูนย์สั่งงานเอเจนต์ AI" -ForegroundColor White
Write-Host "  Roster: Atlas + Scout + Scribe + Forge + Vector +" -ForegroundColor DarkGray
Write-Host "          Pulse + Warden + Relay + Oracle" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Installer for Windows  /  ตัวติดตั้งสำหรับ Windows" -ForegroundColor Cyan
Write-Host "  https://github.com/vrzycodex/c-office" -ForegroundColor DarkGray
Write-Host ""

# ---------- Config ----------
$RepoUrl  = if ($env:COFFICE_REPO_URL) { $env:COFFICE_REPO_URL } else { 'https://github.com/vrzycodex/c-office.git' }
$InstallDir = Join-Path $env:USERPROFILE 'c-office'

function Write-Step {
    param([string]$Msg)
    Write-Host ""
    Write-Host ">> $Msg" -ForegroundColor Cyan
}

function Write-Skip {
    param([string]$Msg)
    Write-Host "   [skip] $Msg" -ForegroundColor DarkGray
}

function Write-OK {
    param([string]$Msg)
    Write-Host "   [ok]   $Msg" -ForegroundColor Green
}

function Refresh-Path {
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

function Has-Command {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

# ---------- Step 1: winget availability ----------
Write-Step "ตรวจสอบ winget / Checking winget"
if (-not (Has-Command 'winget')) {
    Write-Error "winget not found. Please update to Windows 10 1809+ or install App Installer from the Microsoft Store, then re-run this script. ดาวน์โหลด Node.js โดยตรงได้ที่ https://nodejs.org/en/download"
    exit 1
}
Write-OK "winget available"

# ---------- Step 2: Node.js LTS ----------
Write-Step "ตรวจสอบ Node.js / Checking Node.js"
if (Has-Command 'node') {
    $nodeVer = (& node --version) 2>$null
    Write-Skip "Node.js already installed ($nodeVer)"
} else {
    try {
        Write-Host "   Installing Node.js LTS via winget ..." -ForegroundColor Yellow
        winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements | Out-Null
        Refresh-Path
        if (-not (Has-Command 'node')) {
            Write-Error "Node.js install completed but 'node' is not on PATH. Open a new PowerShell window and re-run, or install manually from https://nodejs.org/en/download"
            exit 1
        }
        Write-OK "Node.js installed"
    } catch {
        Write-Error "Failed at step: Node.js install. $_"
        exit 1
    }
}

# ---------- Step 3: git ----------
Write-Step "ตรวจสอบ Git / Checking Git"
if (Has-Command 'git') {
    Write-Skip "git already installed"
} else {
    try {
        Write-Host "   Installing Git via winget ..." -ForegroundColor Yellow
        winget install Git.Git --silent --accept-source-agreements --accept-package-agreements | Out-Null
        Refresh-Path
        if (-not (Has-Command 'git')) {
            Write-Error "Git install completed but 'git' is not on PATH. Open a new PowerShell window and re-run."
            exit 1
        }
        Write-OK "Git installed"
    } catch {
        Write-Error "Failed at step: Git install. $_"
        exit 1
    }
}

# ---------- Step 4: refresh PATH for current session ----------
Refresh-Path

# ---------- Step 5: Claude CLI ----------
Write-Step "ตรวจสอบ Claude CLI / Checking Claude CLI"
if (Has-Command 'claude') {
    Write-Skip "claude CLI already installed"
} else {
    try {
        Write-Host "   Installing @anthropic-ai/claude-code globally ..." -ForegroundColor Yellow
        npm install -g '@anthropic-ai/claude-code'
        if ($LASTEXITCODE -ne 0) { throw "npm exited $LASTEXITCODE" }
        Refresh-Path
        if (-not (Has-Command 'claude')) {
            Write-Host "   [warn] Claude CLI installed but not on PATH yet. New shells should pick it up." -ForegroundColor Yellow
        } else {
            Write-OK "Claude CLI installed"
        }
    } catch {
        Write-Error "Failed at step: Claude CLI install. $_"
        exit 1
    }
}

# ---------- Step 6: Codex CLI (optional) ----------
Write-Step "ตรวจสอบ Codex CLI (optional) / Checking Codex CLI"
if (Has-Command 'codex') {
    Write-Skip "codex CLI already installed"
} else {
    try {
        Write-Host "   Installing @openai/codex globally (optional) ..." -ForegroundColor Yellow
        npm install -g '@openai/codex'
        if ($LASTEXITCODE -ne 0) {
            Write-Host "   [warn] Codex CLI install failed (exit $LASTEXITCODE). Skipping — engineering personas will fall back to Claude." -ForegroundColor Yellow
        } else {
            Refresh-Path
            Write-OK "Codex CLI installed"
        }
    } catch {
        Write-Host "   [warn] Codex CLI install failed: $_  Skipping (optional)." -ForegroundColor Yellow
    }
}

# ---------- Step 7: clone or update repo ----------
Write-Step "เตรียมโฟลเดอร์ c-office / Cloning repo to $InstallDir"
if (Test-Path $InstallDir) {
    if (Test-Path (Join-Path $InstallDir '.git')) {
        try {
            Write-Host "   Existing repo detected — running git pull ..." -ForegroundColor Yellow
            Push-Location $InstallDir
            try {
                git pull --ff-only
                if ($LASTEXITCODE -ne 0) { throw "git pull exited $LASTEXITCODE" }
            } finally {
                Pop-Location
            }
            Write-OK "Repo updated"
        } catch {
            Write-Error "Failed at step: git pull. $_"
            exit 1
        }
    } else {
        Write-Error "Directory '$InstallDir' exists but is not a git repo. Move or delete it manually, then re-run."
        exit 1
    }
} else {
    try {
        git clone $RepoUrl $InstallDir
        if ($LASTEXITCODE -ne 0) { throw "git clone exited $LASTEXITCODE" }
        Write-OK "Repo cloned"
    } catch {
        Write-Error "Failed at step: git clone. $_"
        exit 1
    }
}

# ---------- Step 8: npm install ----------
Write-Step "ติดตั้ง dependencies / Running npm install"
try {
    Push-Location $InstallDir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install exited $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
    Write-OK "Dependencies installed"
} catch {
    Write-Error "Failed at step: npm install. $_"
    exit 1
}

# ---------- Step 9: claude login (interactive) ----------
Write-Step "ล็อกอิน Claude / Claude login"
$claudeCredsPath = Join-Path $env:USERPROFILE '.claude\.credentials.json'
if (Test-Path $claudeCredsPath) {
    Write-Skip "Claude credentials already exist (~/.claude/.credentials.json)"
} else {
    if (-not (Has-Command 'claude')) {
        Write-Host "   [warn] 'claude' not on PATH for this session. Open a new PowerShell window later and run: claude login" -ForegroundColor Yellow
    } else {
        Write-Host "   กำลังเปิดเบราว์เซอร์เพื่อเข้าสู่ระบบ Anthropic — กรุณายืนยันการล็อกอินแล้วกลับมาที่หน้าต่างนี้" -ForegroundColor Yellow
        Write-Host "   Opening browser for Anthropic login. Confirm in browser, then return here." -ForegroundColor Yellow
        try {
            claude login
            if ($LASTEXITCODE -ne 0) {
                Write-Host "   [warn] claude login exited $LASTEXITCODE — you can re-run 'claude login' manually anytime." -ForegroundColor Yellow
            } else {
                Write-OK "Claude logged in"
            }
        } catch {
            Write-Host "   [warn] claude login failed: $_  Re-run 'claude login' manually." -ForegroundColor Yellow
        }
    }
}

# ---------- Step 10: install hooks ----------
Write-Step "ติดตั้ง hooks เข้า Claude Code / Installing Claude Code hooks"
try {
    Push-Location $InstallDir
    try {
        npm run install-hooks
        if ($LASTEXITCODE -ne 0) { throw "npm run install-hooks exited $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
    Write-OK "Hooks installed"
} catch {
    Write-Error "Failed at step: install-hooks. $_"
    exit 1
}

# ---------- Done ----------
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " พร้อมใช้งาน  /  Ready to go" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host " เปิดอีก terminal แล้วรัน  /  Open another terminal and run:" -ForegroundColor White
Write-Host "   cd `"$InstallDir`"" -ForegroundColor Yellow
Write-Host "   npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host " จากนั้นเปิดเบราว์เซอร์ที่  /  Then open in your browser:" -ForegroundColor White
Write-Host "   http://127.0.0.1:7878" -ForegroundColor Yellow
Write-Host ""
