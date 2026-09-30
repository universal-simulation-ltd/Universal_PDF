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

A opção **Fazer backup** oferece três níveis:

1. **Salvar no navegador.** Automático, e só neste aparelho.
2. **Salvar no computador.** Baixa um único arquivo de backup com o PDF original e suas edições, ainda editáveis. Importe esse arquivo depois, em qualquer aparelho, para continuar de onde parou. O arquivo não é criptografado, então cuide dele como cuidaria do próprio PDF.
3. **Hospedado pela UNI·SIM.** Guarda o PDF finalizado on-line, vinculado ao seu Universal ID, para que você possa abri-lo em outro aparelho. É gratuito com um Universal ID; contas gratuitas têm um limite generoso — se você chegar a ele, exclua algo de que não precisa mais ou obtenha mais.

## Assinar pelo celular

Se você escolher desenhar sua assinatura no celular, o desenho vai do celular para o aplicativo passando pelo nosso servidor, como uma mensagem de curta duração. Ele não fica salvo lá. O aplicativo só aceita o desenho se o PIN que ele mostra for digitado no celular.

## O que o aplicativo envia mesmo quando seu PDF fica onde está

Se você entrar na sua conta, o aplicativo registra que foi aberto, para a página de atividade da sua conta. Enquanto está na tela, ele também envia uma pequena mensagem de "em uso" mais ou menos a cada 45 segundos, com o nome do aplicativo e um identificador aleatório deste aparelho. Nenhuma das duas inclui nada sobre os seus arquivos. Não há publicidade nem rastreamento de terceiros.`,
  },
  {
    id: 'signing-a-pdf',
    title: 'Assinar um PDF você mesmo',
    summary: 'O que é uma assinatura colocada no aplicativo, e o que ela não é.',
    group: 'Como funciona',
    body: `Você pode assinar um PDF desenhando sua assinatura com o mouse, o trackpad ou o dedo, desenhando no celular ou importando uma imagem da sua assinatura. Você pode salvar assinaturas e carimbos para usar de novo, e adicionar seu nome e a data embaixo deles.

Quando você coloca uma assinatura, ela é uma imagem posicionada na página. Quando você baixa o PDF, essa imagem é incorporada à página como qualquer outra adição. Tudo isso acontece no seu aparelho.

## Caixas de assinatura

Se você estiver preparando um documento para outra pessoa, pode desenhar uma caixa "Assine aqui" na página. Também pode exigir que a caixa receba uma assinatura desenhada à mão, e não uma imagem enviada. Desenhar no celular também conta como desenhar à mão.

## O que é esse tipo de assinatura

É o que normalmente se chama de **assinatura eletrônica**: uma marca em um documento que mostra que a pessoa teve a intenção de assiná-lo. Muitos países consideram assinaturas eletrônicas válidas para uma grande variedade de acordos do dia a dia, e muitas organizações as aceitam.

## O que ela não é

Não é uma **assinatura digital** no sentido técnico. Uma assinatura digital usa um certificado, muitas vezes emitido por uma autoridade confiável, para lacrar o arquivo por criptografia, de modo que qualquer alteração posterior possa ser detectada pelo aplicativo de PDF. O Universal PDF não adiciona esse tipo de lacre a um arquivo que você mesmo assina.

Isso importa porque a imagem de uma assinatura em um PDF não prova, sozinha, quem a colocou ali, nem que o documento não foi alterado depois. Se você precisa de um registro de quem assinou e quando, use **Enviar para assinatura**, que mantém um registro de atividades no servidor e uma impressão digital de cada versão assinada. Os próximos artigos explicam como.

## Uma observação sobre a lei

Isto não é aconselhamento jurídico. Se uma assinatura eletrônica é aceitável depende de onde você está, de que documento se trata e do que a outra parte aceita. Alguns documentos, como certas transações de imóveis, testamentos ou documentos que precisam de testemunhas, costumam ter regras mais rígidas. Se o documento for importante, verifique o que é exigido antes de confiar em qualquer assinatura eletrônica.`,
  },
  {
    id: 'send-to-sign',
    title: 'Como funciona o Enviar para assinatura',
    summary: 'Como pedir que outra pessoa assine, passo a passo.',
    group: 'Como funciona',
    body: `O Enviar para assinatura permite pedir que outra pessoa assine um PDF on-line e dá a vocês dois um registro do que aconteceu. Você precisa ter entrado com um Universal ID, e seu endereço de e-mail precisa estar verificado, porque a solicitação é enviada em seu nome.

## Os passos

1. **Marque onde assinar.** Adicione pelo menos uma caixa "Assine aqui" ao documento, para que a outra pessoa saiba onde vai a assinatura dela.
2. **Guarde on-line.** O PDF finalizado, com tudo o que você adicionou já incorporado, é guardado on-line, vinculado ao seu Universal ID. É gratuito com um Universal ID; contas gratuitas têm um limite generoso — se você chegar a ele, exclua algo de que não precisa mais ou obtenha mais.
3. **Escolha quem pode abrir.** Ou qualquer pessoa com o link, ou só a pessoa a quem você endereçar. Veja "Quão seguro é o Enviar para assinatura?" para saber o que essa escolha muda.
4. **Envie.** Copie o link e envie você mesmo, ou digite o e-mail da pessoa e o aplicativo envia por você. Em um link aberto, o e-mail inclui o PDF como anexo. Em um link protegido, não inclui, porque o anexo driblaria a proteção.

## Dois signatários, em qualquer ordem

Cada solicitação tem dois signatários: você e a pessoa para quem você enviou. Cada um recebe o próprio link, e vocês podem assinar em qualquer ordem. Quem assinar por último trabalha na cópia que já tem a primeira assinatura.

## O que acontece quando alguém assina

O signatário abre o documento no navegador, assina e envia. A cópia assinada é guardada como uma nova versão; as versões anteriores são mantidas, não substituídas. Cada etapa fica registrada em um registro de atividades. Quando vocês dois tiverem assinado, a solicitação está concluída e os dois recebem um e-mail com um link para o certificado.

## O certificado

Toda solicitação tem uma página de certificado. Ela mostra o documento, quem foi cada signatário pelo endereço de e-mail, se cada um já assinou e o registro de atividades: quando o documento foi aberto, o que foi adicionado, de que país veio a solicitação e uma impressão digital do documento em cada etapa. Você pode baixar o PDF assinado final por essa página enquanto a cópia guardada existir.

## Limites

Os links de assinatura expiram depois de 30 dias. Os arquivos guardados podem ter até 50 MB, e um arquivo enviado como anexo de e-mail precisa ter menos de 30 MB.`,
  },
  {
    id: 'send-to-sign-security',
    title: 'Quão seguro é o Enviar para assinatura?',
    summary: 'O que é criptografado, o que nosso servidor consegue ver e como funciona a trilha de auditoria.',
    group: 'Privacidade e segurança',
    body: `O Enviar para assinatura é o único recurso em que seu documento precisa sair do seu aparelho, porque outra pessoa precisa recebê-lo. Veja exatamente o que isso envolve.

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
