# Import fixtures

`rich.docx` and `rich.odt` are **the same document saved both ways**, which is
what lets the spec assert that the two parsers agree. Both are generated from
`rich.html` with LibreOffice, so they are real producer output rather than XML
hand-written to match the parser — which would only ever prove the parser agrees
with itself.

To regenerate (LibreOffice on the PATH, or its full path on Windows):

```sh
soffice --headless --convert-to docx:"MS Word 2007 XML" --outdir . rich.html
soffice --headless --convert-to odt --outdir . rich.docx
```

The second step goes via the `.docx` deliberately: converting `rich.html`
straight to `.odt` produces a *Writer/Web* document, which is a different
(HTML-flavoured) shape from the Writer `.odt` a person would actually save.

Between them the pair exercises every construct the importers claim to support:
headings at three levels, bold / italic / both, an inline hyperlink, a bulleted
list with a nested level, a numbered list, a table with a header row, smart
quotes, an em dash and the `·` in UNI·SIM.

Real third-party Word documents were used during development as well, but are
not committed — they are customer correspondence.
