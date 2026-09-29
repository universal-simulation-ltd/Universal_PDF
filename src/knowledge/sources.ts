import type { Source } from './types'

// The research, standards and reports behind each article, keyed by article
// id. The same in every language, so kept once here and attached by index.ts.
//
// Original research papers first, then the standards, then guidance — and
// only sources for what the app really does (checked against src/ on
// 2026-09-29: pdf.js to draw, pdf-lib to write, tesseract.js LSTM for OCR,
// ISO 32000-2 revision 6 AES-256 in lib/pdfCrypto.ts, SHA-256 fingerprints
// for Send to sign). The password meter is our own estimate, not zxcvbn, so
// zxcvbn is deliberately not cited.
//
// ⚠️ `pdf` (our hosted copy at opensource.unisim.co.uk/kb/papers/) ONLY where
// the licence allows redistribution: US Government works, UK Crown copyright
// under the Open Government Licence, CC BY, and EU acts under Decision
// 2011/833/EU. ACM, IEEE, ISO and Adobe documents link to the publisher's or
// the authors' own free copy instead. Adobe took its free ISO 32000-1 and PDF
// Reference 1.0 copies offline in 2026, so those two link to the Wayback
// Machine's snapshot; swap them back if Adobe republishes.

const LAW_COM_386: Source = {
  kind: 'report',
  title: 'Electronic execution of documents (Law Com No 386)',
  authors: 'Law Commission of England and Wales',
  publisher: 'Law Commission',
  year: 2019,
  href: 'https://cdn.websitebuilder.service.justice.gov.uk/uploads/sites/54/2025/12/Electronic-Execution-Report.pdf',
  pdf: 'papers/law-com-386-electronic-execution.pdf',
  licence: 'Crown copyright 2019, Open Government Licence v3.0',
}

const NIST_800_63B: Source = {
  kind: 'guidance',
  title: 'NIST SP 800-63B-4: Digital Identity Guidelines — Authentication and Authenticator Management',
  publisher: 'NIST',
  year: 2025,
  href: 'https://doi.org/10.6028/NIST.SP.800-63B-4',
  pdf: 'papers/nist-sp-800-63b-4-authentication.pdf',
  licence: 'Public domain (US Government work)',
}

const PDF_2_0: Source = {
  kind: 'standard',
  title: 'ISO 32000-2:2020 — Portable document format — Part 2: PDF 2.0',
  publisher: 'ISO, free access sponsored by the PDF Association',
  year: 2020,
  href: 'https://pdfa.org/sponsored-standards/',
}

const HIDDEN_DATA: Source = {
  kind: 'paper',
  title: 'Exploitation and Sanitization of Hidden Data in PDF Files',
  authors: 'Supriya Adhatarao, Cédric Lauradoux',
  publisher: 'ACM IH&MMSec',
  year: 2021,
  href: 'https://arxiv.org/abs/2103.02707',
}

