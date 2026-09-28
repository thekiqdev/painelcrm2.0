# Escopo OAuth Google Drive (`https://www.googleapis.com/auth/drive`)

Na **Fase 2** da integração Drive o PainelCRM usa o escopo **`drive`** (acesso completo ao Google Drive da conta autorizada), em conjunto com `openid`, `email` e `profile` para identificar a conta Google.

## Porque não `drive.file`

O escopo restrito **`drive.file`** limita o acesso a ficheiros que a aplicação criou ou que o utilizador abriu com o picker. Para esta fase é necessário:

- criar **pastas na raiz** do «Meu Drive» com o nome da empresa;
- criar de seguida a subpasta **«Clientes»** dentro dessa raiz;
- preparar uma hierarquia estável para módulos futuros (uploads, contratos, etc.).

Com **`drive.file`** a criação/gestão livre de pastas na raiz é **inviable ou muito limitada** para o modelo «empresa → Clientes» que o produto pretende.

## Trade-offs

- **Permissão ampla:** o consentimento pode ser classificado como sensível na Google Cloud e **pode exigir verificação** da app OAuth antes de uso público alargado.
- **Confiança:** apenas **administradores do tenant** podem iniciar a ligação; os tokens são **cifrados em repouso** no backend (mesmo mecanismo que o Google Agenda).

## Referência oficial

- [Google Drive API scopes](https://developers.google.com/drive/api/guides/api-specific-auth)
