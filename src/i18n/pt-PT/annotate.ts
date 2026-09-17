import type { Messages } from '../en'

const annotate: Messages['annotate'] = {
  // Shared
  'common.close': 'Fechar',
  'common.cancel': 'Cancelar',
  'common.done': 'Concluído',

  // AnnotationLayer — redaction caption, drawn on the page in the editor only (never exported)
  'redact.hint': 'Isto será rasurado ao exportar',

  // ColorCluster (the swatches on the floating pills)
  'color.black': 'Preto',
  'color.white': 'Branco',
  'color.more': 'Mais cores',

  // SigField (an unsigned "Sign here" box on the page)
  'sigfield.sign_here': 'Assinar aqui',
  'sigfield.name': 'Nome',
  'sigfield.date': 'Data',
  'sigfield.live': 'Manuscrita',
  'sigfield.click_again': 'Clique novamente para assinar',

  // AnnotationLayer — Delete / Confirm / Edit buttons beside a selected object
  'selection.delete': 'Eliminar',
  'selection.delete_aria': 'Eliminar objeto selecionado',
  'selection.done_to_select': 'Concluído — manter e voltar a Selecionar',
  'selection.done_deselect': 'Concluído — manter e desselecionar',
  'selection.confirm_aria': 'Confirmar e desselecionar',
  'selection.qr_edit_title': 'Editar este código QR — ligação, estilo ou marca',
  'selection.qr_edit_aria': 'Editar este código QR',

  // AnnotationLayer — text pill (size, bold / italic / underline / link)
  'text.bold_letter': 'N',
  'text.bold': 'Negrito',
  'text.italic_letter': 'I',
  'text.italic': 'Itálico',
  'text.underline_letter': 'S',
  'text.underline': 'Sublinhado',
  'text.link_selection': 'Associar ligação ao texto selecionado',
  'text.edit_link': 'Editar ligação',
  'text.add_link': 'Adicionar ligação',
  'text.link_prompt': 'URL da ligação (deixar em branco para remover):',
  'text.link_prompt_selection': 'URL da ligação para o texto selecionado (em branco para remover):',
  'text.size_decrease': 'Diminuir tamanho do texto',
  'text.size_field': 'Tamanho do tipo de letra em pontos',
  'text.size_increase': 'Aumentar tamanho do texto',

  // AnnotationLayer — image pill (border around a placed picture or QR code)
  'image.border': 'Contorno',
  'image.border_none': 'Nenhum',
  'image.border_none_title': 'Sem contorno',
  'image.border_width': 'Contorno de {width}px',
  'image.border_solid': 'Contínuo',
  'image.border_dashed': 'Tracejado',

  // AnnotationLayer — line pill
  'line.stroke': 'Traço',
  'line.snap_title': 'Linha rígida — ajustar à horizontal, vertical ou diagonal (manter Shift premido ao arrastar uma extremidade para um ajuste pontual)',
  'line.snap_on': 'Ajuste ativo',
  'line.snap_off': 'Ajuste inativo',

  // AnnotationLayer — colour pill for ticks, crosses, boxes, circles, pen strokes
  'shape.colour': 'Cor',

  // AnnotationLayer — multi-selection delete
  'selection.delete_many_one': 'Eliminar {count} objeto',
  'selection.delete_many_other': 'Eliminar {count} objetos',
  'selection.delete_many_aria_one': 'Eliminar {count} objeto selecionado',
  'selection.delete_many_aria_other': 'Eliminar {count} objetos selecionados',

  // AnnotationLayer — Send to sign on a selected "Sign here" box
  'sigfield.send_title': 'Enviar para assinatura — enviar este documento por email como pedido de assinatura',
  'sigfield.send_aria': 'Enviar para assinatura',

  // AnnotationLayer — Fill / Redact toggles on a box or circle
  'shape.fill_clear': 'Remover preenchimento',
  'shape.fill': 'Preencher com a cor ativa',
  'shape.redact_title': 'Rasurar — tapa a área a negro e remove permanentemente o texto ao exportar',
  'shape.redact_aria': 'Rasurar esta área',
  'redact.to_fill_title': 'Converter numa forma preenchida — o texto por baixo DEIXA de ser removido ao exportar',
  'redact.to_fill_aria': 'Converter esta rasura numa forma preenchida',

  // AnnotationLayer — fill-vs-redact warning dialog
  'fill_warning.title': 'Preencher não oculta o texto',
  'fill_warning.body': 'Uma caixa preenchida apenas pinta por cima da página. O texto por baixo continua selecionável e legível por um computador. Para o remover definitivamente, use a rasura.',
  'fill_warning.dont_show': 'Não mostrar novamente',
  'fill_warning.fill_anyway': 'Preencher mesmo assim',
  'fill_warning.redact_instead': 'Rasurar em vez disso',

  // AnnotationLayer — size + alignment pill on a signature with labels
  'sig_pill.size': 'Tamanho',
  'sig_pill.smaller': 'Etiquetas mais pequenas',
  'sig_pill.bigger': 'Etiquetas maiores',
  'sig_pill.align_title': 'Alinhar etiquetas: {align} (clique para alternar)',
  'sig_pill.align_aria': 'Etiquetas alinhadas {align}, clique para alterar',
  'sig_pill.align_left': 'à esquerda',
  'sig_pill.align_centre': 'ao centro',
  'sig_pill.align_right': 'à direita',

  // SignatureOptionsModal
  'sig_options.title': 'Opções de assinatura',
  'sig_options.intro_restyle': 'Altera as etiquetas e o estilo da caneta — os traços desenhados ficam exatamente como foram desenhados. Use a barra sobre a assinatura para redimensionar ou alinhar as etiquetas.',
  'sig_options.intro': 'Altera apenas o nome e a data — a assinatura em si fica exatamente como foi desenhada. Use a barra sobre a assinatura para redimensionar ou alinhar as etiquetas.',
  'sig_options.add_details': 'Adicionar os seus dados',
  'sig_options.details_aria': 'Dados a mostrar por baixo da assinatura',
  'sig_options.add_date': 'Adicionar data',
  'sig_options.date_aria': 'Linha de data por baixo da assinatura',
  'sig_options.realistic': 'Dar um aspeto mais realista',
  'sig_options.realistic_hint': 'Tinta azul, pressão irregular e um ligeiro tremor da mão',
  'sig_options.redraw': 'Redesenhar assinatura…',

  // TransformPanel
  'transform.sample': `# Boas-vindas ao Universal PDF

Cole aqui **Markdown** e clique em *Criar PDF* para transformar texto formatado num documento limpo e pronto a imprimir.

## Formatação suportada

- Títulos com \`#\`, \`##\` e \`###\`
- **Negrito**, *itálico* e \`código em linha\`
- Listas com marcas e numeradas
- Blocos de código delimitados, tabelas e linhas horizontais
- [Ligações clicáveis](https://www.unisim.co.uk)

> As citações são destacadas com uma barra colorida.

### Tabela de exemplo

| Funcionalidade | Estado | Notas |
|---|---|---|
| Títulos | pronto | H1, H2, H3 |
| Tabelas | pronto | largura automática das colunas |
| Blocos de código | pronto | letra monoespaçada, com quebra de linha |

\`\`\`
Os blocos de código preservam os espaços.
  A indentação mantém-se.
\`\`\`

---

Substitua este exemplo pelo seu próprio texto para criar um PDF personalizado.
`,
  'transform.build_failed': 'Falha ao criar o PDF: {error}',
  'transform.drop_wrong_type': 'Largue um ficheiro Markdown (.md) ou de texto simples (.txt).',
  'transform.read_failed': 'Não foi possível ler o ficheiro.',
  'transform.title': 'Transformar texto num PDF',
  'transform.subtitle': 'Cole Markdown (ou texto simples). Suporta títulos, listas, tabelas, código e ligações.',
  'transform.placeholder': '# O meu documento\n\nComece a escrever Markdown…',
  'transform.drop_to_load': 'Largar para carregar',
  'transform.drop_types': '.md ou .txt',
  'transform.load_sample': 'Carregar exemplo',
  'transform.page': 'Página',
  'transform.orientation_aria': 'Orientação da página',
  'transform.portrait': 'Vertical',
  'transform.landscape': 'Horizontal',
  'transform.drag_hint': 'Arraste um ficheiro .md / .txt para carregar',
  'transform.build_shortcut': '{keys} para criar',
  'transform.building': 'A criar…',
  'transform.build': 'Criar PDF',
}

export default annotate
