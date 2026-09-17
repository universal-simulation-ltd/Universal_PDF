import type { Messages } from '../en'

const annotate: Messages['annotate'] = {
  // Shared
  'common.close': 'Fechar',
  'common.cancel': 'Cancelar',
  'common.done': 'Concluído',

  // AnnotationLayer — redaction caption, drawn on the page in the editor only (never exported)
  'redact.hint': 'Isto será tarjado ao exportar',

  // ColorCluster (the swatches on the floating pills)
  'color.black': 'Preto',
  'color.white': 'Branco',
  'color.more': 'Mais cores',

  // SigField (an unsigned "Sign here" box on the page)
  'sigfield.sign_here': 'Assine aqui',
  'sigfield.name': 'Nome',
  'sigfield.date': 'Data',
  'sigfield.live': 'Ao vivo',
  'sigfield.click_again': 'Clique de novo para assinar',

  // AnnotationLayer — Delete / Confirm / Edit buttons beside a selected object
  'selection.delete': 'Excluir',
  'selection.delete_aria': 'Excluir o objeto selecionado',
  'selection.done_to_select': 'Concluído — manter e voltar para Selecionar',
  'selection.done_deselect': 'Concluído — manter e desmarcar',
  'selection.confirm_aria': 'Confirmar e desmarcar',
  'selection.qr_edit_title': 'Editar este código QR — link, estilo ou marca',
  'selection.qr_edit_aria': 'Editar este código QR',

  // AnnotationLayer — text pill (size, bold / italic / underline / link)
  'text.bold_letter': 'N',
  'text.bold': 'Negrito',
  'text.italic_letter': 'I',
  'text.italic': 'Itálico',
  'text.underline_letter': 'S',
  'text.underline': 'Sublinhado',
  'text.link_selection': 'Adicionar link ao texto selecionado',
  'text.edit_link': 'Editar link',
  'text.add_link': 'Adicionar link',
  'text.link_prompt': 'URL do link (deixe em branco para remover):',
  'text.link_prompt_selection': 'URL do link para o texto selecionado (em branco para remover):',
  'text.size_decrease': 'Diminuir tamanho do texto',
  'text.size_field': 'Tamanho da fonte em pontos',
  'text.size_increase': 'Aumentar tamanho do texto',

  // AnnotationLayer — image pill (border around a placed picture or QR code)
  'image.border': 'Borda',
  'image.border_none': 'Nenhuma',
  'image.border_none_title': 'Sem borda',
  'image.border_width': 'Borda de {width}px',
  'image.border_solid': 'Sólida',
  'image.border_dashed': 'Tracejada',

  // AnnotationLayer — line pill
  'line.stroke': 'Traço',
  'line.snap_title': 'Linha rígida — alinha na horizontal, vertical ou diagonal (segure Shift ao arrastar uma ponta para alinhar só uma vez)',
  'line.snap_on': 'Alinhar: sim',
  'line.snap_off': 'Alinhar: não',

  // AnnotationLayer — colour pill for ticks, crosses, boxes, circles, pen strokes
  'shape.colour': 'Cor',

  // AnnotationLayer — multi-selection delete
  'selection.delete_many_one': 'Excluir {count} objeto',
  'selection.delete_many_other': 'Excluir {count} objetos',
  'selection.delete_many_aria_one': 'Excluir {count} objeto selecionado',
  'selection.delete_many_aria_other': 'Excluir {count} objetos selecionados',

  // AnnotationLayer — Send to sign on a selected "Sign here" box
  'sigfield.send_title': 'Enviar para assinatura — envie este documento por e-mail como uma solicitação de assinatura',
  'sigfield.send_aria': 'Enviar para assinatura',

  // AnnotationLayer — Fill / Redact toggles on a box or circle
  'shape.fill_clear': 'Remover preenchimento',
  'shape.fill': 'Preencher com a cor ativa',
  'shape.redact_title': 'Tarjar — cobre a área de preto e remove o texto permanentemente ao exportar',
  'shape.redact_aria': 'Tarjar esta área',
  'redact.to_fill_title': 'Transformar em forma preenchida — o texto embaixo NÃO será mais removido ao exportar',
  'redact.to_fill_aria': 'Transformar esta tarja em uma forma preenchida',

  // AnnotationLayer — fill-vs-redact warning dialog
  'fill_warning.title': 'Preencher não esconde o texto',
  'fill_warning.body': 'Uma caixa preenchida só pinta por cima da página. O texto embaixo continua selecionável e legível por um computador. Para removê-lo de vez, use a tarja.',
  'fill_warning.dont_show': 'Não mostrar isto novamente',
  'fill_warning.fill_anyway': 'Preencher mesmo assim',
  'fill_warning.redact_instead': 'Tarjar em vez disso',

  // AnnotationLayer — size + alignment pill on a signature with labels
  'sig_pill.size': 'Tamanho',
  'sig_pill.smaller': 'Rótulos menores',
  'sig_pill.bigger': 'Rótulos maiores',
  'sig_pill.align_title': 'Alinhar rótulos: {align} (clique para alternar)',
  'sig_pill.align_aria': 'Rótulos alinhados {align}, clique para mudar',
  'sig_pill.align_left': 'à esquerda',
  'sig_pill.align_centre': 'ao centro',
  'sig_pill.align_right': 'à direita',

  // SignatureOptionsModal
  'sig_options.title': 'Opções da assinatura',
  'sig_options.intro_restyle': 'Altera os rótulos e o estilo da caneta — os traços que você desenhou ficam exatamente como estão. Use a barra na assinatura para redimensionar ou alinhar os rótulos.',
  'sig_options.intro': 'Altera só o nome e a data — sua assinatura fica exatamente como foi desenhada. Use a barra na assinatura para redimensionar ou alinhar os rótulos.',
  'sig_options.add_details': 'Adicionar seus dados',
  'sig_options.details_aria': 'Dados a mostrar abaixo da assinatura',
  'sig_options.add_date': 'Adicionar data',
  'sig_options.date_aria': 'Linha de data abaixo da assinatura',
  'sig_options.realistic': 'Deixar com aparência mais realista',
  'sig_options.realistic_hint': 'Tinta azul, pressão irregular e mão um pouco trêmula',
  'sig_options.redraw': 'Desenhar assinatura novamente…',

  // TransformPanel
  'transform.sample': `# Boas-vindas ao Universal PDF

Cole **Markdown** aqui e clique em *Gerar PDF* para transformar texto formatado em um documento limpo e pronto para imprimir.

## Formatação compatível

- Títulos com \`#\`, \`##\` e \`###\`
- **Negrito**, *itálico* e \`código em linha\`
- Listas com marcadores e numeradas
- Blocos de código delimitados, tabelas e linhas horizontais
- [Links clicáveis](https://www.unisim.co.uk)

> As citações são destacadas com uma barra colorida.

### Tabela de exemplo

| Recurso | Status | Observações |
|---|---|---|
| Títulos | pronto | H1, H2, H3 |
| Tabelas | pronto | largura automática das colunas |
| Blocos de código | pronto | fonte monoespaçada, quebra de linha |

\`\`\`
Blocos de código preservam os espaços.
  O recuo continua no lugar.
\`\`\`

---

Substitua este exemplo pelo seu próprio texto para gerar um PDF personalizado.
`,
  'transform.build_failed': 'Falha ao gerar o PDF: {error}',
  'transform.drop_wrong_type': 'Solte um arquivo Markdown (.md) ou de texto simples (.txt).',
  'transform.read_failed': 'Não foi possível ler o arquivo.',
  'transform.title': 'Transformar texto em PDF',
  'transform.subtitle': 'Cole Markdown (ou texto simples). Títulos, listas, tabelas, código e links são compatíveis.',
  'transform.placeholder': '# Meu documento\n\nComece a escrever em Markdown…',
  'transform.drop_to_load': 'Solte para carregar',
  'transform.drop_types': '.md ou .txt',
  'transform.load_sample': 'Carregar exemplo',
  'transform.page': 'Página',
  'transform.orientation_aria': 'Orientação da página',
  'transform.portrait': 'Retrato',
  'transform.landscape': 'Paisagem',
  'transform.drag_hint': 'Arraste um arquivo .md / .txt para carregar',
  'transform.build_shortcut': '{keys} para gerar',
  'transform.building': 'Gerando…',
  'transform.build': 'Gerar PDF',
}

export default annotate
