# Solução: Frontend 502 Bad Gateway

## 🔍 Diagnóstico

O erro 502 pode ter várias causas. Vamos diagnosticar passo a passo.

## ✅ Verificações no Terminal do Frontend

Execute estes comandos no terminal do serviço Frontend no Easypanel:

### 1. Verificar se os arquivos estão presentes
```bash
ls -la /usr/share/nginx/html/
```
**Deve mostrar**: `index.html`, `assets/`, `favicon.ico`, etc.

### 2. Verificar logs de erro do Nginx
```bash
cat /var/log/nginx/error.log
```
Ou em tempo real:
```bash
tail -f /var/log/nginx/error.log
```

### 3. Testar se o Nginx está servindo arquivos localmente
```bash
wget -O- http://localhost/
```
**Deve retornar**: HTML do `index.html`

### 4. Testar conexão com o backend
```bash
wget -O- http://painelcrm:3001/health
```
**Deve retornar**: `{"status":"ok","database":"connected"}`

### 5. Verificar configuração do Nginx
```bash
nginx -t
```
**Deve retornar**: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

### 6. Verificar se o Nginx está rodando
```bash
ps aux | grep nginx
```
**Deve mostrar**: processos do nginx

## 🔧 Soluções Comuns

### Solução 1: Reiniciar o Nginx
```bash
nginx -s reload
```
Ou reinicie o serviço no Easypanel.

### Solução 2: Verificar se o backend está acessível

Se o teste `wget http://painelcrm:3001/health` falhar:
- Verifique se o backend está rodando
- Verifique se o nome do serviço está correto
- Verifique se estão no mesmo projeto/namespace

### Solução 3: Verificar logs de acesso
```bash
tail -f /var/log/nginx/access.log
```
Isso mostra todas as requisições recebidas.

## 📝 Informações Necessárias

Para diagnosticar melhor, preciso saber:

1. **Resultado do comando**: `wget -O- http://localhost/`
2. **Conteúdo do log de erro**: `cat /var/log/nginx/error.log`
3. **Resultado do teste de backend**: `wget -O- http://painelcrm:3001/health`
4. **Mensagem de erro exata** no navegador (F12 > Console)

## 🚀 Próximos Passos

1. Execute os comandos acima
2. Compartilhe os resultados
3. Com base nos resultados, ajustaremos a configuração


