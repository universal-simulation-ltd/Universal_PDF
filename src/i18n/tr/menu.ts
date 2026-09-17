import type { Messages } from '../en'

const menu: Messages['menu'] = {
  // FileMenu — trigger
  'actions': 'İşlemler',
  // FileMenu — InfoRow (?)
  'info_help': '“{label}” ne işe yarar?',
  // FileMenu — current file header and rename editor
  'current_file': 'Geçerli dosya',
  'current_file_title': '{name} — yeniden adlandırmak için tıklayın',
  'current_file_rename': 'Yeniden adlandır: {name}',
  'rename_pdf': 'PDF’i yeniden adlandır',
  'rename_new_name': 'Yeni dosya adı',
  'cancel': 'İptal',
  'save': 'Kaydet',
  // FileMenu — top level with no document
  'open_pdf': 'PDF aç…',
  // FileMenu — File
  'file': 'Dosya',
  'close_pdf': 'PDF’i kapat',
  'open_another_pdf': 'Başka bir PDF aç…',
  'back_up': 'Yedekle…',
  'backups': 'Yedekler…',
  // FileMenu — View
  'view': 'Görünüm',
  'pages': 'Sayfalar',
  'present': 'Sun',
  'find': 'Bul',
  // FileMenu — Advanced
  'advanced': 'Gelişmiş',
  'ocr': 'Aranabilir hale getir (OCR)',
  'ocr_info': 'Taranmış bir PDF’i cihazda okuyun; böylece metnini bulup seçebilirsiniz.',
  'merge': 'Başka bir PDF ile birleştir',
  'merge_info': 'Bu dosyayı başkalarıyla birleştirin — dışa aktarmadan önce sıralayın.',
  'convert': 'Görsellere dönüştür',
  'convert_info': 'Her sayfayı PNG veya JPG olarak oluşturun (birden çok sayfa için ZIP).',
  'advanced_export': 'Gelişmiş dışa aktarma',
  'advanced_export_info': 'Sayfaları resimlere dönüştürerek düzleştirin, parolayla kilitleyin, meta verileri koruyun veya kaldırın.',
  'metadata': 'Belge meta verileri',
  'metadata_info': 'Bu dosyada kimin ve neyin adı geçtiğini görün — sonra temizleyin.',
  'about': 'Bu uygulama hakkında',
  'about_info': 'Ne yaptığı, asla neyi göndermediği ve hangi sürümü kullandığınız.',
  'reset_defaults': 'Varsayılanlara sıfırla',
  'defaults_restored': 'Varsayılanlar geri yüklendi',
  'reset_defaults_info': '“Bir daha gösterme” ile kapattığınız ipuçlarını geri getirir. Belgelerinize dokunulmaz.',
  // FileMenu — Redact
  'redact': 'Karart',
  'find_and_redact': 'Bul ve karart',
  'find_and_redact_info': 'Metinde arama yapın ve tüm eşleşmeleri karartın.',
  'free_draw': 'Serbest çizim',
  'free_draw_info': 'Karartmak için herhangi bir şeyin üzerine kutu sürükleyin veya kutu bırakmak için dokunun. Dolgu rengini araç çubuğundaki renklerden seçin.',
  // FileMenu — Undo / Redo
  'undo_redo': 'Geri al / Yinele',
  'undo': 'Geri al',
  'undo_named': 'Geri al: {action}',
  'redo': 'Yinele',
  'clear_annotations': 'Tüm notları temizle',
  // FileMenu — Language
  'language': 'Dil',
  'language_other': 'Diğer…',
  'language_request': 'Bir dil istemek için {link}.',
  'language_contact': 'UNI SIM ile iletişime geçin',
  // CompanyBadge
  'company': 'Şirket',
  // ToolbarUserProfile
  'delete_account_row': 'Hesabımı sil…',
  // DeleteAccountDialog
  'delete_done_title': 'Hesabınız silindi',
  'delete_done_body': 'Her yerde oturumunuz kapatıldı. Universal PDF hesap olmadan da çalışmaya devam eder ve bu cihazdaki dosyalar bıraktığınız gibi durur.',
  'close': 'Kapat',
  'delete_title': 'Hesabınız her yerde silinsin mi?',
  'delete_body_email': 'Bu işlem, Universal ID’nizi ({email}) yalnızca Universal PDF’te değil, onunla giriş yaptığınız {every} UNI·SIM uygulamasında ve ürününde siler. Geri alınamaz.',
  'delete_body': 'Bu işlem, Universal ID’nizi yalnızca Universal PDF’te değil, onunla giriş yaptığınız {every} UNI·SIM uygulamasında ve ürününde siler. Geri alınamaz.',
  'delete_every': 'her',
  'delete_point_profile': 'Giriş bilgileriniz, profiliniz ve ayarlarınız silinir.',
  'delete_point_sole_org': 'Tek üyesi olduğunuz kuruluşlar, içlerinde saklanan her şeyle birlikte silinir.',
  'delete_point_shared_org': 'Paylaştığınız bir kuruluştan çıkarılırsınız; kuruluş sizsiz devam eder.',
  'delete_point_files': 'Bu cihazdaki PDF’lere ve son dosyalarınıza dokunulmaz.',
  'delete_point_subscription': 'Ücretli abonelik otomatik olarak iptal edilmez. inbox@unisim.co.uk adresine e-posta gönderin, aboneliği biz iptal edelim.',
  'delete_confirm_label': 'Onaylamak için {phrase} yazın',
  'deleting': 'Siliniyor…',
  'delete_button': 'Hesabımı sil',
  // FileNameEditor
  'rename_file': 'Dosyayı yeniden adlandır',
  'click_to_rename': 'Yeniden adlandırmak için tıklayın',
}

export default menu
