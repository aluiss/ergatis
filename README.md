# Ergatis

Marketplace que conecta quem precisa de um serviço a profissionais da região. Quem contrata não paga; o profissional assina um plano. O pagamento do serviço é combinado direto entre as partes.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `apps/api` | API NestJS, Drizzle, Better Auth |
| `apps/web` | Site Next.js. Encaminha `/api/*` para a API |
| `packages/shared` | Regras de planos e validações usadas pelos dois |

## Rodando localmente

Requer Node 22+, pnpm e Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # troque BETTER_AUTH_SECRET
cp apps/web/.env.example apps/web/.env
pnpm db:up
pnpm --filter @ergatis/shared build
pnpm db:migrate
pnpm db:seed
pnpm dev
```

O site abre em http://localhost:3000. Sem `SMTP_HOST`, os links de confirmação de e-mail aparecem no log da API.

Para criar o primeiro administrador, cadastre-se pelo site e rode:

```bash
pnpm --filter @ergatis/api db:make-admin seu@email.com
```

## Verificação

```bash
pnpm typecheck
pnpm test    # sobe um Postgres embutido, não precisa de Docker
pnpm build
```

## Planos e cortesias

O código consulta benefícios (`Entitlements` em `packages/shared`), nunca o nome do plano. Benefícios efetivos = plano Basic + assinatura ativa + cortesias válidas, sempre prevalecendo o mais vantajoso. Preços e benefícios são editados em `/admin/planos`.

## Cobrança

`BILLING_PROVIDER=fake` ativa planos sem cobrar e é recusado em produção. Para o Asaas, defina `BILLING_PROVIDER=asaas`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`, e cadastre o webhook apontando para `https://SEU_DOMINIO/api/billing/webhooks/asaas` com os eventos de cobrança e de assinatura. Em produção, ajuste `ASAAS_BASE_URL`, que aponta para o sandbox por padrão, e use uma chave de produção.

Para testar contra o sandbox real, com `ASAAS_API_KEY` no `apps/api/.env`:

```bash
cd apps/api && ASAAS_SANDBOX_TEST=1 pnpm exec vitest run test/asaas-sandbox.test.ts
```

O teste apaga o cliente e a assinatura que criar.

## Implantação

- Exponha apenas o site, atrás de um proxy de borda (Vercel, Nginx, Cloudflare) que sobrescreva o `X-Forwarded-For`. O Next repassa esse cabeçalho como veio, e a API o usa no rate limit (`TRUST_PROXY_HOPS`). Sem esse proxy, um cliente poderia forjar IPs para escapar do limite.
- A API não deve ficar acessível diretamente pela internet.
- Defina `WEB_URL` e `API_URL` com a URL pública do site.
