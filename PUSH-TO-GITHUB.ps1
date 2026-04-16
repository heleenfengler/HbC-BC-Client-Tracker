# One-time: push this folder to your existing GitHub repo (includes .github/workflows correctly).
# Requires Git for Windows: https://git-scm.com/download/win
# First run: Windows may ask you to sign in to GitHub in a browser — that is normal.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$repoUrl = "https://github.com/heleenfengler/HbC-BC-Client-Tracker.git"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git is not installed. Install from https://git-scm.com/download/win then run this script again." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".git")) {
  git init
  git branch -M main
}

git add -A
$status = git status --porcelain
if ($status) {
  git commit -m "Add Actions workflow (.github/workflows), scripts, dashboard files"
} else {
  Write-Host "Nothing new to commit (already up to date)." -ForegroundColor Yellow
}

$remote = git remote get-url origin 2>$null
if (-not $remote) {
  git remote add origin $repoUrl
}

Write-Host "Fetching from GitHub..." -ForegroundColor Cyan
git fetch origin 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Fetch failed (sign in may be required). Try: git fetch origin" -ForegroundColor Yellow
}

$hasRemoteMain = git rev-parse origin/main 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Merging with existing GitHub main (keeps both histories)..." -ForegroundColor Cyan
  git merge origin/main --allow-unrelated-histories --no-edit 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Merge had conflicts. Open GitHub Desktop on this folder, resolve, then push." -ForegroundColor Yellow
    exit 1
  }
}

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Push failed. Easiest fix: install GitHub Desktop, File -> Add local repository -> pick this folder," -ForegroundColor Yellow
  Write-Host "sign in, then Repository -> Repository settings -> Remotes -> confirm origin is:" -ForegroundColor Yellow
  Write-Host "  $repoUrl" -ForegroundColor White
  Write-Host "Then push from the app." -ForegroundColor Yellow
  exit 1
}

Write-Host "Done. Open: https://github.com/heleenfengler/HbC-BC-Client-Tracker/actions" -ForegroundColor Green