export const SOURCES: Record<string, Source[]> = {
  'what-is-a-pdf': [
    {
      kind: 'paper',
      title: 'The Camelot Project',
      authors: 'John Warnock',
      publisher: 'Adobe Systems (the memo that started PDF)',
      year: 1991,
      href: 'https://web.archive.org/web/20101110133343/http://www.planetpdf.com/planetpdf/pdfs/warnock_camelot.pdf',
    },
    {
      kind: 'standard',
      title: 'Portable Document Format Reference Manual, Version 1.0',
      authors: 'Tim Bienz, Richard Cohn',
      publisher: 'Adobe Systems',
      year: 1993,
      href: 'https://web.archive.org/web/20260819223814/https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.0.pdf',
    },
    PDF_2_0,
    {
      kind: 'standard',
      title: 'ISO 19005-1:2005 — Use of PDF 1.4 for long-term preservation (PDF/A-1)',
      publisher: 'ISO',
      year: 2005,
      href: 'https://www.iso.org/standard/38920.html',
    },
  ],
  'inside-a-pdf': [
    {
      kind: 'standard',
      title: 'ISO 32000-1:2008 — Portable document format — Part 1: PDF 1.7 (Adobe\'s free copy)',
      publisher: 'Adobe Systems / ISO',
      year: 2008,
      href: 'https://web.archive.org/web/20260827044602/https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf',
    },
    {
      kind: 'paper',
      title: 'An Overview of the Tesseract OCR Engine',
      authors: 'Ray Smith',
      publisher: 'ICDAR',
      year: 2007,
      href: 'https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/33418.pdf',
    },
    {
      kind: 'report',
      title: 'Building a Multilingual OCR Engine: Training LSTM networks on 100 languages',
      authors: 'Ray Smith',
      publisher: 'DAS tutorial',
      year: 2016,
      href: 'https://github.com/tesseract-ocr/docs/blob/main/das_tutorial2016/7Building%20a%20Multi-Lingual%20OCR%20Engine.pdf',
    },
    HIDDEN_DATA,
  ],
  'flattening-and-redaction': [
    {
      kind: 'guidance',
      title: 'Redacting with Confidence: How to Safely Publish Sanitized Reports Converted From Word to PDF',
      authors: 'NSA Systems and Network Attack Center',
      publisher: 'National Security Agency',
      year: 2005,
      href: 'https://www.ca7.uscourts.gov/assets/pdf/nsa-redact.pdf',
      pdf: 'papers/nsa-redacting-with-confidence.pdf',
      licence: 'Public domain (US Government work)',
    },
    {
      kind: 'paper',
      title: 'Story Beyond the Eye: Glyph Positions Break PDF Text Redaction',
      authors: 'Maxwell Bland, Anushya Iyer, Kirill Levchenko',
      publisher: 'Proceedings on Privacy Enhancing Technologies',
      year: 2023,
      href: 'https://doi.org/10.56553/popets-2023-0069',
      pdf: 'papers/popets-2023-glyph-positions-redaction.pdf',
      licence: 'CC BY 4.0 — Bland, Iyer, Levchenko',
    },
    HIDDEN_DATA,
  ],
  'where-the-work-happens': [
    {
      kind: 'paper',
      title: 'Local-first software: You own your data, in spite of the cloud',
      authors: 'Martin Kleppmann, Adam Wiggins, Peter van Hardenberg, Mark McGranaghan',
      publisher: 'ACM Onward!',
      year: 2019,
      href: 'https://www.inkandswitch.com/local-first/static/local-first.pdf',
    },
    {
      kind: 'paper',
      title: 'Bringing the Web up to Speed with WebAssembly',
      authors: 'Andreas Haas, Andreas Rossberg, Derek L. Schuff, Ben L. Titzer et al.',
      publisher: 'ACM PLDI',
      year: 2017,
      href: 'https://doi.org/10.1145/3062341.3062363',
    },
    {
      kind: 'guidance',
      title: 'PDF.js — the open-source PDF renderer this app draws pages with',
      publisher: 'Mozilla',
      href: 'https://mozilla.github.io/pdf.js/',
    },
  ],
  'signing-a-pdf': [
    LAW_COM_386,
    {
      kind: 'law',
      title: 'Regulation (EU) No 910/2014 on electronic identification and trust services (eIDAS)',
      publisher: 'Official Journal of the European Union, L 257/73',
      year: 2014,
      href: 'https://eur-lex.europa.eu/eli/reg/2014/910/oj',
      pdf: 'papers/eidas-regulation-910-2014.pdf',
      licence: '© European Union, reused under Commission Decision 2011/833/EU',
    },
    {
      kind: 'law',
      title: 'Electronic Signatures in Global and National Commerce Act (ESIGN, Public Law 106-229)',
      publisher: 'US Congress',
      year: 2000,
      href: 'https://www.govinfo.gov/app/details/PLAW-106publ229',
      pdf: 'papers/esign-act-2000.pdf',
      licence: 'Public domain (US federal statute)',
    },
    {
      kind: 'paper',
      title: '1 Trillion Dollar Refund: How To Spoof PDF Signatures',
      authors: 'Vladislav Mladenov, Christian Mainka, Karsten Meyer zu Selhausen, Martin Grothe, Jörg Schwenk',
      publisher: 'ACM CCS',
      year: 2019,
      href: 'https://pdf-insecurity.org/download/paper-pdf-signatures-ccs2019.pdf',
    },
  ],
  'send-to-sign': [
    {
      kind: 'report',
      title: 'Electronic Execution of Documents: Industry Working Group Final Report',
      authors: 'Industry Working Group on Electronic Execution of Documents',
      publisher: 'Ministry of Justice',
      year: 2023,
      href: 'https://www.gov.uk/government/publications/industry-working-group-on-esignatures-final-report',
      pdf: 'papers/iwg-electronic-execution-final-report-2023.pdf',
      licence: 'Crown copyright 2023, Open Government Licence v3.0',
    },
    LAW_COM_386,
  ],
  'send-to-sign-security': [
    {
      kind: 'standard',
      title: 'The Transport Layer Security (TLS) Protocol Version 1.3 (RFC 8446)',
      authors: 'Eric Rescorla',
      publisher: 'IETF',
      year: 2018,
      href: 'https://www.rfc-editor.org/rfc/rfc8446.html',
    },
    {
      kind: 'standard',
      title: 'FIPS 180-4: Secure Hash Standard (SHA-256)',
      publisher: 'NIST',
      year: 2015,
      href: 'https://doi.org/10.6028/NIST.FIPS.180-4',
      pdf: 'papers/fips-180-4-sha.pdf',
      licence: 'Public domain (US Government work)',
    },
    NIST_800_63B,
  ],
  'locking-a-pdf': [
    {
      kind: 'paper',
      title: 'AES Proposal: Rijndael',
      authors: 'Joan Daemen, Vincent Rijmen',
      publisher: 'NIST AES submission',
      year: 1999,
      href: 'https://csrc.nist.gov/csrc/media/projects/cryptographic-standards-and-guidelines/documents/aes-development/rijndael-ammended.pdf',
    },
    {
      kind: 'standard',
      title: 'FIPS 197: Advanced Encryption Standard (AES)',
      publisher: 'NIST',
      year: 2023,
      href: 'https://doi.org/10.6028/NIST.FIPS.197-upd1',
      pdf: 'papers/fips-197-aes.pdf',
      licence: 'Public domain (US Government work)',
    },
    { ...PDF_2_0, title: 'ISO 32000-2:2020 — PDF 2.0, §7.6.4: the AES-256 security handler' },
    {
      kind: 'paper',
      title: 'Practical Decryption exFiltration: Breaking PDF Encryption',
      authors: 'Jens Müller, Fabian Ising, Vladislav Mladenov, Christian Mainka, Sebastian Schinzel, Jörg Schwenk',
      publisher: 'ACM CCS',
      year: 2019,
      href: 'https://pdf-insecurity.org/download/paper-pdf_encryption-ccs2019.pdf',
    },
    NIST_800_63B,
  ],
}
