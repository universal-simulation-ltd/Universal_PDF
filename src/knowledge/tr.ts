import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-pdf',
    title: 'PDF aslında nedir?',
    summary: 'Bu biçim nereden geldi ve neden her yerde aynı görünüyor?',
    group: 'Temel bilgiler',
    body: `PDF, Portable Document Format (Taşınabilir Belge Biçimi) anlamına gelir. Adobe bu biçimi 1993’te basit bir sorunu çözmek için tanıttı: Bir bilgisayarda düzgün görünen bir belge, başka bir bilgisayarda çoğu zaman bozuk görünüyordu; çünkü diğer bilgisayarda farklı yazı tipleri, farklı bir yazıcı ya da yazılımın farklı bir sürümü bulunuyordu.

PDF sayfayı sabitler. "İşte bir paragraf, elinden geldiğince yerleştir" demek yerine, aslında "bu harfleri, bu yazı tipiyle, tam olarak bu boyuttaki bir sayfada tam olarak bu konumlara çiz" der. Bir PDF’in telefonda, dizüstü bilgisayarda ya da bir matbaanın makinesinde aynı görünmesinin nedeni budur.

## Sahibi kim?

Artık kimse. Adobe belirtimi erken bir tarihte yayımladı ve PDF 2008’de açık bir uluslararası standart olan ISO 32000 hâline geldi. Güncel sürüm olan PDF 2.0 ise 2017’de geldi. PDF okuyan ya da oluşturan yazılımları herkes yazabilir; bu kadar çok uygulamanın bunu yapabilmesinin nedeni de budur.

## Bir PDF neler içerebilir?

- Metin ve onu çizmek için gereken yazı tipleri
- Taranmış sayfaların tamamı da dahil olmak üzere resimler
- Çizimler ve şekiller
- Doldurulabilir form alanları
- Bağlantılar, yer imleri ve yorumlar
- Belgenin kendisiyle ilgili bilgiler, örneğin başlığı ve yazarı
- Birisi eklediyse bir parola kilidi

## Duyabileceğiniz bazı PDF türleri

**PDF/A**, uzun süreli arşivleme için tasarlanmış, daha katı bir sürümdür ve ISO 19005 olarak standartlaştırılmıştır. Belgeyi görüntülemek için gereken her şeyin, örneğin yazı tiplerinin, dosyanın içinde bulunmasını şart koşar ve şifrelemeye izin vermez; böylece belge onlarca yıl sonra da açılabilir.

**Doldurulabilir formlar**, içine yazı yazabileceğiniz alanlar içerir. Çoğu, PDF standardının bir parçası olan bir sistemi kullanır. Bir kısmı ise XFA adlı daha eski bir tasarımı kullanır; bu tasarım daha sonra standarttan çıkarılmıştır ve bu uygulama da dahil olmak üzere pek çok uygulama onu yalnızca kısmen destekleyebilir.

## Bedeli

Bir PDF’i güvenilir kılan özellik, onu değiştirmeyi de zorlaştırır. PDF bir taslak olarak değil, bitmiş bir sayfa olarak tasarlanmıştır. Bir sonraki makale bunun nedenini açıklıyor.`,
  },
  {
    id: 'inside-a-pdf',
    title: 'PDF’leri düzenlemek neden bu kadar zor?',
    summary: 'Metin ile taranmış resimler arasındaki fark, gömülü yazı tipleri ve bir dosyada gizli duran bilgiler.',
    group: 'Temel bilgiler',
    body: `Bir PDF’te bir kelimeyi değiştirmeyi denediyseniz ve satırın geri kalanının yer açmak için kaymadığını gördüyseniz, PDF’lerin nasıl oluşturulduğuyla tanışmışsınız demektir.

## Metin akmaz, yerleştirilir

Bir kelime işlemci paragrafları saklar ve her düzenlemenizde satırların nerede bölüneceğini yeniden hesaplar. Bir PDF ise genellikle sonucu saklar: her biri tam bir konuma sabitlenmiş küçük harf dizileri. Dosyada çoğu zaman "bu satırlar tek bir paragraftır" ya da "bu bir tablodur" diyen hiçbir şey yoktur. Tek bir kelimeyi değiştirdiğinizde, ardından gelenleri yeniden nasıl yerleştireceğini bilen hiçbir şey yoktur.

## Yazı tipleri çoğu zaman eksiktir

Her yerde aynı görünmek için bir PDF genellikle yazı tiplerini kendi içinde taşır. Dosyaları küçük tutmak için ise çoğu zaman yalnızca belgede gerçekten kullanılan harfleri taşır. Bu nedenle özgün yazı tipiyle yeni metin ekleyebilseniz bile, ihtiyacınız olan harf dosyada hiç bulunmayabilir.

## Bazı PDF’lerde hiç metin yoktur

Taranmış bir belge, her sayfanın fotoğrafını içeren bir PDF’tir. Metin gibi görünür, ancak bilgisayar için bir resimdir: İçinde arama yapamaz, onu seçemez ya da ondan kopyalayamazsınız.

Universal PDF bunu **Aranabilir hale getir (OCR)** ile düzeltebilir. Resimdeki kelimeleri okur ve sayfanın üzerine, aynı konumlara görünmez bir metin katmanı yerleştirir. Sayfa tam olarak eskisi gibi görünür, ancak artık içinde arama yapabilir ve metin seçebilirsiniz. Tanıma hiçbir zaman kusursuz değildir; bu nedenle önemli olan her şeyi kontrol edin.

## Dosyalar kendileri hakkında bilgi taşır

Çoğu PDF; başlık, yazar, dosyayı oluşturan yazılım ve dosyanın ne zaman oluşturulduğu ya da değiştirildiği gibi ayrıntılar içerir. Bunlar sayfada gösterilmez, ancak belge özelliklerini açan herkes bunları görebilir. Universal PDF bunları görüntülemenizi sağlar ve dışa aktarırken bunları korumayı ya da kaldırmayı seçebilirsiniz.

## Peki bir PDF nasıl düzenlenir?

Çoğunlukla alttakini yeniden yazmak yerine üstüne bir şeyler ekleyerek: metin kutuları, vurgular, çizimler, imzalar ve doldurulmuş form alanları. Universal PDF de böyle çalışır. Eklemeleriniz siz çalışırken ayrı ve düzenlenebilir kalır, kaydettiğinizde ise sayfalarla birleştirilir.`,
  },
  {
    id: 'flattening-and-redaction',
    title: '"Düzleştirme" ne anlama gelir?',
    summary: 'Değişikliklerinizi sayfayla birleştirmek ve siyah bir kutunun neden her zaman karartma olmadığı.',
    group: 'Temel bilgiler',
    body: `"Düzleştirme", bir şeyi sayfayla birleştirerek artık ayrı bir öğe olarak ayrılamaz ya da değiştirilemez hâle getirmek demektir. Birkaç türü vardır ve hangisinin hangisi olduğunu bilmek işinize yarar.

## Eklemelerinizi düzleştirmek

Universal PDF’te çalışırken metinleriniz, vurgularınız, çizimleriniz ve imzalarınız taşıyabileceğiniz ya da silebileceğiniz ayrı öğelerdir. Bitmiş PDF’i indirdiğinizde bunlar sayfalara kalıcı olarak çizilir ve doldurulmuş form alanları sıradan metne dönüşür. İndirilen dosyayı açan herkes, hangi PDF uygulamasını kullanırsa kullansın, bunları belgenin bir parçası olarak görür.

Açık belgeniz bundan etkilenmez. Düzenlemeye devam edip yeniden indirebilirsiniz.

## Sayfaları görsellere düzleştirmek

Gelişmiş dışa aktarma seçeneklerinde bir adım daha ileri gidip her sayfayı bir görsele dönüştürebilirsiniz. Böylece kimse metni seçemez, kopyalayamaz, içinde arama yapamaz ya da düzenleyemez; bu, imzaladığınız bir belge için yararlı olabilir. Dezavantajı, metnin artık metin olmamasıdır: İçinde arama yapılamaz ve ekran okuyucular onu sesli okuyamaz. İndirdiğiniz kopya düzleştirilir; açık belgeniz ise metnini korur.

## Siyah bir kutu neden karartma değildir?

Sık yapılan ve ciddi bir hata, hassas bir metni üzerine siyah bir dikdörtgen çizerek gizlemektir. Metin, altında hâlâ dosyanın içindedir. Herkes çoğu zaman onu seçebilir, kopyalayabilir ya da dikdörtgeni kaldırabilir.

Universal PDF’in karartma aracı farklı çalışır. Karartma içeren bir belgeyi kaydettiğinizde, dışa aktardığınızda ya da gönderdiğinizde, etkilenen her sayfa siyah kutuların kalıcı olarak işlendiği bir görsele dönüştürülür ve sayfa bu görselden yeniden oluşturulur. Kutuların altındaki metin, kaydedilen kopyadan kalıcı olarak kaldırılır. Bu işlem geri alınamadığı için uygulama, gerçekleşmeden önce onaylamanızı ister.

Birkaç pratik nokta:

- Karartma yalnızca kutunun kapladığı alanı kaldırır; bu nedenle her kutunun kenarlarını kontrol edin.
- Belgenin başlığı ve yazarı gibi belgeyle ilgili bilgiler sayfalardan ayrıdır. Karartılmış bir belgeyi paylaşmadan önce bunları da kontrol edin.
- Karartılmamış özgün belgeye hâlâ ihtiyacınız varsa onu güvenli bir yerde saklayın.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'İşlemler nerede yapılır?',
    summary: 'Universal PDF’in cihazınızda yaptıkları ve çevrimiçi olan birkaç işlem.',
    group: 'Nasıl çalışır',
    body: `Universal PDF’in yaptığı neredeyse her şey kendi cihazınızda gerçekleşir. PDF’iniz açılmak, çizilmek ya da kaydedilmek için karşıya yüklenmez.

## Cihazınızda

- **Sayfaları açmak ve göstermek.** Uygulama, Mozilla’nın açık kaynaklı PDF.js’ini kullanarak dosyayı okur ve her sayfayı cihazınızda çizer.
- **Düzenleme, form doldurma ve imzalama.** Eklemeleriniz ve indirdiğiniz bitmiş dosya cihazınızda oluşturulur.
- **Taramaları aranabilir hale getirmek (OCR).** Tanıma işleminin kendisi cihazınızda çalışır. İlk kullanımda uygulama, tanıma motorunu ve dil verilerini indirir; ardından bunları saklar, böylece yeniden indirmesi gerekmez.
- **Word ve OpenDocument dosyalarını dönüştürmek.** Bir .docx ya da .odt dosyası cihazınızda PDF’e dönüştürülür. Sonuç yeniden dizildiği için özgün belgenin düzeniyle birebir aynı olmaz.
- **Parolayla kilitleme ve kilidi açma.** Cihazınızda yapılır. Parolanız hiçbir yere gönderilmez.

Bunu kendiniz deneyebilirsiniz: Uygulama yüklendikten sonra internet bağlantınızı kapatın ve çalışmaya devam edin.

## Uygulamanın bu cihazda hatırladıkları

Son açılan dosyalar, bu cihazdaki tarayıcınızın kendi depolama alanında tutulur; böylece sayfayı yenilediğinizde geri gelirler. Kaydettiğiniz imzalar ve damgalar da orada tutulur. Tarayıcınızda bu siteye ait verileri temizlemek bunları kaldırır. Bunlar bize gönderilmez.

## Bir kopya saklamak

**Yedekle** seçeneği iki düzey sunar, ikisi de sizin tarafınızda:

1. **Tarayıcıya kaydet.** Otomatiktir ve yalnızca bu cihazda geçerlidir.
2. **Masaüstüne kaydet.** Özgün PDF’i ve düzenlemelerinizi hâlâ düzenlenebilir şekilde içeren tek bir yedek dosyası indirir. Kaldığınız yerden devam etmek için bu dosyayı daha sonra herhangi bir cihazda içe aktarabilirsiniz. Dosya şifrelenmez; bu nedenle ona PDF’in kendisine gösterdiğiniz özeni gösterin.

## Telefonunuzla imzalamak

İmzanızı telefonunuzda çizmeyi seçerseniz çizim, kısa ömürlü bir mesaj olarak sunucumuz üzerinden telefonunuzdan uygulamaya iletilir. Orada kaydedilmez. Uygulama, çizimi yalnızca size gösterdiği PIN telefona girildiğinde kabul eder.

## PDF’iniz cihazınızdan çıkmasa bile uygulamanın gönderdikleri

Web sitesinde ve bilgisayar uygulamasında bir Universal ID ile giriş yapabilirsiniz; giriş yapmışken uygulama, hesabınızın etkinlik sayfası için açıldığını kaydeder. Telefon uygulamalarında ve tarayıcı uzantısında hiç giriş yoktur. Web sitesinde, uygulamayı her gün ilk açışınızda, ilk tıklamanızdan veya tuşa basmanızdan sonra anonim günlük açılış sayısına bir de ekler. Bu sayım yalnızca uygulamanın adını ve platform türünü (sitede "web") içerir: hiçbir tanımlayıcı, hesap ya da ne yaptığınıza dair bir şey yoktur. "Bugün sayıldı" işareti cihazınızda kalır ve asla gönderilmez. Telefon ve bilgisayar uygulamaları ile tarayıcı uzantısı bunu göndermez. Uygulamanın gönderdiği hiçbir şey dosyalarınızla ilgili bir şey içermez. Reklam ya da üçüncü taraf izleme yoktur.

Web sitesinde, indirme simgelerinin altından bilgisayar uygulaması hazır olduğunda haber verilmesini de isteyebilirsiniz. E-posta adresiniz yalnızca oraya yazarsanız bize gönderilir ve saklanan tek şey odur: bilgisayar uygulaması hazır olduğunda tek bir e-posta alırsınız; adres bundan sonraki 30 gün içinde, uygulama o zamana kadar hazır olmazsa da 24 ay sonra silinir.`,
  },
  {
    id: 'signing-a-pdf',
    title: 'Bir PDF’i kendiniz imzalamak',
    summary: 'Uygulamada yerleştirilen bir imzanın ne olduğu ve ne olmadığı.',
    group: 'Nasıl çalışır',
    body: `Bir PDF’i imzanızı fare, dokunmatik yüzey ya da parmağınızla çizerek, telefonunuzda çizerek ya da imzanızın bir resmini içe aktararak imzalayabilirsiniz. İmzaları ve damgaları yeniden kullanmak üzere kaydedebilir, altlarına adınızı ve tarihi ekleyebilirsiniz. Bunların hiçbiri için hesap gerekmez.

Bir imza yerleştirdiğinizde bu, sayfada konumlandırılmış bir görseldir. PDF’i indirdiğinizde bu görsel, diğer eklemeler gibi sayfayla birleştirilir. Bunların hepsi cihazınızda gerçekleşir.

## İmza kutuları

Bir belgeyi başkası için hazırlıyorsanız sayfaya bir “Burayı imzalayın” kutusu yerleştirip onunla birlikte kişinin adını ve tarihi isteyebilirsiniz. Bir kutunun yüklenmiş bir görselle değil elle çizilerek imzalanmasını da şart koşabilirsiniz. Telefonda çizmek de elle çizilmiş sayılır.

PDF’i kaydettiğinizde veya paylaştığınızda, imzalamadığınız her kutu, diğer PDF uygulamalarının anladığı türden gerçek bir imza alanına dönüşür. Gönderdiğiniz kişi bunu Universal PDF’te, Adobe Acrobat veya Reader’da ya da Apple Önizleme’de imzalayabilir. Universal PDF, bizden veya başka bir uygulamadan gelen boş bir imza alanı içeren bir PDF açtığında bunu dokunup imzalanacak bir kutu olarak gösterir. Bkz. “Bir PDF’i imzaya göndermek”.

## Bu tür imza nedir?

Genellikle **elektronik imza** olarak adlandırılan şeydir: Bir kişinin belgeyi imzalamak istediğini gösteren, belge üzerindeki bir işaret. Pek çok ülke elektronik imzaları çok çeşitli gündelik anlaşmalar için geçerli sayar ve pek çok kuruluş bunları kabul eder.

## Ne değildir?

Teknik anlamda bir **dijital imza** değildir. Dijital imza, dosyayı kriptografik olarak mühürlemek için genellikle güvenilir bir kuruluş tarafından verilen bir sertifika kullanır; böylece sonradan yapılan her değişiklik PDF uygulaması tarafından tespit edilebilir. Universal PDF, kendiniz imzaladığınız bir dosyaya bu tür bir mühür eklemez.

Bu önemlidir, çünkü bir PDF üzerindeki imza görseli tek başına onu kimin koyduğunu veya belgenin o zamandan beri değiştirilmediğini kanıtlamaz. Kimin ne zaman imzaladığına dair bir kayda ihtiyacınız varsa, Universal PDF web sitesindeki veya bilgisayar uygulamasındaki **onaylı imzayı** kullanın; sunucu tarafında bir etkinlik kaydı ve imzalanan her sürümün parmak izini tutar. Sonraki makaleler nasıl olduğunu açıklıyor.

## Hukuki durum hakkında bir not

Bu bir hukuki tavsiye değildir. Bir elektronik imzanın kabul edilebilir olup olmadığı, nerede bulunduğunuza, belgenin ne olduğuna ve karşı tarafın neyi kabul edeceğine bağlıdır. Bazı taşınmaz işlemleri, vasiyetnameler ya da tanık huzurunda imzalanması gereken belgeler gibi bazı belgeler için çoğu zaman daha katı kurallar geçerlidir. Bir belge önemliyse, herhangi bir elektronik imzaya güvenmeden önce neyin gerektiğini kontrol edin.`,
  },
  {
    id: 'send-to-sign',
    title: 'Bir PDF’i imzaya göndermek',
    summary: 'Dosyayı paylaşmanız yeterli; ya da web sitesinde veya bilgisayar uygulamasında onaylı imza alın.',
    group: 'Nasıl çalışır',
    body: `Bir PDF’i başkasına imzalatmanın iki yolu vardır. Basit yol her yerde çalışır, hesap gerektirmez ve hiçbir şey yüklemez. Onaylı yol web sitesinde ve bilgisayar uygulamasındadır ve kimin ne zaman imzaladığına dair bir kayıt ekler.

## İmzaya gönder

1. **İmzanın yerini işaretleyin.** **İmzala**’yı açın, **İstek**’i seçin ve imzanın gelmesi gereken her yere bir “Burayı imzalayın” kutusu yerleştirin. Kutunun altında ad ve tarih alanları için önce **Ad ve tarih iste**’yi, üstünde bir etiket için **“Lütfen burayı imzalayın” etiketi**’ni açın.
2. **Siz de imzalıyorsanız kendi bölümünüzü imzalayın.** Göndermeden önce kendi kutunuza dokunup imzalayın.
3. **Gönderin.** **İmzaya gönder**’i seçin. Telefonda paylaşım sayfası açılır; PDF’i mesajla, e-postayla veya herhangi bir uygulamayla gönderebilirsiniz. Bilgisayarda PDF kaydedilir veya indirilir ve tarayıcınız paylaşmayı da önerebilir.

İmzasız bıraktığınız her kutu gerçek bir imza alanına dönüşür. Dosyayı alan kişi onu Universal PDF’te, Adobe Acrobat veya Reader’da ya da Apple Önizleme veya Dosyalar’da imzalayıp aynı yolla geri gönderebilir. Hesaba ihtiyacı yoktur ve hiçbir şey bizim üzerimizden geçmez.

## Onaylı imza (web sitesi ve bilgisayar uygulaması)

Kimin ne zaman imzaladığının kanıtına ihtiyacınız varsa Universal PDF web sitesi ve bilgisayar uygulaması onaylı imza sunar. Sizin ücretsiz bir Universal ID’ye ihtiyacınız var; imzalayanın yok. PDF’iniz çevrimiçi saklanır, imzalayana bir bağlantı gider ve ikiniz de etkinlik kaydı içeren bir sertifika alırsınız. Telefon uygulamaları bunu sunmaz.

1. **İmzanın yerini işaretleyin**, yukarıdaki gibi.
2. **İmzaya gönder’i, ardından Onaylı imza’yı seçin.**
3. **Kimin açabileceğini seçin.** Bağlantıya sahip herkes ya da yalnızca belgeyi gönderdiğiniz kişi. Bu seçimin neyi değiştirdiği için “Onaylı imza ne kadar güvenli?” makalesine bakın.
4. **Gönderin.** Bağlantıyı kopyalayıp kendiniz gönderin ya da kişinin e-posta adresini girin, biz sizin için gönderelim. Açık bağlantıda e-posta PDF’i ek olarak içerir. Korumalı bağlantıda içermez, çünkü ek korumayı aşmış olurdu.

## İki imzalayan, herhangi bir sırayla

Onaylı bir isteğin iki imzalayanı vardır: siz ve gönderdiğiniz kişi. Her birinize ayrı bir bağlantı gider ve herhangi bir sırayla imzalayabilirsiniz. İkinci imzalayan, ilk imzayı zaten taşıyan kopya üzerinde çalışır. İkiniz de imzaladığınızda istek tamamlanır ve ikiniz de sertifikanın bağlantısını içeren bir e-posta alırsınız.

## Sertifika

Her onaylı isteğin bir sertifika sayfası vardır. Belgeyi, her imzalayanın e-posta adresini, her birinin imzalayıp imzalamadığını ve etkinlik kaydını gösterir: belgenin ne zaman açıldığı, neyin eklendiği, isteğin hangi ülkeden geldiği ve her adımda belgenin parmak izi. Saklanan kopya durduğu sürece son imzalı PDF’i oradan indirebilirsiniz. Tamamlanan bir istek 7 yıl saklanır.

## Sınırlar

İmzalama bağlantılarının süresi 30 gün sonra dolar. Saklanan dosyalar en fazla 50 MB olabilir ve ek olarak e-postayla gönderilen bir dosya 30 MB’tan küçük olmalıdır.`,
  },
  {
    id: 'page-scrolling',
    title: 'Sayfalar alt alta mı, yan yana mı?',
    summary: 'Sayfa kaydırma ayarı: sayfalar alt alta ya da bir sıra hâlinde yan yana.',
    group: 'Nasıl çalışır',
    body: `Universal PDF, bir belgenin sayfalarını bilgisayarda da telefonda da bir sıra hâlinde yan yana dizer; bir kitabın sayfalarını çevirir gibi sayfadan sayfaya yana geçersiniz: telefonda kaydırarak, bilgisayarda fare tekerleği veya dokunmatik yüzeyle. Aşağı kaydırmayı tercih ederseniz sayfaları alt alta da dizebilirsiniz.

## Nasıl değiştirilir

1. Sağ üstte, profil resminizin yanındaki menüyü açın (bir belge açıkken adı **İşlemler**’dir) ve **Bu uygulamayı ayarla**’yı seçin.
2. **Sayfa kaydırma** altında, sayfaların alt alta durması için **Dikey**’i, yan yana durması için **Yatay**’ı seçin.

Bu ayar, henüz bir şey açmadan ana ekranda ya da açık bir belgedeyken değiştirilebilir. Açık bir belge hemen değişir ve okuduğunuz sayfada kalır.

## Sıra hâlinde okuma

- **Bir belge açıldığında** sayfa pencerenin yüksekliğine sığdırılır; böylece sayfanın tamamı ekranda görünür ve yukarı aşağı kaydırılacak bir şey kalmaz. İlk sayfa ekranın ortasında durur.
- **Fare tekerleği** sıra boyunca ilerler: sonraki sayfa için aşağı, geri dönmek için yukarı çevirin. Bir sayfayı pencereden daha uzun olacak kadar yakınlaştırdıysanız, tekerlek önce o sayfayı sonuna kadar kaydırır, ardından sonrakine geçer.
- **Dokunmatik yüzey** her yerde olduğu gibi yana kaydırma hareketiyle sıra boyunca ilerler.
- **Bir sayfaya gitmek**, ister **Sayfalar** listesinden ister belgedeki bir bağlantıdan olsun, o sayfayı ekranın ortasına getirir.

Bir belge açıkken Yatay’a geçerseniz belge mevcut yakınlaştırma düzeyini korur. Pencerenin yüksekliğine sığdırma, belge açılırken yapılır.

## Seçim nerede saklanır

Ayar yalnızca bu cihazda, tarayıcınızın depolama alanında hatırlanır; bu yüzden her cihazınızın kendi ayarı olabilir. Hesabınıza kaydedilmez. Bu uygulamayı ayarla’nın en altındaki **Varsayılanlara sıfırla**, ayarı cihazın başlangıç değerine döndürür: telefonda Yatay, bilgisayarda Dikey.`,
  },
  {
    id: 'select-several',
    title: 'Birden çok notu aynı anda seçmek',
    summary: 'Birkaç notun çevresine bir kutu çizin, sonra hepsini birlikte taşıyın ya da silin.',
    group: 'Nasıl çalışır',
    body: `Birden çok notu (kutular, onay işaretleri, vurgular, metin ve diğerleri) aynı anda seçip hepsini birlikte taşıyabilir ya da silebilirsiniz.

## Telefonda veya tablette

1. Elinizde bir çizim aracı olmadığından emin olun. Telefon uygulamasında **İşaretle**'yi kapatmak için **Bitti**'ye ya da **Doldur**'a dokunun.
2. Sayfanın boş bir yerine basılı tutun. Bir an sonra parmağınızın altında küçük turuncu bir nokta belirir. (Bir kelimeye basılı tutarsanız bunun yerine o kelime seçilir ve üstünde bir **Kopyala** düğmesi çıkar.)
3. Parmağınızı kaldırmadan sürükleyin. Bir kutu parmağınızı izler.
4. Bırakın. Kutunun değdiği her not seçilir.

Hızlı bir kaydırma yine sayfalar arasında gezinir, sayfanın boş bir yerine dokunmak da seçimi kaldırır.

## Bilgisayarda

**Seç** aracıyla sayfanın boş bir yerinde sürükleyin. Bir notu seçime eklemek ya da seçimden çıkarmak için Shift'e basılı tutarak tıklayın.

## Seçtikten sonra

- Hepsini taşımak için herhangi birini sürükleyin.
- Hepsini silmek için yanlarındaki kırmızı çöp kutusuna dokunun. **Geri al** hepsini tek adımda geri getirir.

Bilgisayarda kutu, vurgulayıcı çizgilerini dışarıda bırakır; böylece çerçevelediğiniz metnin altındaki vurguyu almaz. Bir vurguyu tek başına seçmek için üzerine tıklayın. Telefonda veya tablette kutu vurguları da alır, çünkü **İşaretle** vurgulayıcıyla başlar.`,
  },
  {
    id: 'send-to-sign-security',
    title: 'Onaylı imza ne kadar güvenli?',
    summary: 'Nelerin şifrelendiği, sunucumuzun neleri görebildiği ve denetim kaydının nasıl işlediği.',
    group: 'Gizlilik ve güvenlik',
    body: `Universal PDF web sitesinde ve bilgisayar uygulamasında sunulan onaylı imza, belgenizin cihazınızdan çıkması gereken tek özelliktir: imzalayanın açabilmesi ve bir kayıt kalması için saklanır. Bunun tam olarak ne anlama geldiği aşağıda. Bir PDF’i onaylı imza olmadan imzaya göndermek hiçbir şey yüklemez; dosya yalnızca sizin gönderdiğiniz yere gider.

## Anlaşılır bir dille şifreleme

- **Aktarım sırasında:** Uygulama ile sunucumuz arasındaki her şey HTTPS üzerinden iletilir; yani yol boyunca şifrelenir.
- **Depolanırken:** Depolanan belge, herkese açık olarak okunamayan özel ve şifrelenmiş bir depolama alanında tutulur.
- **Uçtan uca değildir:** Bu depolama alanının anahtarları bizde olduğu için sistemlerimiz belgeyi okuyabilir. Sunucunun belgeyi imzalayana iletebilmesi ve her sürümün parmak izini alabilmesi için bu gereklidir. Belgenin korunması, işleri nasıl yürüttüğümüze dair bir sözdür, matematiksel bir güvence değildir. Belirli bir belge için bu önemliyse, onu bu yolla göndermeyin.

E-posta ayrı bir konudur. Uygulama PDF’i ek olarak e-postayla gönderirse, belge ancak alıcının posta kutusu ve e-postanın iletildiği her yer kadar gizli olur.

## Anahtar, bağlantının kendisidir

Her imzalayanın bağlantısı, pratikte tahmin edilemeyecek uzun ve rastgele bir kod içerir. Bağlantı açıldığında sunucumuz kodu kontrol eder ve geçerliyse tarayıcıya, belge için 10 dakika boyunca çalışan geçici bir adres verir. Bağlantılar 30 gün sonra çalışmaz hâle gelir ve bir kişi imzaladıktan sonra onun bağlantısı yeniden imzalamak için kullanılamaz.

## Bağlantıya sahip herkes ya da yalnızca alıcı

**Bağlantıya sahip herkes** seçeneğinde, bağlantıya sahip olan herkes belgeyi açıp imzalayabilir. E-posta başkasına iletilirse, yeni okuyan kişi de imzalayabilir.

**Yalnızca alıcı olarak belirttiğiniz kişi** seçeneğinde ise belge, ziyaretçi girdiğiniz adrese gelen e-postaları okuyabildiğini kanıtlayana kadar açılmaz:

- Ziyaretçi adresi yazar. Adres eşleşirse, 6 haneli bir kod ziyaretçinin yazdığı herhangi bir adrese değil, her zaman sizin girdiğiniz adrese e-postayla gönderilir.
- Kod 10 dakika geçerlidir ve varsa PIN ile ortak olmak üzere 5 deneme hakkı tanır. Bağlantı başına en fazla 5 kod gönderilebilir ve kodlar arasında en az bir dakika olmalıdır.
- Doğrulama yapıldıktan sonra, okumak ve imzalamak için 4 saatleri olur.
- Ayrıca, uygulamanın sizin için oluşturduğu ve telefonla ya da mesajla iletmeniz için verdiği 6 haneli bir PIN de zorunlu kılabilirsiniz. PIN’in yalnızca tuzlanmış bir SHA-256 parmak izi saklanır; bu yüzden size yeniden gösterilemez.

## Denetim kaydı

İmzalanmış bir kopya her geri geldiğinde sunucumuz onun SHA-256 parmak izini hesaplar ve bunu, yerini aldığı sürümün parmak iziyle birlikte kaydeder. Dosyanın tek bir baytını değiştirdiğinizde parmak izi tamamen değişir; böylece herkes belgenin bir kopyasını sertifikayla karşılaştırabilir. Her olay, sunucumuza göre saat, imzalayanın e-posta adresi, IP adresi ve tarayıcı bilgileriyle birlikte kaydedilir. Herkese açık sertifika yalnızca ülkeyi gösterir, tam IP adresini asla göstermez.

Sertifika sayfasını, bağlantısına sahip olan herkes görüntüleyebilir; bu yüzden onu belgenin kendisi kadar dikkatli paylaşın.`,
  },
  {
    id: 'locking-a-pdf',
    title: 'Bir PDF’i parolayla kilitlemek',
    summary: 'Kullanılan şifreleme, parolanın neden her şey olduğu ve parolayı unutursanız ne yapmanız gerektiği.',
    group: 'Gizlilik ve güvenlik',
    body: `Gelişmiş dışa aktarma seçeneklerinde bir PDF’i parolayla ya da PIN ile kilitleyebilirsiniz. Bundan sonra dosyayı açan herkesin, modern PDF şifrelemesini destekleyen herhangi bir PDF uygulamasında içindeki herhangi bir şeyi görebilmesi için parolaya ihtiyacı olur.

## Kilit aslında ne yapar?

Universal PDF, PDF standardının sunduğu en güçlü şifrelemeyi kullanır: PDF 2.0’da tanımlandığı şekliyle **AES-256**. Metin, resimler ve diğer içerikler, o dosya için oluşturulan rastgele 256 bitlik bir anahtarla mühürlenir. Bu anahtar da parolanızla kilitlenir.

Şifreleme cihazınızda gerçekleşir. Parolanız hiçbir yere gönderilmez ve biz onu hiçbir zaman görmeyiz.

## Parola neden her şeydir?

Zayıf nokta AES-256’nın kendisi değildir. İyi kilitlenmiş bir dosyaya girmenin tek pratik yolu, parolayı defalarca tahmin etmeye çalışmaktır. PDF 2.0 her tahmini kasıtlı olarak yavaşlatır; bu çok işe yarar, ancak güçlü donanıma ve zamana sahip biri yine de çok sayıda tahmin deneyebilir.

Bu nedenle uygulama, parolanızın kararlı bir saldırgana karşı yaklaşık ne kadar dayanacağını size gösterir ve bunu bilerek temkinli bir şekilde yapar. 4 haneli bir PIN birkaç anda çözülür. Birbiriyle ilgisiz birkaç kelimeden oluşan uzun bir parola cümlesi ise kimsenin bekleyemeyeceği kadar uzun süre dayanabilir. Parolayı, belgenin ne kadar önemli olduğuna göre seçin.

## Ne yapmaz?

Bazı uygulamalar, parola olmadan bir PDF’in yazdırılmasını ya da kopyalanmasını engellemeyi önerir. Bu kısıtlamalar okuyan uygulamaya yapılan birer ricadan ibarettir ve kolayca kaldırılabilir; bu yüzden Universal PDF bunları sunmaz. Parolaya sahip olan herkes belgeyle her şeyi yapabilir.

## Parolayı unutursanız

Biz de dahil olmak üzere kimse onu kurtaramaz. Sıfırlama ya da arka kapı yoktur. Parolanızı güvenli bir yerde saklayın ya da kilitlenmemiş bir kopyayı güvenli bir yerde tutun.

## Kilitli PDF’leri açmak

Universal PDF, başka uygulamalar tarafından AES-256 ile kilitlenmiş PDF’leri açabilir. Parolayı sorar ve dosyanın kilidini cihazınızda açar. Bazı PDF’ler, uygulamanın açamadığı eski şifreleme yöntemlerini kullanır; bunlar için onları kilitleyen uygulamayı kullanın.

İpucu: Batı Avrupa harflerinden, rakamlardan ve yaygın simgelerden oluşan parolalar her PDF uygulamasında güvenilir şekilde çalışır. Bazı uygulamalar Yunan, Kiril ya da Çin harfleri veya emoji gibi diğer karakterleri farklı işler; bu nedenle parolanız bunlardan birini içeriyorsa uygulama sizi uyarır.`,
  },
]

export default articles
