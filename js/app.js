/* ============================================================
   app.js — lookup UI wiring
   Depends on: data.js (PARTICIPANTS), certificate.js
   ============================================================ */

const $ = id => document.getElementById(id);
let current = null;

/* ---- helpers ----------------------------------------------------------- */
const normKey  = s => (s || '').trim().toLowerCase().replace(/\s+/g, '');
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function resetUI(){
  $('msg').classList.add('hidden');
  $('picker').classList.add('hidden');
  $('nameSearch').classList.add('hidden');
  $('result').classList.add('hidden');
  $('searchList').innerHTML = '';
}

function message(html, isError){
  const m = $('msg');
  m.innerHTML = html;
  m.className = 'msg' + (isError ? ' error' : '');
  m.classList.remove('hidden');
}

function personButton(p, subtitle, onClick){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pick';
  b.innerHTML = escapeHtml(p.n) + '<small>' + escapeHtml(subtitle) + '</small>';
  b.onclick = onClick;
  return b;
}

/* ---- show a certificate ------------------------------------------------ */
function showCertificate(p){
  current = p;
  $('whoName').textContent = p.n;
  $('whoMeta').textContent = 'B.Tech ' + p.y + ' Year · ' + p.d;
  $('result').classList.remove('hidden');

  drawCertificate($('cv'), p)
    .then(() => $('result').scrollIntoView({ behavior: 'smooth', block: 'start' }))
    .catch(err => {
      console.error(err);
      message('The certificate template could not be loaded. If you opened index.html ' +
              'directly from the file system, run it through a local server instead ' +
              '(<code>npm start</code>).', true);
    });
}

/* ---- email lookup ------------------------------------------------------ */
$('lookupForm').addEventListener('submit', e => {
  e.preventDefault();
  resetUI();

  const raw = $('email').value.trim();
  if (!raw){
    message('Please enter your registered email address.', true);
    return;
  }

  const matches = PARTICIPANTS[normKey(raw)];

  if (!matches){
    message('No registration found for <strong>' + escapeHtml(raw) + '</strong>. ' +
            'Use the exact address you filled in the registration form — for many ' +
            'participants that was the college address.', true);
    $('nameSearch').classList.remove('hidden');
    return;
  }

  if (matches.length === 1){
    showCertificate(matches[0]);
    return;
  }

  // two participants registered under the same address
  const list = $('pickList');
  list.innerHTML = '';
  matches.forEach(p => list.appendChild(
    personButton(p, 'B.Tech ' + p.y + ' Year · ' + p.d, () => {
      $('picker').classList.add('hidden');
      showCertificate(p);
    })
  ));
  $('picker').classList.remove('hidden');
});

/* ---- name search fallback ---------------------------------------------- */
$('nameInput').addEventListener('input', e => {
  const q = normKey(e.target.value);
  const box = $('searchList');
  box.innerHTML = '';
  if (q.length < 3) return;

  const hits = [];
  for (const email in PARTICIPANTS){
    for (const p of PARTICIPANTS[email]){
      if (normKey(p.n).includes(q)) hits.push([email, p]);
    }
  }

  if (!hits.length){
    const d = document.createElement('div');
    d.className = 'msg';
    d.textContent = 'No participant matches that name.';
    box.appendChild(d);
    return;
  }

  hits.slice(0, 8).forEach(([email, p]) => box.appendChild(
    personButton(p, 'B.Tech ' + p.y + ' Year · ' + p.d + ' · ' + email, () => {
      resetUI();
      showCertificate(p);
    })
  ));
});

/* ---- downloads --------------------------------------------------------- */
$('dlPng').addEventListener('click', () => {
  if (!current) return;
  $('cv').toBlob(b => saveBlob(b, certificateFileName(current, 'png')), 'image/png');
});

$('dlPdf').addEventListener('click', async () => {
  if (!current) return;
  const btn = $('dlPdf');
  btn.disabled = true;
  try {
    saveBlob(await makePdf($('cv')), certificateFileName(current, 'pdf'));
  } finally {
    btn.disabled = false;
  }
});

/* ---- reset ------------------------------------------------------------- */
$('again').addEventListener('click', () => {
  resetUI();
  current = null;
  $('email').value = '';
  $('email').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---- warm up: template image + certificate font ------------------------ */
loadTemplate().catch(() => {});
if (document.fonts && document.fonts.load) document.fonts.load('700 100px Tinos');
