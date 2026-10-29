# 映途发布脚本：本地交叉编译 PanSou → 上传 → 远程启动
# 用法： .\deploy\deploy.ps1 -Server 1.2.3.4 -User root
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$User = "root",
  [string]$RemoteDir = "/opt/yingtu"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = "${User}@${Server}"

# ---- 1. 交叉编译（服务器不需要装 Go） ----
Write-Host "[1/4] 交叉编译 PanSou (linux/amd64) ..." -ForegroundColor Cyan
$go = "C:\Users\$env:USERNAME\sdk\go\bin\go.exe"
if (-not (Test-Path $go)) { $go = "go" }
Push-Location (Join-Path $root "pansou-main")
$env:CGO_ENABLED = "0"; $env:GOOS = "linux"; $env:GOARCH = "amd64"
& $go build -trimpath -ldflags "-s -w" -o (Join-Path $root "deploy/pansou-linux") .
Pop-Location
Write-Host "      产物: deploy\pansou-linux"

# ---- 2. 建目录 ----
Write-Host "[2/4] 创建远程目录 ..." -ForegroundColor Cyan
ssh $target "mkdir -p $RemoteDir/deploy $RemoteDir/data"

# ---- 3. 上传（不传 .env，避免覆盖服务器上的密钥） ----
Write-Host "[3/4] 上传文件 ..." -ForegroundColor Cyan
scp (Join-Path $root "docker-compose.yml") "${target}:${RemoteDir}/"
foreach ($d in @("server", "shared", "client", "config")) {
  scp -r (Join-Path $root $d) "${target}:${RemoteDir}/"
}
# 只传片库，不覆盖服务器上的 analytics / feedback
if (Test-Path (Join-Path $root "data/titles.json")) {
  scp (Join-Path $root "data/titles.json") "${target}:${RemoteDir}/data/"
}
foreach ($f in @("Caddyfile", "Dockerfile.pansou", ".env.example", "install.sh", "pansou-linux")) {
  scp (Join-Path $root "deploy/$f") "${target}:${RemoteDir}/deploy/"
}

# ---- 4. 远程启动（先去掉 Windows 的 CRLF，否则 bash 报错） ----
Write-Host "[4/4] 远程启动 ..." -ForegroundColor Cyan
ssh $target "cd $RemoteDir && sed -i 's/\r$//' deploy/install.sh && chmod +x deploy/install.sh && bash deploy/install.sh"

Write-Host ""
Write-Host "如果 install.sh 提示缺少配置，先填服务器上的 deploy/.env：" -ForegroundColor Green
Write-Host "  ssh $target"
Write-Host "  cd $RemoteDir && vi deploy/.env"
Write-Host "  bash deploy/install.sh"
Write-Host ""
Write-Host "看日志： ssh $target 'cd $RemoteDir && docker compose --env-file deploy/.env logs -f'"
