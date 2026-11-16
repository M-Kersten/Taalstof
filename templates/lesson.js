/* Interactie van de les, overgenomen uit duits/les1.js. Leest #lesdata. */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('lesdata').textContent);
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* zonder opslag werkt alles ook */ } }
  };
  function chips(list) {
    var box = el('div', 'chips');
    list.forEach(function (c) { box.appendChild(el('span', 'chip ' + c[0], c[1])); });
    return box;
  }

  /* ---------- lied ---------- */
  function toonWoord(strofe, key) {
    var e = D.lex[key], uit = $('.uitleg', strofe);
    $$('.w', strofe).forEach(function (b) {
      var aan = b.dataset.k === key;
      b.classList.toggle('on', aan);
      b.setAttribute('aria-pressed', aan ? 'true' : 'false');
    });
    uit.textContent = '';
    if (!e) return;
    var kop = el('div', 'u-kop');
    var w = el('span', 'u-w', e.w); w.lang = 'de';
    kop.appendChild(w);
    kop.appendChild(el('span', 'u-nl', e.nl));
    uit.appendChild(kop);
    if (e.fam) uit.appendChild(el('p', 'u-fam', 'Familie: ' + e.fam));
    if (e.chips && e.chips.length) uit.appendChild(chips(e.chips));
    uit.appendChild(el('p', 'u-txt', e.txt));
  }
  $$('.strofe').forEach(function (strofe) {
    strofe.addEventListener('click', function (ev) {
      var b = ev.target.closest('.w');
      if (b) toonWoord(strofe, b.dataset.k);
    });
    var knop = $('.vert', strofe);
    knop.addEventListener('click', function () { zetVertaling(strofe, knop.getAttribute('aria-pressed') !== 'true'); });
    var start = strofe.dataset.start;
    if (start) toonWoord(strofe, start);
  });
  function zetVertaling(strofe, aan) {
    $$('.nl', strofe).forEach(function (n) { n.hidden = !aan; });
    $('.vert', strofe).setAttribute('aria-pressed', aan ? 'true' : 'false');
  }
  var alle = $('#vert-alle');
  if (alle) alle.addEventListener('click', function () {
    var aan = alle.getAttribute('aria-pressed') !== 'true';
    alle.setAttribute('aria-pressed', aan ? 'true' : 'false');
    $$('.strofe').forEach(function (s) { zetVertaling(s, aan); });
  });

  /* ---------- decoder ---------- */
  var woorden = [];
  D.decoder.forEach(function (g) { g.woorden.forEach(function (w) { woorden.push(w); }); });
  var klaar = store.get('taalstof-' + D.id + '-decoder', []).filter(function (n) { return woorden.some(function (w) { return w.nl === n; }); });
  var huidig = 0, missers = 0;
  var kies = $('#dec-kies'), uit = $('#dec-uit'), inp = $('#dec-in');
  if (!woorden.length) { var da = $('#decoder-app'); if (da) da.hidden = true; }

  (function bouwKiezer() {
    var i = 0;
    D.decoder.forEach(function (g) {
      kies.appendChild(el('p', 'dec-groep', g.groep));
      var rij = el('div', 'dec-chips');
      g.woorden.forEach(function (w) {
        var b = el('button', 'wk', w.nl);
        b.type = 'button';
        b.dataset.i = i++;
        rij.appendChild(b);
      });
      kies.appendChild(rij);
    });
    kies.addEventListener('click', function (ev) {
      var b = ev.target.closest('.wk');
      if (b) kiesWoord(+b.dataset.i, true);
    });
  })();

  function norm(s) {
    return s.trim().toLowerCase().replace(/ß/g, 'ss').replace(/^(der|die|das)\s+/, '');
  }
  function kap(w, s) { return /^[A-ZÄÖÜ]/.test(w.de) ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function werkBij() {
    $$('.wk', kies).forEach(function (b) {
      var w = woorden[+b.dataset.i];
      b.classList.toggle('on', +b.dataset.i === huidig);
      b.classList.toggle('af', klaar.indexOf(w.nl) !== -1);
      if (+b.dataset.i === huidig) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    $('#dec-score').textContent = klaar.length + ' van ' + woorden.length + ' gedecodeerd';
  }
  function kiesWoord(i, focus) {
    huidig = i; missers = 0;
    var w = woorden[i];
    $('#dec-nl').textContent = w.nl;
    $('#dec-en').textContent = w.en;
    inp.value = '';
    uit.textContent = '';
    uit.appendChild(el('p', 'oordeel', 'Typ je gok en druk op Controleer.'));
    werkBij();
    if (focus) { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }
  }
  function regelsVan(w) {
    return w.stappen.filter(function (s) { return s[0].indexOf('→') !== -1 || s[0] === 'geen schuif' || /blijft/.test(s[0]); })
      .map(function (s) { return ['k', s[0]]; });
  }
  function toonHint() {
    var w = woorden[huidig];
    uit.textContent = '';
    uit.appendChild(el('p', 'oordeel', 'Deze schuiven heb je nodig, in deze volgorde:'));
    uit.appendChild(chips(regelsVan(w)));
  }
  function toonAfleiding(kop, cls) {
    var w = woorden[huidig];
    uit.textContent = '';
    uit.appendChild(el('p', 'oordeel ' + (cls || ''), kop));
    var ol = el('ol', 'ladder');
    var li = el('li');
    li.appendChild(el('span', 'chip', 'Nederlands'));
    li.appendChild(el('span', 'vorm', w.nl));
    ol.appendChild(li);
    w.stappen.forEach(function (s, n) {
      var laatste = n === w.stappen.length - 1;
      var r = el('li', laatste ? 'eind' : '');
      r.appendChild(el('span', 'chip k', s[0]));
      var v = el('span', 'vorm', laatste ? w.de : kap(w, s[1]));
      v.lang = 'de';
      r.appendChild(v);
      ol.appendChild(r);
    });
    uit.appendChild(ol);
    uit.appendChild(el('p', 'dec-noot', w.noot));
  }
  if (woorden.length) $('#dec-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var w = woorden[huidig], gok = norm(inp.value);
    if (!gok) { uit.textContent = ''; uit.appendChild(el('p', 'oordeel', 'Typ eerst een woord. Fout gokken mag.')); return; }
    if (gok === norm(w.de)) {
      if (klaar.indexOf(w.nl) === -1) { klaar.push(w.nl); store.set('taalstof-' + D.id + '-decoder', klaar); }
      toonAfleiding('Raak. Zo kom je er:', 'ok');
      werkBij();
    } else {
      missers++;
      if (missers >= 2) {
        toonAfleiding('Nog niet. Hier is de afleiding:', 'fout');
      } else {
        uit.textContent = '';
        uit.appendChild(el('p', 'oordeel fout', 'Nog niet. Kijk welke schuiven erin zitten en probeer het nog een keer.'));
        uit.appendChild(chips(regelsVan(w)));
      }
    }
  });
  $('#dec-hint').addEventListener('click', toonHint);
  $('#dec-toon').addEventListener('click', function () { toonAfleiding('De afleiding, stap voor stap:', ''); });
  $('#dec-volgende').addEventListener('click', function () {
    var n = woorden.length, i;
    for (i = 1; i <= n; i++) {
      var k = (huidig + i) % n;
      if (klaar.indexOf(woorden[k].nl) === -1) { kiesWoord(k, true); return; }
    }
    kiesWoord((huidig + 1) % n, true);
  });
  if (woorden.length) kiesWoord(0, false);

  /* ---------- flashcards ---------- */
  var kaart = $('#kaart'), gekend = store.get('taalstof-' + D.id + '-kaarten', []).filter(function (v) {
    return D.kaarten.some(function (k) { return k.v === v; });
  });
  var stapel = [], om = false;
  function vulStapel() {
    stapel = D.kaarten.filter(function (k) { return gekend.indexOf(k.v) === -1; });
  }
  function tekenKaart() {
    kaart.textContent = '';
    kaart.classList.toggle('om', om);
    $('#k-voortgang').textContent = gekend.length + ' van ' + D.kaarten.length + ' gekend';
    var leeg = stapel.length === 0;
    $('#k-ja').disabled = leeg; $('#k-nee').disabled = leeg;
    if (leeg) {
      kaart.appendChild(el('span', 'zijde', 'Stapel leeg'));
      kaart.appendChild(el('span', 'k-w', 'Je kent ze allemaal.'));
      kaart.appendChild(el('span', 'k-txt', 'Zing het lied nog een keer en let op hoeveel je nu hoort. Met Begin opnieuw komt de hele stapel terug.'));
      return;
    }
    var k = stapel[0];
    if (!om) {
      kaart.appendChild(el('span', 'zijde', 'Voorkant'));
      var v = el('span', 'voor', k.v); v.lang = 'de';
      kaart.appendChild(v);
      kaart.appendChild(el('span', 'draai', 'Tik om te draaien'));
    } else {
      kaart.appendChild(el('span', 'zijde', 'Achterkant'));
      var w = el('span', 'k-w', k.v); w.lang = 'de';
      kaart.appendChild(w);
      kaart.appendChild(el('span', 'k-b', k.b));
      if (k.fam) kaart.appendChild(el('span', 'k-fam', 'Familie: ' + k.fam));
      if (k.regel) {
        var soort = k.regel.indexOf('→') !== -1 ? 'k' : 'l';
        kaart.appendChild(chips([[soort, k.regel]]));
      }
      kaart.appendChild(el('span', 'k-txt', k.txt));
    }
  }
  kaart.addEventListener('click', function () { if (stapel.length) { om = !om; tekenKaart(); } });
  $('#k-ja').addEventListener('click', function () {
    if (!stapel.length) return;
    gekend.push(stapel.shift().v);
    store.set('taalstof-' + D.id + '-kaarten', gekend);
    om = false; tekenKaart();
  });
  $('#k-nee').addEventListener('click', function () {
    if (!stapel.length) return;
    stapel.push(stapel.shift());
    om = false; tekenKaart();
  });
  $('#k-reset').addEventListener('click', function () {
    gekend = []; store.set('taalstof-' + D.id + '-kaarten', gekend);
    vulStapel(); om = false; tekenKaart();
  });
  vulStapel(); tekenKaart();

  /* ---------- zelftoets ---------- */
  var vragen = $$('.mc > li');
  function scoreBij() {
    var gedaan = 0, goed = 0;
    vragen.forEach(function (v) {
      if (v.dataset.klaar) { gedaan++; if (v.dataset.klaar === 'goed') goed++; }
    });
    var t = gedaan + ' van ' + vragen.length + ' beantwoord';
    if (gedaan) t += ', ' + goed + ' goed';
    $('#toets-score').textContent = t;
  }
  vragen.forEach(function (v) {
    v.addEventListener('click', function (ev) {
      var b = ev.target.closest('.opt');
      if (!b || v.dataset.klaar) return;
      var goed = b.dataset.ok === '1';
      v.dataset.klaar = goed ? 'goed' : 'fout';
      $$('.opt', v).forEach(function (o) {
        o.disabled = true;
        if (o.dataset.ok === '1') o.classList.add('goed');
      });
      if (!goed) b.classList.add('fout');
      var toel = $('.toel', v);
      toel.textContent = (goed ? 'Goed. ' : 'Net niet. ') + toel.dataset.t;
      toel.hidden = false;
      scoreBij();
    });
  });
  $('#toets-reset').addEventListener('click', function () {
    vragen.forEach(function (v) {
      delete v.dataset.klaar;
      $$('.opt', v).forEach(function (o) { o.disabled = false; o.classList.remove('goed', 'fout'); });
      $('.toel', v).hidden = true;
    });
    scoreBij();
  });
})();
