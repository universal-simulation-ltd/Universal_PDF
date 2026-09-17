import type { Messages } from '../en'

const annotate: Messages['annotate'] = {
  // Shared
  'common.close': 'Kapat',
  'common.cancel': 'İptal',
  'common.done': 'Bitti',

  // AnnotationLayer — redaction caption, drawn on the page in the editor only (never exported)
  'redact.hint': 'Bu alan dışa aktarımda karartılacak',

  // ColorCluster (the swatches on the floating pills)
  'color.black': 'Siyah',
  'color.white': 'Beyaz',
  'color.more': 'Daha fazla renk',

  // SigField (an unsigned "Sign here" box on the page)
  'sigfield.sign_here': 'Burayı imzalayın',
  'sigfield.name': 'Ad',
  'sigfield.date': 'Tarih',
  'sigfield.live': 'Canlı',
  'sigfield.click_again': 'İmzalamak için yeniden tıklayın',

  // AnnotationLayer — Delete / Confirm / Edit buttons beside a selected object
  'selection.delete': 'Sil',
  'selection.delete_aria': 'Seçili nesneyi sil',
  'selection.done_to_select': 'Bitti — bunu koru ve Seç aracına dön',
  'selection.done_deselect': 'Bitti — bunu koru ve seçimi kaldır',
  'selection.confirm_aria': 'Onayla ve seçimi kaldır',
  'selection.qr_edit_title': 'Bu QR kodu düzenle — bağlantı, stil veya marka',
  'selection.qr_edit_aria': 'Bu QR kodu düzenle',

  // AnnotationLayer — text pill (size, bold / italic / underline / link)
  'text.bold_letter': 'K',
  'text.bold': 'Kalın',
  'text.italic_letter': 'T',
  'text.italic': 'İtalik',
  'text.underline_letter': 'A',
  'text.underline': 'Altı çizili',
  'text.link_selection': 'Seçili metne bağlantı ekle',
  'text.edit_link': 'Bağlantıyı düzenle',
  'text.add_link': 'Bağlantı ekle',
  'text.link_prompt': 'Bağlantı URL’si (kaldırmak için boş bırakın):',
  'text.link_prompt_selection': 'Seçili metin için bağlantı URL’si (kaldırmak için boş bırakın):',
  'text.size_decrease': 'Metin boyutunu küçült',
  'text.size_field': 'Punto cinsinden yazı tipi boyutu',
  'text.size_increase': 'Metin boyutunu büyüt',

  // AnnotationLayer — image pill (border around a placed picture or QR code)
  'image.border': 'Kenarlık',
  'image.border_none': 'Yok',
  'image.border_none_title': 'Kenarlık yok',
  'image.border_width': '{width}px kenarlık',
  'image.border_solid': 'Düz',
  'image.border_dashed': 'Kesik',

  // AnnotationLayer — line pill
  'line.stroke': 'Kalınlık',
  'line.snap_title': 'Sabit çizgi — yatay, dikey veya çapraz yöne hizala (tek seferlik hizalama için bir ucu sürüklerken Shift tuşunu basılı tutun)',
  'line.snap_on': 'Hizalama açık',
  'line.snap_off': 'Hizalama kapalı',

  // AnnotationLayer — colour pill for ticks, crosses, boxes, circles, pen strokes
  'shape.colour': 'Renk',

  // AnnotationLayer — multi-selection delete
  'selection.delete_many_one': '{count} nesneyi sil',
  'selection.delete_many_other': '{count} nesneyi sil',
  'selection.delete_many_aria_one': '{count} seçili nesneyi sil',
  'selection.delete_many_aria_other': '{count} seçili nesneyi sil',

  // AnnotationLayer — Send to sign on a selected "Sign here" box
  'sigfield.send_title': 'İmzaya gönder — bu belgeyi imza isteği olarak e-postayla gönderin',
  'sigfield.send_aria': 'İmzaya gönder',

  // AnnotationLayer — Fill / Redact toggles on a box or circle
  'shape.fill_clear': 'Dolguyu temizle',
  'shape.fill': 'Etkin renkle doldur',
  'shape.redact_title': 'Karart — alanı siyahla kapatır ve dışa aktarımda metni kalıcı olarak kaldırır',
  'shape.redact_aria': 'Bu alanı karart',
  'redact.to_fill_title': 'Dolgulu şekle dönüştür — alttaki metin dışa aktarımda ARTIK kaldırılMAZ',
  'redact.to_fill_aria': 'Bu karartmayı dolgulu şekle dönüştür',

  // AnnotationLayer — fill-vs-redact warning dialog
  'fill_warning.title': 'Doldurmak metni gizlemez',
  'fill_warning.body': 'Dolgulu bir kutu yalnızca sayfanın üzerini boyar. Alttaki metin seçilebilir ve bilgisayar tarafından okunabilir kalır. Metni kalıcı olarak kaldırmak için bunun yerine karartın.',
  'fill_warning.dont_show': 'Bunu bir daha gösterme',
  'fill_warning.fill_anyway': 'Yine de doldur',
  'fill_warning.redact_instead': 'Bunun yerine karart',

  // AnnotationLayer — size + alignment pill on a signature with labels
  'sig_pill.size': 'Boyut',
  'sig_pill.smaller': 'Daha küçük etiketler',
  'sig_pill.bigger': 'Daha büyük etiketler',
  'sig_pill.align_title': 'Etiket hizalaması: {align} (değiştirmek için tıklayın)',
  'sig_pill.align_aria': 'Etiket hizalaması {align}, değiştirmek için tıklayın',
  'sig_pill.align_left': 'sol',
  'sig_pill.align_centre': 'orta',
  'sig_pill.align_right': 'sağ',

  // SignatureOptionsModal
  'sig_options.title': 'İmza seçenekleri',
  'sig_options.intro_restyle': 'Etiketleri ve kalem stilini değiştirir — çizdiğiniz çizgiler tam olarak çizildiği gibi kalır. Etiketleri yeniden boyutlandırmak veya hizalamak için imzanın üzerindeki kontrolü kullanın.',
  'sig_options.intro': 'Yalnızca adı ve tarihi değiştirir — imzanızın kendisi tam olarak çizildiği gibi kalır. Etiketleri yeniden boyutlandırmak veya hizalamak için imzanın üzerindeki kontrolü kullanın.',
  'sig_options.add_details': 'Bilgilerinizi ekleyin',
  'sig_options.details_aria': 'İmzanın altında gösterilecek bilgiler',
  'sig_options.add_date': 'Tarih ekle',
  'sig_options.date_aria': 'İmzanın altındaki tarih satırı',
  'sig_options.realistic': 'Daha gerçekçi görünsün',
  'sig_options.realistic_hint': 'Mavi mürekkep, düzensiz baskı ve hafif el titremesi',
  'sig_options.redraw': 'İmzayı yeniden çiz…',

  // TransformPanel
  'transform.sample': `# Universal PDF’e hoş geldiniz

**Markdown** metninizi buraya yapıştırın ve biçimlendirilmiş metni temiz, yazdırılabilir bir belgeye dönüştürmek için *PDF oluştur* düğmesine tıklayın.

## Desteklenen biçimlendirme

- \`#\`, \`##\` ve \`###\` ile başlıklar
- **Kalın**, *italik* ve \`satır içi kod\`
- Madde işaretli ve numaralı listeler
- Çitli kod blokları, tablolar ve yatay çizgiler
- [Tıklanabilir bağlantılar](https://www.unisim.co.uk)

> Alıntılar renkli bir çubukla vurgulanır.

### Örnek tablo

| Özellik | Durum | Notlar |
|---|---|---|
| Başlıklar | hazır | H1, H2, H3 |
| Tablolar | hazır | otomatik sütun genişlikleri |
| Kod blokları | hazır | eş aralıklı yazı tipi, satır kaydırma |

\`\`\`
Kod blokları boşlukları korur.
  Girintiler yerinde kalır.
\`\`\`

---

Özel bir PDF oluşturmak için bu örneği kendi metninizle değiştirin.
`,
  'transform.build_failed': 'PDF oluşturulamadı: {error}',
  'transform.drop_wrong_type': 'Bir Markdown (.md) veya düz metin (.txt) dosyası bırakın.',
  'transform.read_failed': 'Dosya okunamadı.',
  'transform.title': 'Metni PDF’e dönüştür',
  'transform.subtitle': 'Markdown (veya düz metin) yapıştırın. Başlıklar, listeler, tablolar, kod ve bağlantılar desteklenir.',
  'transform.placeholder': '# Belgem\n\nMarkdown yazmaya başlayın…',
  'transform.drop_to_load': 'Yüklemek için bırakın',
  'transform.drop_types': '.md veya .txt',
  'transform.load_sample': 'Örneği yükle',
  'transform.page': 'Sayfa',
  'transform.orientation_aria': 'Sayfa yönü',
  'transform.portrait': 'Dikey',
  'transform.landscape': 'Yatay',
  'transform.drag_hint': 'Yüklemek için bir .md / .txt dosyası sürükleyin',
  'transform.build_shortcut': 'Oluşturmak için {keys}',
  'transform.building': 'Oluşturuluyor…',
  'transform.build': 'PDF oluştur',
}

export default annotate
