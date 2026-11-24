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
  function blok(uit, lab, txt) {
    if (!txt) return;
    var p = el('p', 'u-txt');
    p.appendChild(el('span', 'lab', lab));
    p.appendChild(document.createTextNode(txt));
    uit.appendChild(p);
  }
  function markeer(strofe, test) {
    $$('.w, .rn', strofe).forEach(function (b) {
      var aan = test(b);
      b.classList.toggle('on', aan);
      b.setAttribute('aria-pressed', aan ? 'true' : 'false');
    });
  }
  function toonWoord(strofe, key) {
    var e = D.lex[key], uit = $('.uitleg', strofe);
    markeer(strofe, function (b) { return b.classList.contains('w') && b.dataset.k === key; });
    uit.textContent = '';
    if (!e) return;
    var kop = el('div', 'u-kop');
    var w = el('span', 'u-w', e.w); w.lang = 'de';
    kop.appendChild(w);
    kop.appendChild(el('span', 'u-nl', e.nl));
    uit.appendChild(kop);
    if (e.fam) uit.appendChild(el('p', 'u-fam', 'Familie: ' + e.fam));
    if (e.chips && e.chips.length) uit.appendChild(chips(e.chips));
    blok(uit, 'Waarom zo', e.geb);
    blok(uit, 'Herkomst', e.ety);
  }
  function toonNoot(strofe, knop) {
    var uit = $('.uitleg', strofe), regel = knop.closest('.regel');
    markeer(strofe, function (b) { return b === knop; });
    uit.textContent = '';
    var kop = el('div', 'u-kop');
    kop.appendChild(el('span', 'u-nl', $('.nl', regel).textContent));
    uit.appendChild(kop);
    blok(uit, 'Waarom zo', knop.dataset.noot);
  }
  $$('.strofe').forEach(function (strofe) {
    strofe.addEventListener('click', function (ev) {
      var b = ev.target.closest('.w'), n = ev.target.closest('.rn');
      if (b) toonWoord(strofe, b.dataset.k);
      else if (n) toonNoot(strofe, n);
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

  $$('.strofe .duid').forEach(function (knop) {
    knop.addEventListener('click', function () {
      var aan = knop.getAttribute('aria-pressed') !== 'true', d = $('.duiding', knop.closest('.strofe'));
      knop.setAttribute('aria-pressed', aan ? 'true' : 'false');
      if (d) d.hidden = !aan;
    });
  });

  /* ---------- cultuur ---------- */
  $$('.raad').forEach(function (v) {
    v.addEventListener('click', function (ev) {
      var b = ev.target.closest('.opt');
      if (!b || v.dataset.klaar) return;
      var goed = b.dataset.ok === '1';
      v.dataset.klaar = '1';
      $$('.opt', v).forEach(function (o) { o.disabled = true; if (o.dataset.ok === '1') o.classList.add('goed'); });
      if (!goed) b.classList.add('fout');
      var toel = $('.toel', v);
      toel.textContent = (goed ? 'Ja. ' : 'Nee. ') + toel.dataset.t;
      toel.hidden = false;
    });
  });
  $$('a.naar').forEach(function (a) {
    a.addEventListener('click', function () {
      var r = document.getElementById(a.dataset.r);
      if (!r) return;
      r.classList.toggle('flits', false);
      void r.offsetWidth;
      r.classList.add('flits');
    });
  });
  $$('.hw').forEach(function (hw) {
    hw.addEventListener('click', function (ev) {
      var b = ev.target.closest('.hwk');
      if (!b) return;
      var e = D.lex[b.dataset.k], uit = $('.hw-uit', hw);
      $$('.hwk', hw).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      uit.textContent = '';
      if (!e) return;
      var w = el('b', null, e.w); w.lang = 'de';
      uit.appendChild(w);
      uit.appendChild(document.createTextNode(' ' + e.nl + (e.fam ? '. ' + e.fam : '')));
    });
  });

  /* ---------- meezingen ---------- */
  function vorm(s) {
    return s.trim().toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z0-9]/g, '');
  }
  $$('.mz').forEach(function (box) {
    var gaten = $$('.gat', box), score = $('.mz-score', box);
    function controleer() {
      var goed = 0;
      gaten.forEach(function (g) {
        var ok = vorm(g.value) === vorm(g.dataset.a);
        if (ok) goed++;
        g.classList.toggle('goed', ok);
        g.classList.toggle('fout', !ok && g.value.trim() !== '');
      });
      score.textContent = goed + ' van ' + gaten.length + ' goed';
    }
    $('.mz-check', box).addEventListener('click', controleer);
    $('.mz-toon', box).addEventListener('click', function () {
      gaten.forEach(function (g) {
        if (vorm(g.value) !== vorm(g.dataset.a)) { g.value = g.dataset.a; g.classList.toggle('fout', false); g.classList.add('getoond'); }
      });
      score.textContent = 'De antwoorden staan erin.';
    });
    var nlKnop = $('.mz-nl', box);
    nlKnop.addEventListener('click', function () {
      var aan = nlKnop.getAttribute('aria-pressed') !== 'true';
      nlKnop.setAttribute('aria-pressed', aan ? 'true' : 'false');
      $$('.mz-regel .nl', box).forEach(function (n) { n.hidden = !aan; });
    });
    gaten.forEach(function (g, i) {
      g.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        if (gaten[i + 1]) gaten[i + 1].focus(); else controleer();
      });
    });
  });

  /* ---------- oefenen ---------- */
  function schud(lijst) {
    var l = lijst.slice();
    for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = l[i]; l[i] = l[j]; l[j] = t; }
    return l;
  }
  function knop(cls, txt, taal) {
    var b = el('button', cls, txt);
    b.type = 'button';
    if (taal) b.lang = taal;
    return b;
  }

  // Koppel de woorden: vijf paren per ronde.
  var koppel = $('#koppel-app');
  if (koppel && D.paren && D.paren.length >= 4) {
    var kDe = $('.kolom-de', koppel), kNl = $('.kolom-nl', koppel), kStand = $('#koppel-stand'), kKeuze = null, kGoed = 0, kRonde = [];
    function koppelRonde() {
      kRonde = schud(D.paren).slice(0, 5);
      kGoed = 0; kKeuze = null;
      kDe.textContent = ''; kNl.textContent = '';
      kRonde.forEach(function (p, i) { var b = knop('kp', p.de, 'de'); b.dataset.i = i; kDe.appendChild(b); });
      schud(kRonde.map(function (p, i) { return i; })).forEach(function (i) { var b = knop('kp', kRonde[i].nl); b.dataset.i = i; kNl.appendChild(b); });
      kStand.textContent = '0 van ' + kRonde.length;
    }
    kDe.addEventListener('click', function (ev) {
      var b = ev.target.closest('.kp');
      if (!b || b.disabled) return;
      $$('.kp', kDe).forEach(function (x) { x.classList.toggle('gekozen', x === b); });
      kKeuze = b;
    });
    kNl.addEventListener('click', function (ev) {
      var b = ev.target.closest('.kp');
      if (!b || b.disabled || !kKeuze) return;
      if (b.dataset.i === kKeuze.dataset.i) {
        [b, kKeuze].forEach(function (x) { x.classList.remove('gekozen'); x.classList.add('af'); x.disabled = true; });
        kKeuze = null; kGoed++;
        kStand.textContent = kGoed === kRonde.length ? 'Alles gekoppeld. Er zijn nog meer woorden.' : kGoed + ' van ' + kRonde.length;
      } else {
        var mis = [b, kKeuze];
        mis.forEach(function (x) { x.classList.add('mis'); });
        setTimeout(function () { mis.forEach(function (x) { x.classList.remove('mis'); }); }, 650);
      }
    });
    $('#koppel-nieuw').addEventListener('click', koppelRonde);
    koppelRonde();
  }

  // Bouw de regel: zet de woorden van een regel weer op volgorde.
  var bouw = $('#bouw-app');
  if (bouw && D.zinnen && D.zinnen.length) {
    var bAnt = $('#bouw-antwoord'), bBank = $('#bouw-bank'), bUit = $('#bouw-uit'), bStand = $('#bouw-stand');
    var bVolgorde = schud(D.zinnen.map(function (z, i) { return i; })), bPlek = -1, bZin = null, bMis = 0, bGoed = 0;
    function bouwRegel() {
      bPlek = (bPlek + 1) % bVolgorde.length;
      bZin = D.zinnen[bVolgorde[bPlek]];
      bMis = 0;
      $('#bouw-nl').textContent = bZin.nl;
      bAnt.textContent = ''; bBank.textContent = ''; bUit.textContent = '';
      bUit.className = 'bouw-uit';
      var stukken = schud(bZin.stukken);
      if (stukken.join(' ') === bZin.stukken.join(' ')) stukken.reverse();
      stukken.forEach(function (w) { bBank.appendChild(knop('tegel', w, 'de')); });
    }
    function verplaats(ev, naar) {
      var b = ev.target.closest('.tegel');
      if (!b) return;
      naar.appendChild(b);
      bUit.textContent = '';
    }
    bBank.addEventListener('click', function (ev) { verplaats(ev, bAnt); });
    bAnt.addEventListener('click', function (ev) { verplaats(ev, bBank); });
    $('#bouw-check').addEventListener('click', function () {
      var nu = $$('.tegel', bAnt).map(function (b) { return b.textContent; });
      if (!nu.length) { bUit.textContent = 'Tik eerst de woorden aan.'; return; }
      if (nu.join(' ') === bZin.stukken.join(' ')) {
        bGoed++;
        bUit.className = 'bouw-uit ok';
        bUit.textContent = 'Klopt.';
        bStand.textContent = bGoed === 1 ? '1 regel goed' : bGoed + ' regels goed';
        return;
      }
      bMis++;
      bUit.className = 'bouw-uit fout';
      bUit.textContent = bMis < 2
        ? (bBank.children.length ? 'Nog niet, er liggen nog woorden.' : 'Nog niet helemaal. Kijk waar het werkwoord staat.')
        : 'Zo staat het in het lied: ' + bZin.stukken.join(' ');
    });
    $('#bouw-volgende').addEventListener('click', bouwRegel);
    bouwRegel();
  }

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
      kaart.appendChild(el('span', 'k-txt', 'Met Begin opnieuw komt de stapel terug.'));
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
