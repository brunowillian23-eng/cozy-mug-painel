# Cozy Mug · Painel

Painel web para registrar **vendas, despesas, parcelas do cartão e valores a receber** da loja de canecas.
Funciona no celular e no computador, sem servidor e sem mensalidade.

## Como funciona (e por que são 2 repositórios)

| Repositório | Visibilidade | Conteúdo |
|---|---|---|
| `cozy-mug-painel` (este) | **Público** | Só o código do site. Nenhum dado seu. |
| `cozy-mug-dados` | **Privado** | O arquivo `data.json` com vendas e despesas. |

O GitHub Pages gratuito só publica repositórios públicos. Por isso o site fica num repositório público e os
**números ficam num repositório privado**, que o site lê e grava usando um token seu.

## Passo a passo

### 1. Repositório de dados (privado)
1. No GitHub: **New repository** → nome `cozy-mug-dados` → marque **Private**.
2. Envie para ele os arquivos da pasta `cozy-mug-dados/` (`data.json`, `README.md`, `.github/`).

### 2. Repositório do painel (público)
1. **New repository** → nome `cozy-mug-painel` → **Public**.
2. Envie os arquivos desta pasta (`site/`, `.github/`, `README.md`).
3. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.
4. O workflow **Publicar painel** roda sozinho a cada alteração na branch `main` e publica o site em
   `https://SEU-USUARIO.github.io/cozy-mug-painel/`.

### 3. Token de acesso (uma vez por pessoa)
1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → `cozy-mug-dados`.
3. **Permissions → Repository permissions → Contents:** *Read and write*.
4. Copie o token.

Sua esposa **não precisa de conta no GitHub**: em **Ajustes → Gerar link para minha esposa**, copie o link e mande só para ela. Ao abrir, a sincronização liga sozinha. (O link contém o token: não o publique. Se alguém perder o aparelho, apague o token no GitHub e gere outro.)

### 4. Ligar a sincronização
No site: **Ajustes → Sincronizar** → informe seu usuário, `cozy-mug-dados` e o token → **Ativar**.
Para sua esposa, use o link de acesso (passo acima). A partir daí os dois enxergam os mesmos dados (atualiza a cada minuto e
sempre que você volta para a aba).

O token fica salvo **só no navegador** de cada pessoa. Se o celular for perdido, revogue o token no GitHub.

## O que o painel faz

- **Painel:** vendas, despesas, lucro e margem; parcelas do mês e quanto ainda falta no cartão; retorno do investimento;
  gráfico mensal; melhores dias da semana; ranking de produtos/clientes; meta mensal.
- **Vendas / Despesas / A receber:** cadastro, edição e exclusão. “Recebido ✓” transforma um valor a receber em venda de hoje.
- **Parcelas:** cada compra no crédito guarda total de parcelas e parcelas restantes; o botão “−1 parcela” baixa uma parcela por mês.
- **Backup:** exporta `.json` e `.csv` (abre no Excel em português).
- **Conflitos:** se os dois salvarem ao mesmo tempo, os registros são mesclados — ninguém perde lançamento.

## Dados iniciais

O `data.json` em `cozy-mug-dados/` já vem com tudo da planilha “Cozy Mug” (69 vendas, 52 despesas, 3 valores a receber).
Se preferir começar do zero, use um `data.json` com listas vazias, ou importe o arquivo em **Ajustes → Importar .json**.

## Identidade visual e movimento

Toda a marca vive nas variáveis do começo de `site/style.css` (bloco `:root`): cores, fonte, raios e curvas/durações de movimento.
Para trocar a cor principal, mude só `--brand`, `--brand-hover`, `--brand-press` e `--brand-wash` (e a versão escura em `:root[data-theme="dark"]`).

- **Cor de ação:** verde-sálvia do cachecol da logo (`#32785c`, contraste AA com texto branco). Rosa, amarelo e lilás da logo aparecem só em detalhes decorativos.
- **Tema:** claro/escuro por `[data-theme]` + `prefers-color-scheme`; a escolha fica salva e é aplicada antes da primeira pintura.
- **Preferências:** densidade (confortável/compacta) e tamanho do texto em *Ajustes*.
- **Atalhos:** `?` abre a ajuda; `g` + `p/v/d/r/a` navega; `n` novo registro; `t` troca o tema.
- **Movimento reduzido:** com `prefers-reduced-motion` as animações são desligadas e os contadores ficam instantâneos.
- **PDF:** *Ajustes → Salvar como PDF* usa o `@media print` (sempre em cores claras).

## Estrutura

| Arquivo | Papel |
|---|---|
| `site/core.js` | Dados, cálculos e sincronização com o GitHub (não mexe na aparência) |
| `site/fx.js` | Ripple, contadores, confete, tilt, tema, overlays, toast |
| `site/charts.js` | Gráficos em SVG: barras, linha, sparklines, anéis, mapa de calor, selos |
| `site/ui.js` | Telas, filtros, formulários, atalhos e eventos |
| `site/style.css` | Tokens da marca, componentes e animações |

## Desenvolvimento local

```bash
cd site && python3 -m http.server 8000   # abre http://localhost:8000
```

Sem dependências nem build: HTML, CSS e JavaScript puros.
