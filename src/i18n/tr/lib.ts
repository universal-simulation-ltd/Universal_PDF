import type { Messages } from '../en'

const lib: Messages['lib'] = {
  // Shared by pdfBackup, hostedStore, saveDocument
  'no_pdf_open': 'Açık PDF yok.',
  // saveDocument, exitGuard
  'save_failed': 'PDF kaydedilemedi.',

  // tabStore (open failures, shown in an alert)
  'open_failed': 'PDF yüklenemedi',
  'open_failed_all': 'Bu dosyalar açılamadı:',
  'open_failed_some': 'Bu dosyaların bazıları açılamadı:',

  // pdfStore (unlocking a locked PDF)
  'unlock_wrong_password': 'Bu parola bu PDF’i açmıyor.',
  'unlock_failed': 'Bu PDF’in kilidi açılamadı.',

  // useUndo: the {action} in the menu's "Undo {action}"
  'undo_merge': 'birleştirme',
  'undo_convert': 'dönüştürme',
  'undo_page_change': 'sayfa değişikliği',
  'undo_strip_metadata': 'meta verileri kaldırma',

  // useDefaultPdfApp
  'default_app_failed': 'Varsayılan uygulama değiştirilemedi.',

  // officeToPdf (Word / OpenDocument import)
  'import_notice_docx': 'Word’den dönüştürüldü — metin ve yapı korunur, ancak sayfa düzeni orijinalinden farklı olabilir.',
  'import_notice_odt': 'OpenDocument’tan dönüştürüldü — metin ve yapı korunur, ancak sayfa düzeni orijinalinden farklı olabilir.',
  'import_dropped_count_one': 'Bu PDF’in yazı tiplerinin yazamadığı {count} karakter “?” ile değiştirildi.',
  'import_dropped_count_other': 'Bu PDF’in yazı tiplerinin yazamadığı {count} karakter “?” ile değiştirildi.',
  'import_dropped_chars_one': 'Şu karakter yazılamadı ve “?” olarak görünüyor: {chars}',
  'import_dropped_chars_other': 'Şu karakterler yazılamadı ve “?” olarak görünüyor: {chars}',
  'import_legacy_doc': 'Word 97–2003 dosyaları (.doc) burada dönüştürülemez. Dosyayı Word veya LibreOffice’te açın, .docx olarak kaydedin ve yeniden deneyin.',
  'import_legacy_rtf': 'Zengin Metin dosyaları (.rtf) burada dönüştürülemez. Dosyayı .docx olarak kaydedin ve yeniden deneyin.',
  'import_legacy_pages': 'Pages belgeleri burada dönüştürülemez. Belgeyi Word (.docx) veya PDF olarak dışa aktarın ve yeniden deneyin.',
  'import_not_office': 'Bu dosya bir Word (.docx) veya OpenDocument (.odt) belgesi değil.',
  'import_empty': 'Bu belge boş görünüyor — dönüştürülecek metin yoktu.',
  'import_failed': '“{name}” dönüştürülemedi. Parola korumalı veya hasarlı olabilir.',
  'import_libreoffice_notice': 'Bu bilgisayardaki LibreOffice ile dönüştürüldü — sayfa düzeni orijinaliyle eşleşmelidir. Bu bilgisayarda bulunmayan yazı tiplerinin yerine başkaları kullanılır.',
  'import_wrong_type': 'Lütfen bir PDF, Word (.docx) veya OpenDocument (.odt) dosyası seçin.',

  // ocr (progress messages)
  'ocr_preparing': 'OCR motoru hazırlanıyor…',
  'ocr_already_searchable': 'Zaten aranabilir',
  'ocr_downloading_model': 'OCR modeli indiriliyor (bir kereye mahsus)…',
  'ocr_reading_page': 'Sayfa okunuyor: {page}/{total}…',
  'ocr_saving': 'Aranabilir PDF kaydediliyor…',
  'ocr_done': 'Bitti',

  // pdfBackup
  'backup_not_json': 'Bu dosya bir Universal PDF yedeği değil (geçerli JSON değil).',
  'backup_invalid': 'Bu dosya bir Universal PDF yedeği değil.',
  'backup_too_new': 'Bu yedek, Universal PDF’in daha yeni bir sürümüyle oluşturulmuş — açmak için uygulamayı güncelleyin.',

  // pdfPages
  'pages_keep_one': 'Bir PDF’te en az bir sayfa kalmalıdır',

  // pdfMetadata (field labels in the metadata panel)
  'meta_title': 'Başlık',
  'meta_author': 'Yazar',
  'meta_subject': 'Konu',
  'meta_keywords': 'Anahtar sözcükler',
  'meta_creator': 'Oluşturan uygulama',
  'meta_producer': 'Üreten yazılım',
  'meta_created': 'Oluşturulma',
  'meta_modified': 'Son değiştirilme',
  'meta_encrypted': 'Bu PDF şifreli olduğundan meta verileri yeniden yazılamaz.',

  // imageSignature (importing a signature from an image)
  'sig_image_wrong_type': 'Lütfen bir görsel dosyası seçin (PNG, JPG vb.)',
  'sig_image_no_size': 'Görsel boyutları okunamadı',
  'sig_image_no_canvas': 'Canvas desteklenmiyor',
  'sig_image_blank': 'Görsel boş görünüyor. Daha yüksek kontrastlı bir tarama deneyin veya “Beyaz arka planı kaldır” seçeneğini kapatın.',
  'sig_image_read_failed': 'Dosya okunamadı',
  'sig_image_decode_failed': 'Görsel çözümlenemedi',

  // composeSignature (seed text for the signature's label lines, drawn into the PDF)
  'sig_signed_by': 'İmzalayan:',
  'sig_role': 'Unvan:',
  'sig_email': 'E-posta:',
  'sig_phone': 'Telefon:',
  'sig_signed_on': 'İmza tarihi: {date}',

  // export ("Sign here" request box caption, drawn into the PDF; Latin-1 only)
  'sign_here': 'Burayı imzalayın',
  'sign_here_name': 'Ad',
  'sign_here_date': 'Tarih',
  'sign_here_live': 'Canlı',

  // fonts (font picker chips)
  'font_sans': 'Sans',
  'font_serif': 'Serif',
  'font_mono': 'Mono',

  // convert (merge / images → PDF)
  'merge_none': 'Birleştirilecek PDF yok',
  'images_none': 'Dönüştürülecek görsel yok',
  'image_decode_failed': '“{name}” çözümlenemedi',
  'image_decode_failed_why': '“{name}” çözümlenemedi — {reason}',

  // hostedStore
  'hosted_reserve_failed': 'Jeton ayrılamadı.',
  'hosted_refund_failed': 'Jeton iade edilemedi.',
  'hosted_signed_download_failed': 'İmzalı PDF indirilemedi.',

  // signRequestClient
  'no_response': 'Yanıt yok',
  'sign_mail_subject': 'Lütfen imzalayın: {docName}',
  'sign_mail_body': 'Merhaba,\n\nİmzalamanız için bir belge gönderdim — {docName}.\n\nÇevrimiçi imzalamak için buraya tıklayın (hesap gerekmez):\n{link}\n\nTeşekkürler.',

  // qr/render
  'qr_no_canvas': 'Bu tarayıcıda canvas kullanılamıyor.',
  'qr_no_data': 'Kodlanacak bir bağlantı veya metin girin.',

  // lockPassword (the Lock dialog's strength meter and checks)
  'lock_duration_instant': 'bir saniyeden kısa',
  'lock_duration_seconds_one': 'yaklaşık {count} saniye',
  'lock_duration_seconds_other': 'yaklaşık {count} saniye',
  'lock_duration_minutes_one': 'yaklaşık {count} dakika',
  'lock_duration_minutes_other': 'yaklaşık {count} dakika',
  'lock_duration_hours_one': 'yaklaşık {count} saat',
  'lock_duration_hours_other': 'yaklaşık {count} saat',
  'lock_duration_days_one': 'yaklaşık {count} gün',
  'lock_duration_days_other': 'yaklaşık {count} gün',
  'lock_duration_months_one': 'yaklaşık {count} ay',
  'lock_duration_months_other': 'yaklaşık {count} ay',
  'lock_duration_years_one': 'yaklaşık {count} yıl',
  'lock_duration_years_other': 'yaklaşık {count} yıl',
  'lock_duration_forever': 'kimsenin bekleyemeyeceği kadar uzun',
  'lock_guessable': 'Tahmin edilebilir',
  'lock_weak': 'Zayıf',
  'lock_fair': 'Orta',
  'lock_reasonable': 'Makul',
  'lock_good': 'İyi',
  'lock_strong': 'Güçlü',
  'lock_too_short': 'Çok kısa',
  'lock_pin_obvious': 'Bu, herkesin ilk denediği PIN’lerden biri. Ardışık veya tekrarlanan olmayan rakamlar seçin.',
  'lock_pin_note_weak': '{digits} haneli bir PIN, kararlı biri tarafından kırılabilir; gereken süre: {time}. Bir belgenin yanlışlıkla yanlış ellere geçmesini önlemek için yeterlidir; değerli bir şey için değil.',
  'lock_pin_note': '{digits} haneli bir PIN, kararlı biri tarafından kırılabilir; gereken süre: {time}. Belgeyi kaybetmek gerçekten zarar verecekse bunun yerine parola kullanın.',
  'lock_password_common': 'Bu, var olan tüm parola tahmin listelerinde yer alıyor. Neredeyse başka her şey daha iyidir.',
  'lock_password_short': 'Kısa parolalar tüm olasılıklar denenerek bulunur. Üç veya dört sözcükten oluşan bir ifade hedefleyin.',
  'lock_password_strong': 'Bunu kimse kaba kuvvetle kıramaz. Yalnızca hatırlayabildiğinizden emin olun — o olmadan geri girmenin bir yolu yoktur.',
  'lock_password_note': 'Kaba kuvvetle tahmin süresi: {time} — birinin ilk deneyeceği bir ifade olmadığı varsayılarak.',
  'lock_pin_digits_only': 'PIN yalnızca rakamlardan oluşur.',
  'lock_pin_min': 'PIN en az {min} haneli olmalıdır.',
  'lock_password_min': 'Parola en az {min} karakter olmalıdır.',
  'lock_pins_differ': 'İki PIN eşleşmiyor.',
  'lock_passwords_differ': 'İki parola eşleşmiyor.',

  // pdfCrypto / pdfEncrypt (locking and unlocking)
  'lock_password_bytes': 'Parolanın yalnızca ilk 127 baytı dikkate alınır. Sonrası yok sayılır.',
  'lock_password_nonlatin': 'Aksanlı veya Latin olmayan karakterler diğer PDF uygulamalarında farklı yazılabilir. Harf, rakam ve noktalama işaretlerinden oluşan bir parola en güvenlisidir.',
  'crypto_insecure': 'Bu tarayıcı güvenli olmayan bir bağlantıda şifreleme yapmaz. Universal PDF’i https:// (veya localhost) üzerinden açın ve yeniden deneyin.',
  'lock_password_required': 'Bir PDF’i kilitlemek için parola gerekir.',
  'lock_check_failed': 'Bu PDF kilitlenemedi — parola denetimi başarısız oldu. Hiçbir şey kaydedilmedi.',
  'unlock_not_locked': 'Bu PDF kilitli değil.',
  'unlock_old_scheme': 'Bu PDF, Universal PDF’in açamadığı eski bir şifreleme yöntemi kullanıyor. Kilitleyen uygulamayı deneyin.',
  'unlock_incomplete': 'Bu PDF kilitli olduğunu belirtiyor ancak şifreleme bilgileri eksik.',
  'unlock_damaged': 'Bu PDF’in kilidi açıldı ancak bir kısmı okunamadı — dosya hasarlı görünüyor.',

  // heicSniff (adding a picture)
  'image_empty': '“{name}” boş geldi — yeniden eklemeyi deneyin',
  'image_unreadable': '“{name}” bu cihazdan okunamadı — bulutta duruyorsa indirilmesi için önce fotoğraf uygulamanızda açın',

  // deleteAccount
  'delete_account_failed': 'Hesabınız silinemedi. Bağlantınızı kontrol edip yeniden deneyin veya inbox@unisim.co.uk adresine e-posta gönderin.',
}

export default lib
