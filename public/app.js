(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var gekozen = null;

  function el(tag, txt) { var e = document.createElement(tag); if (txt != null) e.textContent = txt; return e; }

  async function api(url, opts) {
    var res = await fetch(url, opts);
    var body = await res.json().catch(function () { return {}; });
    if (res.status === 401) { melding('Log eerst in bij Spotify.'); throw new Error('login'); }
    if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
    return body;
  }
  function melding(t) { $('#melding').textContent = t; }

  async function status() {
    var s = await api('/api/status');
    var m = $('#status'); m.textContent = '';
    function stip(label, ok) { var e = el('span', (ok ? '✓ ' : '✗ ') + label); e.className = ok ? 'ok' : 'fout'; m.appendChild(e); }
    stip('Spotify-app', s.keys.spotify);
    stip('Musixmatch', s.keys.musixmatch);
    stip('Anthropic', s.keys.anthropic);
    m.appendChild(el('span', 'model ' + s.model));
    if (s.keys.spotify && !s.spotify) { var a = el('a', 'Inloggen bij Spotify'); a.href = '/login'; m.appendChild(a); }
    else if (s.spotify) stip('ingelogd', true);
  }

  function toonTracks(tracks) {
    var ul = $('#lijst'); ul.textContent = '';
    if (!tracks.length) { ul.appendChild(el('li', 'Niets gevonden.')); return; }
    tracks.forEach(function (t) {
      var li = el('li'), b = el('button'); b.type = 'button';
      if (t.imageUrl) { var img = el('img'); img.src = t.imageUrl; img.alt = ''; b.appendChild(img); }
      var s = el('span', t.title); s.appendChild(el('small', t.artist)); b.appendChild(s);
      b.addEventListener('click', function () { kies(t); });
      li.appendChild(b); ul.appendChild(li);
    });
  }

  function toonPlaylists(lists) {
    var ul = $('#lijst'); ul.textContent = '';
    lists.forEach(function (p) {
      var li = el('li'), b = el('button'); b.type = 'button';
      if (p.imageUrl) { var img = el('img'); img.src = p.imageUrl; img.alt = ''; b.appendChild(img); }
      var s = el('span', p.name); if (p.total != null) s.appendChild(el('small', p.total + ' nummers')); b.appendChild(s);
      b.addEventListener('click', async function () { toonTracks(await api('/api/playlists/' + encodeURIComponent(p.id))); });
      li.appendChild(b); ul.appendChild(li);
    });
  }

  async function kies(t) {
    gekozen = t;
    $('#gekozen').hidden = false;
    $('#g-titel').textContent = t.title;
    $('#g-artiest').textContent = t.artist;
    var sp = $('#g-spotify'); sp.hidden = !t.spotifyUrl; if (t.spotifyUrl) sp.href = t.spotifyUrl;
    $('#plak').value = ''; melding('');
    $('#g-lyrics').textContent = 'Songtekst zoeken…';
    try {
      var l = await api('/api/lyrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track: t }) });
      if (!l) $('#g-lyrics').textContent = 'Geen tekst gevonden bij Musixmatch. Plak de tekst zelf.';
      else $('#g-lyrics').textContent = l.partial
        ? 'Musixmatch gaf een deel van de tekst (' + l.text.split('\n').length + ' regels). Plak de hele tekst voor een volledige les.'
        : 'Tekst gevonden (' + l.text.split('\n').length + ' regels).';
    } catch (e) { $('#g-lyrics').textContent = 'Tekst ophalen mislukt: ' + e.message + '. Je kunt de tekst ook plakken.'; }
    $('#gekozen').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('#maak').addEventListener('click', async function () {
    if (!gekozen) return;
    var b = $('#maak'); b.disabled = true;
    melding('Les maken. Dit duurt een paar minuten bij een nieuw lied…');
    try {
      var r = await api('/api/lesson', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track: gekozen, lyricsText: $('#plak').value }) });
      melding('Klaar: ' + r.titel);
      window.open(r.url, '_blank');
      lessen();
    } catch (e) { melding('Mislukt: ' + e.message); }
    b.disabled = false;
  });

  $('#zoek-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var q = $('#zoek-q').value.trim(); if (!q) return;
    try { toonTracks(await api('/api/search?q=' + encodeURIComponent(q))); } catch (e) { if (e.message !== 'login') melding(e.message); }
  });

  document.querySelectorAll('[data-tab]').forEach(function (t) {
    t.addEventListener('click', async function () {
      document.querySelectorAll('[data-tab]').forEach(function (x) { x.setAttribute('aria-pressed', x === t ? 'true' : 'false'); });
      $('#zoek-form').hidden = t.dataset.tab !== 'zoek';
      $('#lijst').textContent = '';
      try {
        if (t.dataset.tab === 'recent') toonTracks(await api('/api/recent'));
        if (t.dataset.tab === 'playlists') toonPlaylists(await api('/api/playlists'));
      } catch (e) { if (e.message !== 'login') melding(e.message); }
    });
  });

  async function lessen() {
    var ul = $('#lessen'); ul.textContent = '';
    var rows = await api('/api/lessons');
    if (!rows.length) { ul.appendChild(el('li', 'Nog geen lessen.')); return; }
    rows.forEach(function (r) { var li = el('li'), a = el('a', r.file.replace(/-[0-9a-f]{6}\.html$/, '')); a.href = r.url; a.target = '_blank'; li.appendChild(a); ul.appendChild(li); });
  }

  status(); lessen();
})();
