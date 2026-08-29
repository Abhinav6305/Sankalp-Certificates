/* ============================================================
   certificate.js
   Draws a participant's certificate onto a <canvas>, and exports
   it as PNG or PDF. No external libraries.
   ============================================================ */

/* ---- geometry ---------------------------------------------------------
   The original design is 6250 x 4419 px. Every coordinate below is taken
   from that file and scaled by S, so you can change RENDER_WIDTH alone to
   change output resolution and nothing else moves.

   Measured from the source design:
     paragraph left edge      x = 560
     paragraph right edge     x = 5885
     first line baseline      y = 2198
     line height                  145
     font size                    107  (Times New Roman Bold)
     blank rule: top edge     y = 2213  (baseline + 15), thickness 6.5
   ---------------------------------------------------------------------- */
const RENDER_WIDTH = 3000;                  // px; ~256 DPI on A4 landscape
const TEMPLATE_SRC = 'assets/certificate-template.jpg';

const S = RENDER_WIDTH / 6250;
const GEO = {
  left:     560  * S,
  right:    5885 * S,
  baseline: 2198 * S,
  lineHeight: 145 * S,
  fontSize:   107 * S,
  maxLines:   5,                            // shrink slightly if a name overflows this
  weight:     400,                          // body copy weight
  color:      '#000'
};

/* The name, year and department are *filled-in blanks*, so they are drawn
   sitting on the same rule the original design used for its underscores.
   Measured from the source file: the rule's top edge is 15px below the
   baseline and it is 6.5px thick.                                          */
const BLANK = {
  underline:  true,        // false -> filled values read as plain body text
  offset:     15  * S,     // baseline to top of the rule
  thickness:  6.5 * S,
  padding:    12  * S,     // rule overhang on each side of the value
  weight:     700,         // the filled values are the only bold text
  nameScale:  1.0          // >1 enlarges the name relative to the body text
};

/* One place that builds a canvas font string, so weight/size/family never
   drift apart between measuring and drawing. */
function fontString(weight, px){
  return weight + ' ' + px.toFixed(2) + 'px Tinos, "Times New Roman", Times, serif';
}

/* ---- template image ---------------------------------------------------- */
let _tpl = null;
function loadTemplate(){
  if (_tpl) return Promise.resolve(_tpl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => { _tpl = img; resolve(img); };
    img.onerror = () => reject(new Error('Could not load ' + TEMPLATE_SRC));
    img.src = TEMPLATE_SRC;
  });
}

/* ---- the certificate wording -------------------------------------------
   `p` is { n: name, y: year (I/II/III/IV), d: department }

   The paragraph is described as segments rather than one string so the
   three filled-in values can be underlined. `blank` marks a segment as a
   value we filled into the design's blank; segments sharing a blank id are
   underlined as one continuous rule (so a multi-word name keeps its rule
   running through the spaces).
   ------------------------------------------------------------------------ */
function bodySegments(p){
  return [
    { t: 'Mr./Ms.' },
    { t: p.n, blank: 'name' },
    { t: ', student of B.Tech' },
    { t: p.y, blank: 'year' },
    { t: 'Year from the Department of' },
    { t: p.d, blank: 'dept' },
    { t: '. This Certificate of Appreciation is proudly presented for your ' +
         'enthusiastic participation in SANKALP ’26 – The Innovation Sprint, ' +
         'organized by ORIGIN Association. Your dedication, creativity, and ' +
         'collaborative spirit in embracing “Observe. Think. Build. Present.” ' +
         'are sincerely appreciated.' }
  ];
}

/* Plain-text version — used for measuring and by the test suite. */
function bodyText(p){
  return bodySegments(p)
    .map(s => s.t)
    .join(' ')
    .replace(/\s+([,.])/g, '$1');       // no space before the punctuation that follows a blank
}

/* ---- tokenise ----------------------------------------------------------
   Turns the segments into a flat list of words, each carrying the blank it
   belongs to (or null) and its size relative to the body text.
   ------------------------------------------------------------------------ */
function tokenise(p){
  const words = [];
  for (const seg of bodySegments(p)){
    const scale  = seg.blank === 'name' ? BLANK.nameScale : 1;
    const weight = seg.blank ? BLANK.weight : GEO.weight;
    for (const w of String(seg.t).trim().split(/\s+/)){
      if (!w) continue;
      // punctuation that trails a blank must hug the previous word, but is
      // set in the body weight — it belongs to the sentence, not the value
      if (!seg.blank && /^[,.]/.test(w) && words.length){
        const prev = words[words.length - 1];
        const mark = w.match(/^[,.]+/)[0];
        prev.tail = (prev.tail || '') + mark;   // drawn separately, off the rule
        const rest = w.slice(mark.length);
        if (rest) words.push({ t: rest, blank: null, scale: 1, weight: GEO.weight });
        continue;
      }
      words.push({ t: w, blank: seg.blank || null, scale, weight });
    }
  }
  return words;
}

/* ---- layout ------------------------------------------------------------
   Wraps the words and returns lines of positioned words, so the underline
   rules can be drawn under exactly the right spans.
   ------------------------------------------------------------------------ */
