# 🔧 Solução: npm não encontrado

## Problema
O PowerShell não está encontrando o npm no PATH.

## Soluções

### Solução 1: Reiniciar Terminal (Mais Fácil)
1. **Feche completamente o PowerShell/terminal**
2. **Abra um novo terminal**
3. Execute `.\start.bat` novamente

### Solução 2: Instalar Node.js
Se Node.js não estiver instalado:

1. Baixe de: https://nodejs.org/
2. Instale a versão **LTS** (Long Term Support)
3. **IMPORTANTE**: Durante a instalação, marque **"Add to PATH"**
4. **REINICIE o terminal**
5. Execute `.\start.bat` novamente

### Solução 3: Usar Script Helper
Execute manualmente nas janelas abertas:

**Backend:**
```powershell
cd packages\backend
.\..\..\scripts\install-and-run.ps1 -Directory . -Command dev
```

**Frontend:**
```powershell
cd ..
.\scripts\install-and-run.ps1 -Directory . -Command dev
```

### Solução 4: Adicionar Node.js ao PATH Manualmente

1. Encontre onde Node.js está instalado (geralmente):
   - `C:\Program Files\nodejs\`
   - `C:\Program Files (x86)\nodejs\`
   - `%LOCALAPPDATA%\Programs\nodejs\`

2. Adicione ao PATH do sistema:
   - Pressione `Win + R`
   - Digite: `sysdm.cpl`
   - Aba "Avançado" → "Variáveis de Ambiente"
   - Em "Variáveis do sistema", edite "Path"
   - Adicione o caminho do Node.js
   - **REINICIE o terminal**

### Solução 5: Usar Caminho Completo
Se souber onde Node.js está instalado:

**Backend:**
```powershell
cd packages\backend
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev
```

**Frontend:**
```powershell
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev
```

## Verificar se Node.js está instalado

Execute:
```powershell
node --version
npm --version
```

Se mostrar versões, Node.js está instalado mas não está no PATH.

## Verificar onde está instalado

Execute:
```powershell
where.exe node
```

Isso mostrará o caminho completo do Node.js.

## Após resolver

Execute `.\start.bat` novamente. O script agora tem um helper que encontra o npm automaticamente!



