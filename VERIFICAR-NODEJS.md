# ⚠️ Node.js não encontrado!

## Diagnóstico
O npm não está sendo encontrado, o que significa que:
- Node.js não está instalado, OU
- Node.js está instalado mas não está no PATH do sistema

## ✅ Solução Rápida

### Passo 1: Verificar se está instalado
Execute no PowerShell:
```powershell
node --version
```

**Se mostrar uma versão:**
- Node.js está instalado, mas não está no PATH
- Veja "Solução 2" abaixo

**Se der erro:**
- Node.js não está instalado
- Veja "Solução 1" abaixo

### Solução 1: Instalar Node.js

1. **Baixe Node.js:**
   - Acesse: https://nodejs.org/
   - Baixe a versão **LTS** (Long Term Support)
   - Versão recomendada: 20.x ou superior

2. **Instale:**
   - Execute o instalador baixado
   - **IMPORTANTE**: Durante a instalação, certifique-se de marcar:
     - ✅ "Add to PATH" ou "Adicionar ao PATH"
   - Clique em "Next" e complete a instalação

3. **REINICIE o terminal:**
   - Feche completamente o PowerShell
   - Abra um novo PowerShell
   - Execute: `node --version` (deve mostrar a versão)

4. **Execute o script novamente:**
   ```batch
   .\start.bat
   ```

### Solução 2: Adicionar Node.js ao PATH (se já estiver instalado)

1. **Encontrar onde Node.js está:**
   - Procure em:
     - `C:\Program Files\nodejs\`
     - `C:\Program Files (x86)\nodejs\`
     - `%LOCALAPPDATA%\Programs\nodejs\`

2. **Adicionar ao PATH:**
   - Pressione `Win + R`
   - Digite: `sysdm.cpl` e pressione Enter
   - Aba "Avançado" → Botão "Variáveis de Ambiente"
   - Em "Variáveis do sistema", encontre "Path" e clique em "Editar"
   - Clique em "Novo" e adicione o caminho do Node.js (ex: `C:\Program Files\nodejs`)
   - Clique em "OK" em todas as janelas
   - **REINICIE o terminal**

3. **Verificar:**
   ```powershell
   node --version
   npm --version
   ```

4. **Execute o script novamente:**
   ```batch
   .\start.bat
   ```

## 🚀 Alternativa: Usar nvm-windows (Gerenciador de Versões)

Se quiser gerenciar múltiplas versões do Node.js:

1. Baixe nvm-windows: https://github.com/coreybutler/nvm-windows/releases
2. Instale
3. Abra novo terminal e execute:
   ```powershell
   nvm install lts
   nvm use lts
   ```

## 📝 Após Instalar

Execute novamente:
```batch
.\start.bat
```

O script agora tem helpers que encontram o npm automaticamente!



