$ErrorActionPreference = "Stop"

$ProjectId = "central-de-controle-88962"

Write-Host ""
Write-Host "=== CENTRAL - PUBLICAR REGRAS FIRESTORE ===" -ForegroundColor Cyan
Write-Host "Projeto: $ProjectId"
Write-Host ""

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "Node.js/npx nao foi encontrado. Instale o Node.js LTS e execute este script novamente."
}

Write-Host "1/3 - Verificando autenticacao Firebase..." -ForegroundColor Yellow
& npx --yes firebase-tools@latest login:list
if ($LASTEXITCODE -ne 0) {
    Write-Host "Nenhuma sessao Firebase valida. Abrindo login..." -ForegroundColor Yellow
    & npx --yes firebase-tools@latest login
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel autenticar no Firebase."
    }
}

Write-Host ""
Write-Host "2/3 - Validando projeto e regras..." -ForegroundColor Yellow
if (-not (Test-Path ".\firebase.json")) { throw "firebase.json nao encontrado. Execute o script na raiz do repositorio." }
if (-not (Test-Path ".\firestore.rules")) { throw "firestore.rules nao encontrado. Execute o script na raiz do repositorio." }

Write-Host ""
Write-Host "3/3 - Publicando SOMENTE as regras do Firestore..." -ForegroundColor Yellow
& npx --yes firebase-tools@latest deploy --only firestore:rules --project $ProjectId
if ($LASTEXITCODE -ne 0) {
    throw "O deploy das regras falhou. Nenhuma outra parte do projeto foi alterada."
}

Write-Host ""
Write-Host "REGRAS FIRESTORE PUBLICADAS COM SUCESSO." -ForegroundColor Green
Write-Host "Agora abra a Central e teste: 1o Turno - 07:30 ate 05:30." -ForegroundColor Green
