import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-pdf',
    title: 'O que é, afinal, um PDF?',
    summary: 'De onde veio o formato e porque tem o mesmo aspeto em todo o lado.',
    group: 'O essencial',
    body: `PDF significa Portable Document Format («formato de documento portátil»). A Adobe apresentou-o em 1993 para resolver um problema simples: um documento que ficava bem num computador ficava muitas vezes mal noutro, porque o outro computador tinha tipos de letra diferentes, outra impressora ou outra versão do software.

Um PDF fixa a página. Em vez de dizer «aqui está um parágrafo, disponha-o o melhor possível», diz, na prática, «desenhe estas letras, neste tipo de letra, exatamente nestas posições, numa página exatamente deste tamanho». É por isso que um PDF tem o mesmo aspeto num telemóvel, num portátil ou na máquina de uma gráfica.

## A quem pertence

Hoje em dia, a ninguém. A Adobe publicou a especificação desde cedo e, em 2008, o PDF tornou-se uma norma internacional aberta, a ISO 32000. A versão atual, o PDF 2.0, surgiu em 2017. Qualquer pessoa pode criar software que leia ou crie PDF, e é por isso que tantas apps o fazem.

## O que um PDF pode conter

- Texto, com os tipos de letra necessários para o desenhar
- Imagens, incluindo páginas digitalizadas inteiras
- Desenhos e formas
- Campos de formulário preenchíveis
- Ligações, marcadores e comentários
- Informações sobre o próprio documento, como o título e o autor
- Uma proteção com palavra-passe, se alguém a tiver adicionado

## Alguns tipos de PDF de que pode ouvir falar

**PDF/A** é uma versão mais rigorosa, destinada ao arquivo a longo prazo e normalizada como ISO 19005. Exige que tudo o que é necessário para mostrar o documento, como os tipos de letra, esteja dentro do ficheiro e não permite encriptação, para que o documento ainda possa ser aberto daqui a décadas.

**Formulários preenchíveis** contêm campos onde é possível escrever. A maioria usa um sistema que faz parte da própria norma PDF. Uma minoria usa um formato mais antigo chamado XFA, que mais tarde foi retirado da norma e que muitas apps, incluindo esta, só suportam parcialmente.

## O reverso da medalha

Aquilo que torna um PDF fiável é também o que o torna difícil de alterar. Foi concebido para ser uma página acabada, não um rascunho. O artigo seguinte explica porquê.`,
  },
  {
    id: 'inside-a-pdf',
    title: 'Porque é tão difícil editar um PDF?',
    summary: 'Texto versus imagens digitalizadas, tipos de letra incorporados e as informações escondidas num ficheiro.',
    group: 'O essencial',
    body: `Quem já tentou alterar uma palavra num PDF e viu que o resto da linha não se mexia para abrir espaço já se deparou com a forma como os PDF são construídos.

## O texto é posicionado, não flui

Um processador de texto guarda parágrafos e calcula onde as linhas quebram sempre que se edita. Um PDF normalmente guarda o resultado: pequenos grupos de letras, cada um fixado numa posição exata. Muitas vezes, nada no ficheiro diz «estas linhas formam um parágrafo» ou «isto é uma tabela». Ao alterar uma palavra, nada sabe como reorganizar o que vem a seguir.

## Os tipos de letra estão muitas vezes incompletos

Para ter o mesmo aspeto em todo o lado, um PDF costuma levar os tipos de letra dentro de si. Para manter os ficheiros pequenos, muitas vezes leva apenas as letras que o documento realmente usa. Assim, mesmo que fosse possível acrescentar texto novo no tipo de letra original, a letra necessária pode simplesmente não estar no ficheiro.

## Alguns PDF não têm texto nenhum

Um documento digitalizado é um PDF que contém uma fotografia de cada página. Parece texto, mas para um computador é uma imagem: não é possível pesquisá-lo, selecioná-lo nem copiar a partir dele.

O Universal PDF pode resolver isso com **Tornar pesquisável (OCR)**. A app lê as palavras na imagem e coloca uma camada invisível de texto sobre a página, nas mesmas posições. A página continua com exatamente o mesmo aspeto, mas passa a ser possível pesquisá-la e selecionar texto. O reconhecimento nunca é perfeito, por isso convém verificar tudo o que for importante.

## Os ficheiros contêm informações sobre si próprios

A maioria dos PDF inclui dados como um título, um autor, o software que criou o ficheiro e quando foi criado ou alterado. Estes dados não aparecem na página, mas qualquer pessoa que abra as propriedades do documento pode vê-los. O Universal PDF permite consultá-los e, ao exportar, é possível optar por mantê-los ou removê-los.

## Então, como se edita um PDF?

Sobretudo acrescentando elementos por cima, em vez de reescrever o que está por baixo: caixas de texto, destaques, desenhos, assinaturas e campos de formulário preenchidos. É assim que o Universal PDF funciona. As suas adições ficam separadas e editáveis enquanto trabalha e são integradas nas páginas quando guarda.`,
  },
  {
    id: 'flattening-and-redaction',
    title: 'O que significa «achatar»?',
    summary: 'Integrar as alterações na página e porque um retângulo preto nem sempre é uma rasura.',
    group: 'O essencial',
    body: `«Achatar» significa integrar algo na página de forma que deixe de poder ser separado ou alterado como elemento individual. Há alguns tipos, e convém saber distingui-los.

## Achatar as suas adições

Enquanto trabalha no Universal PDF, o texto, os destaques, os desenhos e as assinaturas são elementos separados que pode mover ou eliminar. Quando transfere o PDF final, estes elementos são desenhados de forma permanente nas páginas, e os campos de formulário preenchidos passam a ser texto comum. Quem abrir o ficheiro transferido vê-os como parte do documento, em qualquer app de PDF.

O documento aberto não é alterado por isto. Pode continuar a editar e transferir novamente.

## Converter páginas em imagens

Nas opções de Exportação avançada pode ir mais longe e transformar cada página numa imagem. Assim, ninguém consegue selecionar, copiar, pesquisar ou editar o texto, o que pode ser útil para um documento que assinou. A desvantagem é que o texto deixa de ser texto: não pode ser pesquisado e os leitores de ecrã não o conseguem ler em voz alta. A cópia transferida é achatada; o documento aberto mantém o texto.

## Porque um retângulo preto não é uma rasura

Um erro comum e grave é esconder texto sensível desenhando um retângulo preto por cima. O texto continua no ficheiro, por baixo. Muitas vezes, qualquer pessoa consegue selecioná-lo, copiá-lo ou remover o retângulo.

A ferramenta de rasura do Universal PDF funciona de outra forma. Ao guardar, exportar ou enviar um documento com rasuras, cada página afetada é convertida numa imagem com os retângulos pretos gravados, e a página é reconstruída a partir dessa imagem. O texto que estava por baixo dos retângulos é removido da cópia guardada para sempre. Como isto não pode ser anulado, a app pede confirmação antes de o fazer.

Alguns pontos práticos:

- A rasura só remove o que o retângulo cobre, por isso verifique as margens de cada retângulo.
- As informações sobre o documento, como o título e o autor, são independentes das páginas. Verifique-as também antes de partilhar um documento rasurado.
- Guarde o original sem rasuras num local seguro, se ainda precisar dele.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Onde o trabalho acontece',
    summary: 'O que o Universal PDF faz no seu dispositivo e as poucas coisas que vão para a internet.',
    group: 'Como funciona',
    body: `Quase tudo o que o Universal PDF faz acontece no seu próprio dispositivo. O PDF não é carregado para ser aberto, desenhado ou guardado.

## No seu dispositivo

- **Abrir e mostrar páginas.** A app lê o ficheiro e desenha cada página no seu dispositivo, com o PDF.js, de código aberto, da Mozilla.
- **Editar, preencher formulários e assinar.** As suas adições, e o ficheiro final que transfere, são criados no seu dispositivo.
- **Tornar digitalizações pesquisáveis (OCR).** O reconhecimento propriamente dito é feito no seu dispositivo. Na primeira utilização, a app transfere o motor de reconhecimento e os dados do idioma, que depois conserva para não ter de os voltar a obter.
- **Converter ficheiros Word e OpenDocument.** Um ficheiro .docx ou .odt é convertido em PDF no seu dispositivo. O resultado é composto de novo, por isso não corresponderá exatamente à paginação do original.
- **Proteger e desproteger com palavra-passe.** Feito no seu dispositivo. A palavra-passe nunca é enviada para lado nenhum.

Pode comprová-lo: depois de a app carregar, desligue a ligação à internet e continue a trabalhar.

## O que a app guarda neste dispositivo

Os ficheiros abertos recentemente ficam guardados no armazenamento do próprio navegador, neste dispositivo, para que uma atualização da página os volte a abrir. As assinaturas e os carimbos que guardar também ficam aí. Limpar os dados do navegador relativos ao site remove-os. Não nos são enviados.

## Manter uma cópia

A opção **Fazer uma cópia de segurança** oferece três níveis:

1. **Guardar no navegador.** Automático e apenas neste dispositivo.
2. **Guardar no computador.** Transfere um ficheiro de cópia de segurança com o PDF original e as suas edições, que continuam editáveis. Importe-o mais tarde, em qualquer dispositivo, para continuar onde parou. O ficheiro não é encriptado, por isso trate-o com o mesmo cuidado que o próprio PDF.
3. **Alojado pela UNI·SIM.** Guarda o PDF final online, associado ao seu Universal ID, para o poder abrir noutro dispositivo. É gratuito com um Universal ID; as contas gratuitas têm um limite generoso — se algum dia o atingir, elimine algo de que já não precise para libertar espaço.

## Assinar no telemóvel

Se optar por desenhar a assinatura no telemóvel, o desenho passa do telemóvel para a app através do nosso servidor, como uma mensagem de curta duração. Não fica guardado no servidor. A app só o aceita se o PIN que mostra for introduzido no telemóvel.

## O que a app envia mesmo quando o PDF não sai do dispositivo

Com sessão iniciada, a app regista que foi aberta, para a página de atividade da sua conta. Enquanto está no ecrã, envia também uma pequena mensagem de «em utilização» cerca de 45 em 45 segundos, com o nome da app e um identificador aleatório deste dispositivo. Nenhuma das duas inclui nada sobre os seus ficheiros. Não há publicidade nem rastreio por terceiros.`,
  },
  {
    id: 'signing-a-pdf',
    title: 'Assinar um PDF pessoalmente',
    summary: 'O que é uma assinatura colocada na app, e o que não é.',
    group: 'Como funciona',
    body: `Pode assinar um PDF desenhando a assinatura com o rato, o trackpad ou o dedo, desenhando-a no telemóvel ou importando uma imagem da sua assinatura. Pode guardar assinaturas e carimbos para reutilizar e acrescentar o seu nome e a data por baixo.

Quando coloca uma assinatura, trata-se de uma imagem posicionada na página. Quando transfere o PDF, essa imagem é integrada na página como qualquer outra adição. Tudo isto acontece no seu dispositivo.

## Caixas de assinatura

Se estiver a preparar um documento para outra pessoa, pode desenhar uma caixa «Assinar aqui» na página. Também pode definir que uma caixa exige uma assinatura desenhada à mão, em vez de uma imagem carregada. Desenhar no telemóvel continua a contar como desenhar à mão.

## O que é este tipo de assinatura

É aquilo a que normalmente se chama **assinatura eletrónica**: uma marca num documento que mostra que uma pessoa pretendia assiná-lo. Muitos países consideram as assinaturas eletrónicas válidas para uma grande variedade de acordos do dia a dia, e muitas organizações aceitam-nas.

## O que não é

Não é uma **assinatura digital** no sentido técnico. Uma assinatura digital usa um certificado, muitas vezes emitido por uma entidade de confiança, para selar o ficheiro criptograficamente, de modo que qualquer alteração posterior possa ser detetada pela app de PDF. O Universal PDF não acrescenta esse tipo de selo a um ficheiro que o próprio utilizador assine.

Isto é importante porque a imagem de uma assinatura num PDF não prova, por si só, quem a colocou nem que o documento não foi alterado desde então. Se precisar de um registo de quem assinou e quando, use **Enviar para assinatura**, que mantém um registo de atividade no servidor e uma impressão digital de cada versão assinada. Os artigos seguintes explicam como.

## Uma nota sobre a lei

Isto não é aconselhamento jurídico. A aceitação de uma assinatura eletrónica depende do local onde se encontra, do tipo de documento e daquilo que a outra parte aceita. Alguns documentos, como certas transações imobiliárias, testamentos ou documentos que têm de ser testemunhados, estão muitas vezes sujeitos a regras mais rigorosas. Se um documento for importante, confirme o que é exigido antes de confiar em qualquer assinatura eletrónica.`,
  },
  {
    id: 'send-to-sign',
    title: 'Como funciona o Enviar para assinatura',
    summary: 'Pedir a outra pessoa que assine, passo a passo.',
    group: 'Como funciona',
    body: `O Enviar para assinatura permite pedir a outra pessoa que assine um PDF online e dá a ambos um registo do que aconteceu. É necessário ter sessão iniciada com um Universal ID e um endereço de email verificado, porque o pedido é enviado em seu nome.

## Os passos

1. **Marcar onde assinar.** Acrescente pelo menos uma caixa «Assinar aqui» ao documento, para que a outra pessoa saiba onde colocar a assinatura.
2. **Guardar online.** O PDF final, com tudo o que acrescentou integrado, é guardado online, associado ao seu Universal ID. É gratuito com um Universal ID; as contas gratuitas têm um limite generoso — se algum dia o atingir, elimine algo de que já não precise para libertar espaço.
3. **Escolher quem o pode abrir.** Qualquer pessoa com a ligação, ou só a pessoa a quem é endereçado. Consulte «Qual é a segurança do Enviar para assinatura?» para saber o que essa escolha altera.
4. **Enviar.** Copie a ligação e envie-a pessoalmente, ou introduza o endereço de email do destinatário e a app envia-a por si. Numa ligação aberta, o email inclui o PDF como anexo. Numa ligação protegida, não inclui, porque o anexo contornaria a proteção.

## Dois signatários, por qualquer ordem

Cada pedido tem dois signatários: o remetente e a pessoa a quem foi enviado. Cada um recebe a sua própria ligação, e podem assinar por qualquer ordem. Quem assinar em segundo lugar trabalha na cópia que já tem a primeira assinatura.

## O que acontece quando alguém assina

O signatário abre o documento no navegador, assina e submete-o. A cópia assinada é guardada como uma nova versão; as versões anteriores são mantidas, não substituídas. Cada passo fica registado num registo de atividade. Quando ambos tiverem assinado, o pedido fica concluído e ambos recebem um email com uma ligação para o certificado.

## O certificado

Cada pedido tem uma página de certificado. Mostra o documento, quem era cada signatário pelo endereço de email, se cada um já assinou e o registo de atividade: quando o documento foi aberto, o que foi acrescentado, de que país veio o pedido e uma impressão digital do documento em cada passo. Enquanto a cópia armazenada existir, é possível transferir a partir daí o PDF final assinado.

## Limites

As ligações de assinatura expiram ao fim de 30 dias. Os ficheiros guardados podem ter até 50 MB, e um ficheiro enviado como anexo de email tem de ter menos de 30 MB.`,
  },
  {
    id: 'send-to-sign-security',
    title: 'Qual é a segurança do Enviar para assinatura?',
    summary: 'O que é encriptado, o que o nosso servidor consegue ver e como funciona o registo de auditoria.',
    group: 'Privacidade e segurança',
    body: `O Enviar para assinatura é a única funcionalidade em que o documento tem de sair do seu dispositivo, porque outra pessoa precisa de o receber. Eis exatamente o que isso implica.

## A encriptação, em termos simples

- **Em trânsito:** tudo o que circula entre a app e o nosso servidor passa por HTTPS, por isso vai encriptado pelo caminho.
- **Em repouso:** o documento guardado fica num armazenamento privado e encriptado, que não é de leitura pública.
- **Não é ponto a ponto:** somos nós que detemos as chaves desse armazenamento, por isso os nossos sistemas conseguem ler o documento. Isso é necessário para que o servidor o entregue ao signatário e calcule a impressão digital de cada versão. A sua proteção é um compromisso sobre a forma como gerimos o serviço, não uma garantia matemática. Se isso for importante para um determinado documento, não o envie desta forma.

O email é uma questão à parte. Se a app enviar o PDF como anexo, este fica tão privado quanto a caixa de correio do destinatário e qualquer local para onde o email seja reencaminhado.

## A ligação é a chave

A ligação de cada signatário contém um código aleatório longo que, na prática, não pode ser adivinhado. Quando é aberta, o nosso servidor verifica o código e, se for válido, dá ao navegador um endereço temporário para o documento, que funciona durante 10 minutos. As ligações deixam de funcionar ao fim de 30 dias e, depois de uma pessoa assinar, a sua ligação não pode ser usada para assinar novamente.

## Qualquer pessoa com a ligação, ou só o destinatário

Com **Qualquer pessoa com a ligação**, quem tiver a ligação pode abrir e assinar. Se o email for reencaminhado, o novo leitor pode assinar.

Com **Só a pessoa a quem é endereçado**, o documento só abre quando o visitante prova que consegue ler o endereço introduzido:

- O visitante escreve o endereço. Se corresponder, é enviado um código de 6 dígitos para o endereço introduzido pelo remetente, nunca para algo que o visitante tenha escrito.
- O código é válido durante 10 minutos e permite 5 tentativas, partilhadas com o PIN, se existir. Podem ser enviados no máximo 5 códigos por ligação, com pelo menos um minuto de intervalo.
- Depois da verificação, o visitante tem 4 horas para ler e assinar.
- Também é possível exigir um PIN de 6 dígitos, que a app gera para ser comunicado por telefone ou mensagem. Só é guardada uma impressão digital SHA-256 do PIN, com salt, e é por isso que não pode voltar a ser mostrado.

## O registo de auditoria

Sempre que uma cópia assinada é devolvida, o nosso servidor calcula a respetiva impressão digital SHA-256 e regista-a juntamente com a impressão digital da versão que substituiu. Basta alterar um único byte do ficheiro para que a impressão digital mude por completo, por isso qualquer pessoa pode comparar uma cópia do documento com o certificado. Cada evento é registado com a hora indicada pelo nosso servidor, o endereço de email do signatário, o respetivo endereço IP e os dados do navegador. O certificado público mostra apenas o país, nunca o endereço IP completo.

A página do certificado pode ser vista por qualquer pessoa que tenha a respetiva ligação, por isso partilhe-a com o mesmo cuidado que o documento.`,
  },
  {
    id: 'locking-a-pdf',
    title: 'Proteger um PDF com palavra-passe',
    summary: 'A encriptação usada, porque a palavra-passe é tudo e o que fazer se a esquecer.',
    group: 'Privacidade e segurança',
    body: `Nas opções de Exportação avançada pode proteger um PDF com uma palavra-passe ou um PIN. A partir daí, quem abrir o ficheiro precisa da palavra-passe para ver qualquer conteúdo, em qualquer app de PDF que suporte a encriptação PDF moderna.

## O que a proteção faz realmente

O Universal PDF usa a encriptação mais forte que a norma PDF oferece: **AES-256**, tal como definida no PDF 2.0. O texto, as imagens e o restante conteúdo são selados com uma chave aleatória de 256 bits criada para esse ficheiro. Essa chave, por sua vez, é protegida com a sua palavra-passe.

A encriptação é feita no seu dispositivo. A palavra-passe nunca é enviada para lado nenhum, e nós nunca a vemos.

## Porque a palavra-passe é tudo

O AES-256 em si não é o ponto fraco. A única forma prática de entrar num ficheiro bem protegido é adivinhar a palavra-passe, vezes sem conta. O PDF 2.0 torna cada tentativa deliberadamente lenta, o que ajuda muito, mas alguém com hardware potente e tempo pode ainda assim experimentar um número muito elevado de tentativas.

Por isso, a app mostra aproximadamente quanto tempo a palavra-passe resistiria a um atacante determinado, e é deliberadamente prudente. Um PIN de 4 dígitos cai em instantes. Uma frase-passe longa, com várias palavras sem relação entre si, pode resistir mais tempo do que alguém estará disposto a esperar. Escolha a palavra-passe de acordo com a importância do documento.

## O que não faz

Algumas apps permitem impedir que as pessoas imprimam ou copiem um PDF sem palavra-passe. Essas restrições são apenas pedidos à app de leitura e são fáceis de remover, por isso o Universal PDF não as oferece. Quem tiver a palavra-passe pode fazer tudo com o documento.

## Se esquecer a palavra-passe

Ninguém a consegue recuperar, nem mesmo nós. Não existe reposição nem porta das traseiras. Guarde a palavra-passe num local seguro, ou mantenha uma cópia desprotegida num local seguro.

## Abrir PDF protegidos

O Universal PDF consegue abrir PDF protegidos com AES-256 por outras apps. Pede a palavra-passe e desprotege o ficheiro no seu dispositivo. Alguns PDF usam esquemas de encriptação mais antigos que a app não consegue abrir; nesse caso, use a app que os protegeu.

Sugestão: as palavras-passe compostas por letras da Europa Ocidental, números e símbolos comuns funcionam de forma fiável em qualquer app de PDF. Algumas apps tratam outros carateres, como letras gregas, cirílicas ou chinesas, ou emoji, de forma diferente, por isso a app avisa se a palavra-passe incluir algum.`,
  },
]

export default articles
