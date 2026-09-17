// The few words the main process shows itself — the native Save dialogs and
// their error boxes. Everything else is the renderer's, in src/i18n.
//
// The language is the renderer's: the suite language it reports over
// `language:set` whenever it changes (see <I18nRoot>). Until the first report,
// the OS language, which is what the renderer would have picked anyway.
const { app } = require('electron')

const STRINGS = {
  en: {
    saveFile: 'Save file',
    savePdf: 'Save PDF',
    notSaved: 'The file could not be saved',
    notDownloaded: '“{name}” did not finish downloading.',
    notWritten: '“{name}” could not be written to {folder}.',
    nothingToSave: 'There was nothing to save.',
    pdfNotWritten: 'The PDF could not be written.',
  },
  fr: {
    saveFile: 'Enregistrer le fichier',
    savePdf: 'Enregistrer le PDF',
    notSaved: 'Le fichier n’a pas pu être enregistré',
    notDownloaded: 'Le téléchargement de « {name} » ne s’est pas terminé.',
    notWritten: '« {name} » n’a pas pu être écrit dans {folder}.',
    nothingToSave: 'Il n’y avait rien à enregistrer.',
    pdfNotWritten: 'Le PDF n’a pas pu être écrit.',
  },
  es: {
    saveFile: 'Guardar archivo',
    savePdf: 'Guardar PDF',
    notSaved: 'No se ha podido guardar el archivo',
    notDownloaded: 'La descarga de «{name}» no ha terminado.',
    notWritten: 'No se ha podido escribir «{name}» en {folder}.',
    nothingToSave: 'No había nada que guardar.',
    pdfNotWritten: 'No se ha podido escribir el PDF.',
  },
  it: {
    saveFile: 'Salva file',
    savePdf: 'Salva PDF',
    notSaved: 'Impossibile salvare il file',
    notDownloaded: 'Il download di «{name}» non è stato completato.',
    notWritten: 'Impossibile scrivere «{name}» in {folder}.',
    nothingToSave: 'Non c’era niente da salvare.',
    pdfNotWritten: 'Impossibile scrivere il PDF.',
  },
  de: {
    saveFile: 'Datei speichern',
    savePdf: 'PDF speichern',
    notSaved: 'Die Datei konnte nicht gespeichert werden',
    notDownloaded: '„{name}“ wurde nicht vollständig heruntergeladen.',
    notWritten: '„{name}“ konnte nicht in {folder} geschrieben werden.',
    nothingToSave: 'Es gab nichts zu speichern.',
    pdfNotWritten: 'Das PDF konnte nicht geschrieben werden.',
  },
  'pt-BR': {
    saveFile: 'Salvar arquivo',
    savePdf: 'Salvar PDF',
    notSaved: 'Não foi possível salvar o arquivo',
    notDownloaded: 'O download de “{name}” não terminou.',
    notWritten: 'Não foi possível gravar “{name}” em {folder}.',
    nothingToSave: 'Não havia nada para salvar.',
    pdfNotWritten: 'Não foi possível gravar o PDF.',
  },
  'pt-PT': {
    saveFile: 'Guardar ficheiro',
    savePdf: 'Guardar PDF',
    notSaved: 'Não foi possível guardar o ficheiro',
    notDownloaded: 'A transferência de «{name}» não terminou.',
    notWritten: 'Não foi possível escrever «{name}» em {folder}.',
    nothingToSave: 'Não havia nada para guardar.',
    pdfNotWritten: 'Não foi possível escrever o PDF.',
  },
  tr: {
    saveFile: 'Dosyayı kaydet',
    savePdf: 'PDF’yi kaydet',
    notSaved: 'Dosya kaydedilemedi',
    notDownloaded: '“{name}” indirmesi tamamlanmadı.',
    notWritten: '“{name}”, {folder} konumuna yazılamadı.',
    nothingToSave: 'Kaydedilecek bir şey yoktu.',
    pdfNotWritten: 'PDF yazılamadı.',
  },
}

let language = null

/** Same fallbacks as the SDK's languageFallbacks, for the codes we have. */
function dictFor(lang) {
  const l = String(lang || '').replace('_', '-').toLowerCase()
  if (l === 'pt-br') return STRINGS['pt-BR']
  if (l.startsWith('pt')) return STRINGS['pt-PT']
  return STRINGS[l.split('-')[0]] || STRINGS.en
}

function setLanguage(lang) {
  if (typeof lang === 'string') language = lang
}

function t(key, vars) {
  const dict = dictFor(language || app.getLocale())
  const s = dict[key] ?? STRINGS.en[key] ?? key
  return vars ? s.replace(/\{(\w+)\}/g, (m, n) => (n in vars ? String(vars[n]) : m)) : s
}

module.exports = { t, setLanguage }
