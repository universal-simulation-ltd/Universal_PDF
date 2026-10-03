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

Giriş yaparsanız uygulama, hesabınızın etkinlik sayfası için açıldığını kaydeder. Ekranda açık olduğu sürece yaklaşık 45 saniyede bir, uygulamanın adını ve bu cihaz için rastgele bir tanımlayıcıyı içeren küçük bir "kullanımda" mesajı da gönderir. Bunların hiçbiri dosyalarınızla ilgili herhangi bir şey içermez. Reklam ya da üçüncü taraf izleme yoktur.`,
  },
  {
    id: 'signing-a-pdf',
    title: 'Bir PDF’i kendiniz imzalamak',
    summary: 'Uygulamada yerleştirilen bir imzanın ne olduğu ve ne olmadığı.',
    group: 'Nasıl çalışır',
    body: `Bir PDF’i imzanızı fare, dokunmatik yüzey ya da parmağınızla çizerek, telefonunuzda çizerek ya da imzanızın bir resmini içe aktararak imzalayabilirsiniz. İmzaları ve damgaları yeniden kullanmak üzere kaydedebilir, altlarına adınızı ve tarihi ekleyebilirsiniz.

Bir imza yerleştirdiğinizde bu, sayfada konumlandırılmış bir görseldir. PDF’i indirdiğinizde bu görsel, diğer eklemeler gibi sayfayla birleştirilir. Bunların hepsi cihazınızda gerçekleşir.

## İmza kutuları

Bir belgeyi başka biri için hazırlıyorsanız sayfaya bir "Burayı imzalayın" kutusu çizebilirsiniz. Bir kutuyu, yüklenmiş bir görsel yerine elle çizilmiş bir imza gerektirecek şekilde de ayarlayabilirsiniz. Telefonda çizmek de elle çizilmiş sayılır.

## Bu tür imza nedir?

Genellikle **elektronik imza** olarak adlandırılan şeydir: Bir kişinin belgeyi imzalamak istediğini gösteren, belge üzerindeki bir işaret. Pek çok ülke elektronik imzaları çok çeşitli gündelik anlaşmalar için geçerli sayar ve pek çok kuruluş bunları kabul eder.

## Ne değildir?

Teknik anlamda bir **dijital imza** değildir. Dijital imza, dosyayı kriptografik olarak mühürlemek için genellikle güvenilir bir kuruluş tarafından verilen bir sertifika kullanır; böylece sonradan yapılan her değişiklik PDF uygulaması tarafından tespit edilebilir. Universal PDF, kendiniz imzaladığınız bir dosyaya bu tür bir mühür eklemez.

Bu önemlidir, çünkü bir PDF üzerindeki imza resmi tek başına onu oraya kimin koyduğunu ya da belgenin o zamandan beri değiştirilmediğini kanıtlamaz. Kimin ne zaman imzaladığına dair bir kayda ihtiyacınız varsa, sunucu tarafında bir etkinlik günlüğü ve imzalanan her sürümün parmak izini tutan **İmzaya gönder** özelliğini kullanın. Sonraki makaleler bunun nasıl çalıştığını açıklıyor.

## Hukuki durum hakkında bir not

Bu bir hukuki tavsiye değildir. Bir elektronik imzanın kabul edilebilir olup olmadığı, nerede bulunduğunuza, belgenin ne olduğuna ve karşı tarafın neyi kabul edeceğine bağlıdır. Bazı taşınmaz işlemleri, vasiyetnameler ya da tanık huzurunda imzalanması gereken belgeler gibi bazı belgeler için çoğu zaman daha katı kurallar geçerlidir. Bir belge önemliyse, herhangi bir elektronik imzaya güvenmeden önce neyin gerektiğini kontrol edin.`,
  },
  {
    id: 'send-to-sign',
    title: 'İmzaya gönder nasıl çalışır?',
    summary: 'Başka birinden adım adım imza istemek.',
    group: 'Nasıl çalışır',
    body: `İmzaya gönder, başka bir kişiden bir PDF’i çevrimiçi imzalamasını istemenizi sağlar ve ikinize de olup bitenlerin kaydını verir. İstek sizin adınıza gönderildiği için bir Universal ID ile giriş yapmış olmanız ve e-posta adresinizin doğrulanmış olması gerekir.

## Adımlar

1. **İmzalanacak yeri işaretleyin.** Karşı tarafın imzasının nereye geleceğini bilmesi için belgeye en az bir "Burayı imzalayın" kutusu ekleyin.
2. **Çevrimiçi depolayın.** Eklediğiniz her şeyin birleştirildiği bitmiş PDF, Universal ID’nize bağlı olarak çevrimiçi depolanır. Universal ID ile ücretsizdir.
3. **Kimin açabileceğini seçin.** Ya bağlantıya sahip herkes ya da yalnızca alıcı olarak belirttiğiniz kişi. Bu seçimin neyi değiştirdiğini öğrenmek için "İmzaya gönder ne kadar güvenli?" makalesine bakın.
4. **Gönderin.** Bağlantıyı kopyalayıp kendiniz gönderin ya da kişinin e-posta adresini girin, uygulama sizin yerinize e-postayla göndersin. Açık bir bağlantıda e-posta, PDF’i ek olarak içerir. Korumalı bir bağlantıda ise içermez, çünkü ek korumayı atlatmış olurdu.

## İki imzalayan, herhangi bir sırayla

Her isteğin iki imzalayanı vardır: siz ve isteği gönderdiğiniz kişi. Her birinize ayrı bir bağlantı verilir ve herhangi bir sırayla imzalayabilirsiniz. İkinci imzalayan, ilk imzayı zaten taşıyan kopya üzerinde çalışır.

## Birisi imzaladığında ne olur?

İmzalayan kişi belgeyi tarayıcısında açar, imzalar ve gönderir. İmzalanan kopya yeni bir sürüm olarak depolanır; önceki sürümlerin üzerine yazılmaz, bunlar saklanır. Her adım bir etkinlik günlüğüne kaydedilir. İkiniz de imzaladığınızda istek tamamlanır ve ikiniz de sertifikanın bağlantısını içeren bir e-posta alırsınız.

## Sertifika

Her isteğin bir sertifika sayfası vardır. Bu sayfa belgeyi, her imzalayanın e-posta adresine göre kim olduğunu, her birinin imzalayıp imzalamadığını ve etkinlik günlüğünü gösterir: belgenin ne zaman açıldığı, neyin eklendiği, isteğin hangi ülkeden geldiği ve her adımda belgenin parmak izi. Depolanan kopya var olduğu sürece son imzalı PDF’i bu sayfadan indirebilirsiniz.

## Sınırlar

İmza bağlantılarının süresi 30 gün sonra dolar. Depolanan dosyalar en fazla 50 MB olabilir ve e-postayla ek olarak gönderilen bir dosya 30 MB’tan küçük olmalıdır.`,
  },
  {
    id: 'send-to-sign-security',
    title: 'İmzaya gönder ne kadar güvenli?',
    summary: 'Nelerin şifrelendiği, sunucumuzun neleri görebildiği ve denetim kaydının nasıl işlediği.',
    group: 'Gizlilik ve güvenlik',
    body: `İmzaya gönder, belgenizin cihazınızdan çıkmak zorunda olduğu tek özelliktir, çünkü onu başka birinin alması gerekir. Bunun tam olarak neleri kapsadığı aşağıda açıklanmıştır.

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
