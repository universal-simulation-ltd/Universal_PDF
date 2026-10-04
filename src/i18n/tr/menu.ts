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
  'compare': 'Başka bir PDF ile karşılaştır',
  'compare_info': 'İki sürüm arasında neyin değiştiğini sayfa sayfa ve kelime kelime görün.',
  'convert': 'Görsellere dönüştür',
  'convert_info': 'Her sayfayı PNG veya JPG olarak oluşturun (birden çok sayfa için ZIP).',
  'advanced_export': 'Gelişmiş dışa aktarma',
  'advanced_export_info': 'Sayfaları resimlere dönüştürerek düzleştirin, parolayla kilitleyin, meta verileri koruyun veya kaldırın.',
  'metadata': 'Belge meta verileri',
  'metadata_info': 'Bu dosyada kimin ve neyin adı geçtiğini görün — sonra temizleyin.',
  'knowledge_base_info': 'Her aracın nasıl çalıştığı, indirilebilir kılavuzlarla.', // under the SDK's own "Knowledge base" label
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
  // FileNameEditor
  'rename_file': 'Dosyayı yeniden adlandır',
  'click_to_rename': 'Yeniden adlandırmak için tıklayın',
}

export default menu