function layoutWords(ctx, words, maxWidth, baseSize){
  const widthOf = (weight, scale, text) => {
    ctx.font = fontString(weight, baseSize * scale);
    return ctx.measureText(text).width;
  };
  ctx.font = fontString(GEO.weight, baseSize);
  const spaceWidth = ctx.measureText(' ').width;

  const lines = [];
  let line = [], x = 0;

  for (const w of words){
    const ww = widthOf(w.weight, w.scale, w.t);
    // a trailing comma / full stop rides along but is set in the body weight
    const tailW = w.tail ? widthOf(GEO.weight, 1, w.tail) : 0;
    const advance = (line.length ? spaceWidth : 0) + ww + tailW;

    if (line.length && x + advance > maxWidth){
      lines.push(line);
      line = [];
      x = 0;
    }
    const at = line.length ? x + spaceWidth : 0;
    line.push(Object.assign({}, w, { x: at, w: ww, tailW: tailW }));
    x = at + ww + tailW;
  }
  if (line.length) lines.push(line);
  return lines;
}

/* Legacy helper kept so existing checks/tests keep working. */
function wrapText(ctx, text, maxWidth){
  const out = [];
  let line = '';
  for (const w of text.split(' ')){
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line){ out.push(line); line = w; }
    else line = test;
  }
  if (line) out.push(line);
  return out;
}

/* ---- draw -------------------------------------------------------------- */
async function drawCertificate(canvas, p){
  const img = await loadTemplate();
  if (document.fonts && document.fonts.load){
    const px = Math.round(GEO.fontSize);
    await Promise.all([
      document.fonts.load(GEO.weight + ' ' + px + 'px Tinos'),
      document.fonts.load(BLANK.weight + ' ' + px + 'px Tinos')
    ]);
  }

  const W = RENDER_WIDTH;
  const H = Math.round(W * img.naturalHeight / img.naturalWidth);
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  const maxWidth = GEO.right - GEO.left;
  const words = tokenise(p);

  let size = GEO.fontSize;
  let lines;
  for (let i = 0; i < 8; i++){
    lines = layoutWords(ctx, words, maxWidth, size);
    if (lines.length <= GEO.maxLines) break;
    size *= 0.96;
  }

  const k  = size / GEO.fontSize;
  const lh = GEO.lineHeight * k;

  ctx.fillStyle = GEO.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  lines.forEach((line, i) => {
    const baseline = GEO.baseline + i * lh;

    // the filled-in blanks, drawn first so the text sits on top of the rule
    if (BLANK.underline){
      for (let a = 0; a < line.length; a++){
        if (!line[a].blank) continue;
        let b = a;
        while (b + 1 < line.length && line[b + 1].blank === line[a].blank) b++;
        const last = line[b];
        // last.w excludes any trailing comma / full stop, which belongs to
        // the sentence rather than to the blank — so the rule stops short of it
        const x0 = GEO.left + line[a].x - BLANK.padding;
        const x1 = GEO.left + last.x + last.w + BLANK.padding;
        ctx.fillRect(x0, baseline + BLANK.offset * k, x1 - x0, BLANK.thickness * k);
        a = b;
      }
    }

    for (const w of line){
      ctx.font = fontString(w.weight, size * w.scale);
      ctx.fillText(w.t, GEO.left + w.x, baseline);
      if (w.tail){
        ctx.font = fontString(GEO.weight, size);
        ctx.fillText(w.tail, GEO.left + w.x + w.w, baseline);
      }
    }
  });

  return canvas;
}

/* ---- PDF --------------------------------------------------------------
   A hand-written, single-page PDF that embeds the canvas as a JPEG.
   Avoids pulling in jsPDF (~360 KB) for what is ~40 lines of work.
   ---------------------------------------------------------------------- */
function latin1(str){
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

async function makePdf(canvas){
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
  const jpg  = new Uint8Array(await blob.arrayBuffer());

  const PAGE_W = 841.89, PAGE_H = 595.28;          // A4 landscape, points
  const scale  = Math.min(PAGE_W / canvas.width, PAGE_H / canvas.height);
  const imgW   = canvas.width  * scale;
  const imgH   = canvas.height * scale;
  const offX   = (PAGE_W - imgW) / 2;
  const offY   = (PAGE_H - imgH) / 2;
  const f      = n => n.toFixed(4);

  const chunks = [];
  const offsets = [0];
  let len = 0;
  const put  = u => { chunks.push(u); len += u.length; };
  const puts = s => put(latin1(s));
  const obj  = s => { offsets.push(len); puts(s); };

  puts('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  obj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  obj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(PAGE_W) + ' ' + f(PAGE_H) +
      '] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n');

  const content = 'q\n' + f(imgW) + ' 0 0 ' + f(imgH) + ' ' + f(offX) + ' ' + f(offY) + ' cm\n/Im0 Do\nQ\n';
  obj('4 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n');

  offsets.push(len);
  puts('5 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + canvas.width +
       ' /Height ' + canvas.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8' +
       ' /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
  put(jpg);
  puts('\nendstream\nendobj\n');

  const xrefAt = len;
  let tail = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) tail += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  tail += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n';
  puts(tail);

  return new Blob(chunks, { type: 'application/pdf' });
}

/* ---- download helpers -------------------------------------------------- */
function certificateFileName(p, ext){
  const safe = p.n.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return 'SANKALP26_Certificate_' + safe + '.' + ext;
}

function saveBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
