# DailyUp

- **Tela Hoje**: lista as rotinas ativas do dia da semana atual, com barra de progresso por rotina e checklist de passos. Tocar num passo marca/desmarca. Passos com horário são ordenados por hora.
- **Tela Rotinas**: criar, editar, excluir e ativar/desativar rotinas.
- **Passos de rotina**: cada passo tem nome, horário opcional e tempo de aviso opcional.
- **Dias da semana**: cada rotina pode ser atribuída a dias específicos (padrão: todos os dias).
- **Configurações**: tempo padrão de aviso antes de um passo (em minutos).
- **PWA**: `manifest.json`, tema escuro, tela cheia (standalone) e service worker.
- **Animações**: barra de progresso e checkbox animados.

## Notificações (limitação conhecida)

O código de lembretes existe (`setupNotifications` / `scheduleNotifications` em `app.js`, e `notificationclick` em `sw.js`), mas **não funciona de forma confiável no iOS**. Os avisos são agendados com `setTimeout` enquanto o app está aberto, então não disparam com o app fechado, e o suporte a notificações web no iPhone é limitado. A funcionalidade está em standby, sem previsão de uso.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura das telas, modais (rotina e configurações) e navegação inferior |
| `style.css` | Tema escuro, layout mobile-first, animações |
| `app.js` | Toda a lógica: persistência, navegação, renderização, modais, notificações |
| `manifest.json` | Metadados do PWA (nome, cores, ícones, `start_url`) |
| `sw.js` | Service worker mínimo (ativação e clique em notificação, sem cache offline) |

## Dados no localStorage

| Chave | Conteúdo |
|---|---|
| `routines` | Lista de rotinas: `{ id, name, active, days, items: [{ id, name, time, notifyBefore }] }` |
| `completions` | Passos concluídos por data: `{ "AAAA-MM-DD": { "<itemId>": true } }` |
| `settings` | `{ notifyBefore }` |

Como é `localStorage`, os dados ficam só naquele navegador/dispositivo. Limpar os dados do Safari apaga tudo, e não há backup nem exportação ainda.

## Como rodar

Não há build nem dependências. Basta servir a pasta por HTTP:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`. Para instalar no iPhone é preciso servir por HTTPS (por exemplo GitHub Pages ou um servidor próprio).
