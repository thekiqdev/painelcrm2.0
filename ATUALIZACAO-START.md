# ✅ Script start.bat Atualizado

## O que foi corrigido:

1. **Detecção automática do npm**: O script agora procura o npm em vários locais comuns
2. **Uso do caminho completo**: Quando o npm não está no PATH, o script usa o caminho completo encontrado
3. **Scripts auxiliares**: Criados `run-backend.bat` e `run-frontend.bat` que recebem o caminho do npm como parâmetro
4. **Instalação automática**: As novas janelas instalam dependências automaticamente se necessário

## Como usar:

```batch
.\start.bat
```

## O que o script faz:

1. **Procura npm** em:
   - PATH do sistema
   - `C:\Program Files\nodejs\`
   - `C:\Program Files (x86)\nodejs\`
   - `%LOCALAPPDATA%\Programs\nodejs\`
   - Via comando `where node`

2. **Inicia Docker** (PostgreSQL)

3. **Inicia Backend** em nova janela:
   - Instala dependências se necessário
   - Usa o caminho completo do npm encontrado

4. **Inicia Frontend** em nova janela:
   - Instala dependências se necessário
   - Usa o caminho completo do npm encontrado

## Se ainda não funcionar:

Se o npm ainda não for encontrado, o script mostrará instruções para instalar o Node.js.

**Importante**: Após instalar o Node.js, **REINICIE o terminal** antes de executar o script novamente.

