import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-pdf',
    title: 'Afinal, o que é um PDF?',
    summary: 'De onde veio o formato e por que ele fica igual em qualquer lugar.',
    group: 'O básico',
    body: `PDF significa Portable Document Format (formato de documento portátil). A Adobe lançou o formato em 1993 para resolver um problema simples: um documento que aparecia certo em um computador muitas vezes aparecia errado em outro, porque o outro computador tinha fontes diferentes, uma impressora diferente ou outra versão do programa.

O PDF fixa a página. Em vez de dizer "aqui está um parágrafo, organize como der", ele diz, na prática, "desenhe estas letras, nesta fonte, exatamente nestas posições, em uma página exatamente deste tamanho". É por isso que um PDF fica igual no celular, no notebook ou na máquina de uma gráfica.

## Quem é o dono

Ninguém, hoje em dia. A Adobe publicou a especificação logo no início e, em 2008, o PDF virou um padrão internacional aberto, a ISO 32000. A versão atual, o PDF 2.0, veio em 2017. Qualquer pessoa pode criar um programa que leia ou gere PDFs, e é por isso que tantos aplicativos conseguem fazer isso.

## O que um PDF pode conter

- Texto, com as fontes necessárias para desenhá-lo
- Imagens, incluindo páginas inteiras escaneadas
- Desenhos e formas
- Campos de formulário para preencher
- Links, marcadores e comentários
- Informações sobre o próprio documento, como título e autor
- Uma proteção com senha, se alguém tiver colocado

## Alguns tipos de PDF que você pode ouvir falar

**PDF/A** é uma versão mais rígida, feita para arquivamento de longo prazo, padronizada como ISO 19005. Ela exige que tudo o que é necessário para exibir o documento, como as fontes, esteja dentro do arquivo, e não permite criptografia, para que o documento ainda possa ser aberto daqui a décadas.

**Formulários preenchíveis** têm campos em que você pode digitar. A maioria usa um sistema que faz parte do próprio padrão PDF. Uma minoria usa um modelo mais antigo chamado XFA, que depois foi retirado do padrão e que muitos aplicativos, incluindo este, só conseguem suportar em parte.

## O outro lado da moeda

O mesmo que torna o PDF confiável torna difícil alterá-lo. Ele foi pensado para ser uma página finalizada, não um rascunho. O próximo artigo explica por quê.`,
  },
  {
    id: 'inside-a-pdf',
    title: 'Por que é tão difícil editar um PDF?',
    summary: 'Texto versus imagens escaneadas, fontes embutidas e as informações escondidas no arquivo.',
    group: 'O básico',
    body: `Se você já tentou trocar uma palavra em um PDF e viu que o resto da linha não se mexia para abrir espaço, você conheceu na prática o jeito como os PDFs são construídos.

## O texto é posicionado, não flui

Um editor de texto guarda parágrafos e calcula onde as linhas quebram toda vez que você edita. Um PDF normalmente guarda o resultado: pequenos trechos de letras, cada um preso a uma posição exata. Muitas vezes não há nada no arquivo dizendo "estas linhas são um parágrafo" ou "isto é uma tabela". Mude uma palavra e nada sabe como reorganizar o que vem depois.

## As fontes muitas vezes estão incompletas

Para ficar igual em qualquer lugar, o PDF normalmente leva as fontes dentro dele. Para manter o arquivo pequeno, muitas vezes leva só as letras que o documento de fato usa. Então, mesmo que você conseguisse adicionar texto novo na fonte original, a letra de que você precisa pode simplesmente não estar no arquivo.

## Alguns PDFs não têm texto nenhum

Um documento escaneado é um PDF com uma foto de cada página. Parece texto, mas para o computador é uma imagem: você não consegue pesquisar, selecionar nem copiar nada dele.

O Universal PDF resolve isso com **Tornar pesquisável (OCR)**. Ele lê as palavras da imagem e coloca uma camada invisível de texto sobre a página, nas mesmas posições. A página continua exatamente como era, mas agora você pode pesquisar e selecionar trechos. O reconhecimento nunca é perfeito, então confira tudo o que for importante.

## Os arquivos levam informações sobre si mesmos

A maioria dos PDFs inclui dados como título, autor, o programa que criou o arquivo e quando ele foi criado ou alterado. Isso não aparece na página, mas qualquer pessoa que abrir as propriedades do documento consegue ver. O Universal PDF permite que você veja esses dados e, ao exportar, escolha mantê-los ou removê-los.

## Então, como alguém edita um PDF?

Principalmente adicionando coisas por cima, em vez de reescrever o que está embaixo: caixas de texto, destaques, desenhos, assinaturas e campos de formulário preenchidos. É assim que o Universal PDF funciona. Suas adições ficam separadas e editáveis enquanto você trabalha, e são incorporadas às páginas quando você salva.`,
  },
  {
    id: 'flattening-and-redaction',
    title: 'O que significa "achatar"?',
    summary: 'Incorporar suas alterações à página, e por que uma tarja preta nem sempre é uma tarja de verdade.',
    group: 'O básico',
    body: `"Achatar" significa incorporar algo à página de modo que não dê mais para separar ou alterar como um item individual. Existem alguns tipos, e vale saber qual é qual.

## Achatar suas adições

Enquanto você trabalha no Universal PDF, seus textos, destaques, desenhos e assinaturas são itens separados que você pode mover ou excluir. Quando você baixa o PDF finalizado, eles são desenhados de forma permanente nas páginas, e os campos de formulário preenchidos viram texto comum. Quem abrir o arquivo baixado vai vê-los como parte do documento, em qualquer aplicativo de PDF.

O documento que você tem aberto não muda com isso. Você pode continuar editando e baixar de novo.

## Achatar páginas em imagens

Nas opções de exportação avançada, você pode ir além e transformar cada página em uma imagem. Aí ninguém consegue selecionar, copiar, pesquisar nem editar o texto, o que pode ser útil para um documento que você assinou. A desvantagem é que o texto deixa de ser texto: não dá para pesquisá-lo, e leitores de tela não conseguem lê-lo em voz alta. A cópia que você baixa é achatada; o documento aberto mantém o texto.

## Por que um retângulo preto não é uma tarja

Um erro comum e grave é esconder um texto sigiloso desenhando um retângulo preto por cima. O texto continua no arquivo, por baixo. Muitas vezes qualquer pessoa consegue selecioná-lo, copiá-lo ou remover o retângulo.

A ferramenta de tarja do Universal PDF funciona de outro jeito. Quando você salva, exporta ou envia um documento com tarjas, cada página afetada é transformada em uma imagem com as caixas pretas gravadas nela, e a página é reconstruída a partir dessa imagem. O texto que estava embaixo das caixas é removido da cópia salva para sempre. Como isso não pode ser desfeito, o aplicativo pede sua confirmação antes.

Alguns cuidados práticos:

- A tarja só remove o que a caixa cobre, então confira as bordas de cada caixa.
- As informações sobre o documento, como título e autor, ficam separadas das páginas. Confira-as também antes de compartilhar um documento tarjado.
- Guarde o original sem tarjas em um lugar seguro, se ainda precisar dele.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Onde o trabalho acontece',
    summary: 'O que o Universal PDF faz no seu aparelho e as poucas coisas que vão para a internet.',
    group: 'Como funciona',
    body: `Quase tudo o que o Universal PDF faz acontece no seu próprio aparelho. Seu PDF não é enviado pela internet para ser aberto, desenhado ou salvo.

## No seu aparelho

- **Abrir e exibir as páginas.** O aplicativo lê o arquivo e desenha cada página no seu aparelho, usando o PDF.js, de código aberto, da Mozilla.
- **Editar, preencher formulários e assinar.** Suas adições, e o arquivo final que você baixa, são montados no seu aparelho.
- **Tornar documentos escaneados pesquisáveis (OCR).** O reconhecimento em si roda no seu aparelho. Na primeira vez que você usa, o aplicativo baixa o mecanismo de reconhecimento e os dados do idioma, que depois ficam guardados para não precisar buscá-los de novo.
- **Converter arquivos do Word e do OpenDocument.** Um arquivo .docx ou .odt é transformado em PDF no seu aparelho. O resultado é diagramado de novo, então o layout não vai ficar exatamente igual ao original.
- **Proteger com senha e desbloquear.** Feito no seu aparelho. Sua senha nunca é enviada para lugar nenhum.

Você mesmo pode testar: depois que o aplicativo carregar, desligue a internet e continue trabalhando.

## O que o aplicativo guarda neste aparelho

Os arquivos abertos recentemente ficam guardados no armazenamento do próprio navegador neste aparelho, para que voltem quando você atualizar a página. As assinaturas e os carimbos que você salva também ficam lá. Limpar os dados do navegador para o site apaga tudo isso. Nada disso é enviado para nós.

## Guardar uma cópia

A opção **Fazer backup** oferece dois níveis, ambos do seu lado:

1. **Salvar no navegador.** Automático, e só neste aparelho.
2. **Salvar no computador.** Baixa um único arquivo de backup com o PDF original e suas edições, ainda editáveis. Importe esse arquivo depois, em qualquer aparelho, para continuar de onde parou. O arquivo não é criptografado, então cuide dele como cuidaria do próprio PDF.

## Assinar pelo celular

Se você escolher desenhar sua assinatura no celular, o desenho vai do celular para o aplicativo passando pelo nosso servidor, como uma mensagem de curta duração. Ele não fica salvo lá. O aplicativo só aceita o desenho se o PIN que ele mostra for digitado no celular.

## O que o aplicativo envia mesmo quando seu PDF fica onde está

No site e no aplicativo para computador, você pode entrar com um Universal ID e, enquanto estiver conectado, o aplicativo registra que foi aberto, para a página de atividade da sua conta. Os aplicativos para celular e a extensão do navegador não têm login. No site, na primeira vez que você abre o aplicativo a cada dia, ele também soma um à contagem anônima de aberturas do dia, enviada depois do seu primeiro clique ou tecla pressionada. Essa contagem contém só o nome do aplicativo e o tipo de plataforma ("web" no site): nenhum identificador, nenhuma conta e nada sobre o que você faz. Uma marca de "já contado hoje" fica no seu dispositivo e nunca é enviada. Os aplicativos para celular e computador e a extensão do navegador não a enviam. Nada do que o aplicativo envia inclui algo sobre os seus arquivos. Não há publicidade nem rastreamento de terceiros.`,
  },
  {
    id: 'signing-a-pdf',
    title: 'Assinar um PDF você mesmo',
    summary: 'O que é uma assinatura colocada no aplicativo, e o que ela não é.',
    group: 'Como funciona',
    body: `Você pode assinar um PDF desenhando sua assinatura com o mouse, o trackpad ou o dedo, desenhando no celular ou importando uma imagem da sua assinatura. Você pode salvar assinaturas e carimbos para usar de novo, e adicionar seu nome e a data embaixo deles. Nada disso exige conta.

Quando você coloca uma assinatura, ela é uma imagem posicionada na página. Quando você baixa o PDF, essa imagem é incorporada à página como qualquer outra adição. Tudo isso acontece no seu aparelho.

## Caixas de assinatura

Se você está preparando um documento para outra pessoa, pode colocar uma caixa “Assine aqui” na página e pedir junto o nome e a data. Também pode exigir que uma caixa seja assinada à mão, e não com uma imagem enviada. Desenhar no celular conta como assinatura à mão.

Quando você salva ou compartilha o PDF, cada caixa que você não assinou vira um campo de assinatura de verdade, do tipo que outros aplicativos de PDF entendem. Quem receber pode assinar no Universal PDF, no Adobe Acrobat ou Reader, ou na Pré-Visualização da Apple. Quando o Universal PDF abre um PDF com um campo de assinatura vazio, nosso ou de outro aplicativo, ele mostra uma caixa para tocar e assinar. Veja “Enviar um PDF para assinatura”.

## O que é esse tipo de assinatura

É o que normalmente se chama de **assinatura eletrônica**: uma marca em um documento que mostra que a pessoa teve a intenção de assiná-lo. Muitos países consideram assinaturas eletrônicas válidas para uma grande variedade de acordos do dia a dia, e muitas organizações as aceitam.

## O que ela não é

Não é uma **assinatura digital** no sentido técnico. Uma assinatura digital usa um certificado, muitas vezes emitido por uma autoridade confiável, para lacrar o arquivo por criptografia, de modo que qualquer alteração posterior possa ser detectada pelo aplicativo de PDF. O Universal PDF não adiciona esse tipo de lacre a um arquivo que você mesmo assina.

Isso importa porque a imagem de uma assinatura num PDF não prova, sozinha, quem a colocou nem que o documento não foi alterado depois. Se você precisa de um registro de quem assinou e quando, use uma **assinatura certificada** no site do Universal PDF ou no aplicativo para computador, que guarda um registro de atividade no servidor e uma impressão digital de cada versão assinada. Os próximos artigos explicam como.

## Uma observação sobre a lei

Isto não é aconselhamento jurídico. Se uma assinatura eletrônica é aceitável depende de onde você está, de que documento se trata e do que a outra parte aceita. Alguns documentos, como certas transações de imóveis, testamentos ou documentos que precisam de testemunhas, costumam ter regras mais rígidas. Se o documento for importante, verifique o que é exigido antes de confiar em qualquer assinatura eletrônica.`,
  },
  {
    id: 'send-to-sign',
    title: 'Enviar um PDF para assinatura',
    summary: 'Basta compartilhar o arquivo, ou obtenha uma assinatura certificada no site ou no aplicativo para computador.',
    group: 'Como funciona',
    body: `Há duas formas de pedir que outra pessoa assine um PDF. A forma simples funciona em qualquer lugar, não exige conta e não envia nada para a nuvem. A forma certificada, no site e no aplicativo para computador, acrescenta um registro de quem assinou e quando.

## Enviar para assinatura

1. **Marque onde assinar.** Abra **Assinar**, escolha **Solicitar** e coloque uma caixa “Assine aqui” onde cada assinatura deve ficar. Marque antes **Pedir nome** ou **Pedir data** se quiser.
2. **Assine a sua parte, se você também assina.** Toque na sua caixa e assine antes de enviar.
3. **Envie.** Escolha **Enviar para assinatura**. No celular, a folha de compartilhamento abre, e você pode mandar o PDF por mensagem, por e-mail ou por qualquer aplicativo. No computador, o PDF é salvo ou baixado, e o navegador também pode oferecer o compartilhamento.

Cada caixa que você deixou sem assinar vira um campo de assinatura de verdade. Quem receber o arquivo pode assinar no Universal PDF, no Adobe Acrobat ou Reader, ou na Pré-Visualização ou no Arquivos da Apple, e devolver do mesmo jeito. A pessoa não precisa de conta, e nada passa por nós.

## Assinatura certificada (site e aplicativo para computador)

Se você precisa de prova de quem assinou e quando, o site do Universal PDF e o aplicativo para computador oferecem a assinatura certificada. Você precisa de um Universal ID gratuito; quem assina, não. Seu PDF fica guardado on-line, o signatário recebe um link e vocês dois recebem um certificado com registro de atividade. Os aplicativos para celular não oferecem essa opção.

1. **Marque onde assinar**, como acima.
2. **Escolha Enviar para assinatura e depois Assinatura certificada.**
3. **Escolha quem pode abrir.** Qualquer pessoa com o link, ou só a pessoa a quem você endereçar. Veja “Quão segura é uma assinatura certificada?” para saber o que essa escolha muda.
4. **Envie.** Copie o link e envie você mesmo, ou digite o e-mail da pessoa e nós enviamos. Com um link aberto, o e-mail leva o PDF anexado. Com um link protegido, não, porque o anexo driblaria a proteção.

## Dois signatários, em qualquer ordem

Uma solicitação certificada tem dois signatários: você e a pessoa a quem enviou. Cada um recebe o próprio link, e vocês podem assinar em qualquer ordem. Quem assina por último trabalha na cópia que já tem a primeira assinatura. Quando os dois assinam, a solicitação fica completa e ambos recebem um e-mail com um link para o certificado.

## O certificado

Toda solicitação certificada tem uma página de certificado. Ela mostra o documento, o e-mail de cada signatário, se cada um assinou e o registro de atividade: quando o documento foi aberto, o que foi adicionado, de que país veio a solicitação e uma impressão digital do documento em cada etapa. Você pode baixar ali o PDF assinado final enquanto a cópia guardada existir. Uma solicitação concluída é mantida por 7 anos.

## Limites

Os links de assinatura expiram depois de 30 dias. Os arquivos guardados podem ter até 50 MB, e um arquivo enviado como anexo precisa ter menos de 30 MB.`,
  },
  {
    id: 'page-scrolling',
    title: 'Páginas uma embaixo da outra ou lado a lado',
    summary: 'A configuração Rolagem das páginas: uma página embaixo da outra, ou as páginas em fila.',
    group: 'Como funciona',
    body: `O Universal PDF coloca as páginas de um documento lado a lado, em fila, tanto no computador quanto no celular, e você passa de uma página para a outra de lado, como quem vira as páginas de um livro: deslizando no celular, ou com a roda do mouse ou o touchpad no computador. Se preferir rolar para baixo, você pode colocá-las uma embaixo da outra.

## Como mudar

1. Abra o menu no canto superior direito, ao lado da sua foto de perfil (com um documento aberto, ele se chama **Ações**), e escolha **Ajustar este app**.
2. Em **Rolagem das páginas**, escolha **Vertical** para uma página embaixo da outra, ou **Horizontal** para as páginas lado a lado.

Dá para mudar na tela inicial, antes de abrir qualquer coisa, ou com um documento já aberto. Um documento aberto muda na hora e continua na página que você estava lendo.

## Lendo em fila

- **Ao abrir um documento**, a página se ajusta à altura da janela, então ela aparece inteira na tela e não há nada para rolar para cima ou para baixo. A primeira página fica no meio da tela.
- **A roda do mouse** avança pela fila: gire para baixo para ir à próxima página e para cima para voltar. Se você aumentou o zoom a ponto de a página ficar mais alta que a janela, a roda primeiro rola essa página até o fim e depois passa para a próxima.
- **O trackpad** percorre a fila com um deslize para o lado, como em qualquer outro lugar.
- **Ir para uma página**, pela lista **Páginas** ou por um link dentro do documento, leva essa página para o meio da tela.

Se você mudar para Horizontal com um documento já aberto, ele mantém o zoom atual. O ajuste à altura da janela acontece quando um documento é aberto.

## Onde a escolha fica guardada

A configuração fica guardada no armazenamento do seu navegador, só neste aparelho, então cada um dos seus aparelhos pode ter a sua. Ela não é salva na sua conta. **Restaurar padrões**, no fim de Ajustar este app, volta para o que o aparelho usa de início: Horizontal no celular, Vertical no computador.`,
  },
  {
    id: 'send-to-sign-security',
    title: 'Quão segura é uma assinatura certificada?',
    summary: 'O que é criptografado, o que nosso servidor consegue ver e como funciona a trilha de auditoria.',
    group: 'Privacidade e segurança',
    body: `A assinatura certificada, oferecida no site do Universal PDF e no aplicativo para computador, é a única função em que o seu documento precisa sair do seu dispositivo: ele é guardado para que o signatário possa abri-lo e para que fique um registro. Veja exatamente o que isso envolve. Enviar um PDF para assinatura sem ela não envia nada para a nuvem; o arquivo vai só para onde você mandar.

## Criptografia, em palavras simples

- **Em trânsito:** tudo o que passa entre o aplicativo e nosso servidor viaja por HTTPS, então vai criptografado no caminho.
- **Em repouso:** o documento guardado fica em um armazenamento privado e criptografado, que não pode ser lido publicamente.
- **Não é de ponta a ponta:** nós temos as chaves desse armazenamento, então nossos sistemas conseguem ler o documento. Isso é necessário para o servidor entregá-lo ao signatário e gerar a impressão digital de cada versão. A proteção é uma promessa sobre como operamos, não uma garantia matemática. Se isso for importante para um determinado documento, não o envie dessa forma.

O e-mail é outra história. Se o aplicativo enviar o PDF como anexo, ele fica tão privado quanto a caixa de entrada do destinatário e qualquer lugar para onde o e-mail for encaminhado.

## O link é a chave

O link de cada signatário contém um código aleatório longo que, na prática, não dá para adivinhar. Quando o link é aberto, nosso servidor confere o código e, se for válido, dá ao navegador um endereço temporário para o documento que funciona por 10 minutos. Os links param de funcionar depois de 30 dias e, depois que uma pessoa assina, o link dela não pode ser usado para assinar de novo.

## Qualquer pessoa com o link, ou só o destinatário

Com **Qualquer pessoa com o link**, quem tiver o link pode abrir e assinar. Se o e-mail for encaminhado, quem o receber pode assinar.

Com **Só a pessoa a quem você endereçar**, o documento não abre até que o visitante prove que consegue ler o endereço que você informou:

- Ele digita o endereço. Se bater, um código de 6 dígitos é enviado para o endereço que você informou, nunca para algo que o visitante digitou.
- O código vale por 10 minutos e permite 5 tentativas, compartilhadas com o PIN, se houver um. No máximo 5 códigos podem ser enviados por link, com pelo menos um minuto de intervalo.
- Depois de verificado, ele tem 4 horas para ler e assinar.
- Você também pode exigir um PIN de 6 dígitos, que o aplicativo gera para você passar por telefone ou mensagem. Só uma impressão digital SHA-256 do PIN, com salt, é guardada, e é por isso que ele não pode ser mostrado para você de novo.

## A trilha de auditoria

Cada vez que uma cópia assinada volta, nosso servidor calcula a impressão digital SHA-256 dela e a registra junto com a impressão digital da versão que ela substituiu. Mude um único byte do arquivo e a impressão digital muda por completo, então qualquer pessoa pode conferir uma cópia do documento com o certificado. Cada evento é registrado com o horário segundo o nosso servidor, o e-mail do signatário, o endereço IP e os dados do navegador dele. O certificado público mostra só o país, nunca o endereço IP completo.

A página do certificado pode ser vista por qualquer pessoa que tenha o link dela, então compartilhe com o mesmo cuidado que o documento.`,
  },
  {
    id: 'locking-a-pdf',
    title: 'Proteger um PDF com senha',
    summary: 'A criptografia usada, por que a senha é tudo e o que fazer se você esquecer.',
    group: 'Privacidade e segurança',
    body: `Nas opções de exportação avançada, você pode proteger um PDF com uma senha ou um PIN. A partir daí, quem abrir o arquivo precisa da senha para ver qualquer coisa nele, em qualquer aplicativo de PDF que suporte a criptografia moderna de PDF.

## O que a proteção realmente faz

O Universal PDF usa a criptografia mais forte que o padrão PDF oferece: **AES-256**, conforme definida no PDF 2.0. O texto, as imagens e o restante do conteúdo são lacrados com uma chave aleatória de 256 bits criada para aquele arquivo. Essa chave, por sua vez, é trancada com a sua senha.

A criptografia acontece no seu aparelho. Sua senha nunca é enviada para lugar nenhum, e nós nunca a vemos.

## Por que a senha é tudo

O AES-256 em si não é o ponto fraco. A única forma prática de entrar em um arquivo bem protegido é adivinhar a senha, de novo e de novo. O PDF 2.0 torna cada tentativa propositalmente lenta, o que ajuda muito, mas alguém com equipamento potente e tempo ainda pode tentar uma quantidade enorme de palpites.

Por isso, o aplicativo mostra mais ou menos quanto tempo sua senha aguentaria contra um invasor determinado, e ele é propositalmente cauteloso. Um PIN de 4 dígitos cai em instantes. Uma frase-senha longa, com várias palavras sem relação entre si, pode aguentar mais tempo do que qualquer pessoa estaria disposta a esperar. Escolha a senha de acordo com a importância do documento.

## O que ela não faz

Alguns aplicativos oferecem impedir que as pessoas imprimam ou copiem um PDF sem senha. Essas restrições são só pedidos ao aplicativo de leitura, e são fáceis de remover, então o Universal PDF não as oferece. Quem tiver a senha pode fazer qualquer coisa com o documento.

## Se você esquecer a senha

Ninguém consegue recuperá-la, nem nós. Não existe redefinição nem porta dos fundos. Guarde sua senha em um lugar seguro, ou mantenha uma cópia desprotegida em um lugar seguro.

## Abrir PDFs protegidos

O Universal PDF consegue abrir PDFs protegidos com AES-256 por outros aplicativos. Ele pede a senha e desbloqueia o arquivo no seu aparelho. Alguns PDFs usam esquemas de criptografia mais antigos que o aplicativo não consegue abrir; nesse caso, use o aplicativo que os protegeu.

Dica: senhas feitas de letras da Europa Ocidental, números e símbolos comuns funcionam de forma confiável em qualquer aplicativo de PDF. Alguns aplicativos tratam outros caracteres, como letras gregas, cirílicas ou chinesas, ou emojis, de forma diferente, então o aplicativo avisa você se a sua senha tiver algum deles.`,
  },
]

export default articles
