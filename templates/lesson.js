/* Interactie van de les. Leest #lesdata. De les is een reis door het lied: haltes met stappen. */
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
  function knop(cls, txt, taal) {
    var b = el('button', cls, txt);
    b.type = 'button';
    if (taal) b.lang = taal;
    return b;
  }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* zonder opslag werkt alles ook */ } }
  };
  var sleutel = 'taalstof-' + D.id + '-';
  function chips(list) {
    var box = el('div', 'chips');
    list.forEach(function (c) { box.appendChild(el('span', 'chip ' + c[0], c[1])); });
    return box;
  }

  /* ---------- het couplet lezen ---------- */
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
  function toonNoot(strofe, b) {
    var uit = $('.uitleg', strofe), regel = b.closest('.regel');
    markeer(strofe, function (x) { return x === b; });
    uit.textContent = '';
    var kop = el('div', 'u-kop');
    kop.appendChild(el('span', 'u-nl', $('.nl', regel).textContent));
    uit.appendChild(kop);
    blok(uit, 'Waarom zo', b.dataset.noot);
  }
  $$('.strofe').forEach(function (strofe) {
    strofe.addEventListener('click', function (ev) {
      var b = ev.target.closest('.w'), n = ev.target.closest('.rn');
      if (b) toonWoord(strofe, b.dataset.k);
      else if (n) toonNoot(strofe, n);
    });
    var vert = $('.vert', strofe);
    vert.addEventListener('click', function () {
      var aan = vert.getAttribute('aria-pressed') !== 'true';
      $$('.nl', strofe).forEach(function (n) { n.hidden = !aan; });
      vert.setAttribute('aria-pressed', aan ? 'true' : 'false');
    });
    if (strofe.dataset.start) toonWoord(strofe, strofe.dataset.start);
  });

  /* ---------- erachter ---------- */
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

  /* ---------- zelf doen ---------- */
  function schud(lijst) {
    var l = lijst.slice();
    for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = l[i]; l[i] = l[j]; l[j] = t; }
    return l;
  }

  // Koppel de woorden: hooguit vijf paren per ronde.
  function koppelSpel(box, paren) {
    var kDe = $('.kolom-de', box), kNl = $('.kolom-nl', box), stand = $('.koppel-stand', box), keuze = null, goed = 0, ronde = [];
    function nieuw() {
      ronde = schud(paren).slice(0, 5);
      goed = 0; keuze = null;
      kDe.textContent = ''; kNl.textContent = '';
      ronde.forEach(function (p, i) { var b = knop('kp', p.de, 'de'); b.dataset.i = i; kDe.appendChild(b); });
      schud(ronde.map(function (p, i) { return i; })).forEach(function (i) { var b = knop('kp', ronde[i].nl); b.dataset.i = i; kNl.appendChild(b); });
      stand.textContent = '0 van ' + ronde.length;
    }
    kDe.addEventListener('click', function (ev) {
      var b = ev.target.closest('.kp');
      if (!b || b.disabled) return;
      $$('.kp', kDe).forEach(function (x) { x.classList.toggle('gekozen', x === b); });
      keuze = b;
    });
    kNl.addEventListener('click', function (ev) {
      var b = ev.target.closest('.kp');
      if (!b || b.disabled || !keuze) return;
      if (b.dataset.i === keuze.dataset.i) {
        [b, keuze].forEach(function (x) { x.classList.remove('gekozen'); x.classList.add('af'); x.disabled = true; });
        keuze = null; goed++;
        stand.textContent = goed === ronde.length
          ? (paren.length > ronde.length ? 'Alles gekoppeld. Er zijn nog meer woorden.' : 'Alles gekoppeld.')
          : goed + ' van ' + ronde.length;
      } else {
        var mis = [b, keuze];
        mis.forEach(function (x) { x.classList.add('mis'); });
        setTimeout(function () { mis.forEach(function (x) { x.classList.remove('mis'); }); }, 650);
      }
    });
    var opnieuw = $('.koppel-nieuw', box);
    if (paren.length <= 5) opnieuw.textContent = 'Nog een keer';
    opnieuw.addEventListener('click', nieuw);
    nieuw();
  }

  // Bouw een regel: zet de woorden weer in de volgorde van het lied.
  function bouwSpel(box, zinnen) {
    var ant = $('.bouw-antwoord', box), bank = $('.bouw-bank', box), uit = $('.bouw-uit', box), stand = $('.bouw-stand', box);
    var volgorde = schud(zinnen.map(function (z, i) { return i; })), plek = -1, zin = null, mis = 0, goed = 0;
    function regel() {
      plek = (plek + 1) % volgorde.length;
      zin = zinnen[volgorde[plek]];
      mis = 0;
      $('.bouw-nl', box).textContent = zin.nl;
      var bij = $('.bouw-bij', box);
      bij.textContent = zin.bij ? 'Deze regel kwam net voorbij bij ‘' + zin.bij + '’.' : '';
      bij.hidden = !zin.bij;
      ant.textContent = ''; bank.textContent = ''; uit.textContent = '';
      uit.className = 'bouw-uit';
      var stukken = schud(zin.stukken);
      if (stukken.join(' ') === zin.stukken.join(' ')) stukken.reverse();
      stukken.forEach(function (w) { bank.appendChild(knop('tegel', w, 'de')); });
    }
    function verplaats(ev, naar) {
      var b = ev.target.closest('.tegel');
      if (!b) return;
      naar.appendChild(b);
      uit.textContent = '';
    }
    bank.addEventListener('click', function (ev) { verplaats(ev, ant); });
    ant.addEventListener('click', function (ev) { verplaats(ev, bank); });
    $('.bouw-check', box).addEventListener('click', function () {
      var nu = $$('.tegel', ant).map(function (b) { return b.textContent; });
      if (!nu.length) { uit.textContent = 'Tik eerst de woorden aan.'; return; }
      if (nu.join(' ') === zin.stukken.join(' ')) {
        goed++;
        uit.className = 'bouw-uit ok';
        uit.textContent = 'Klopt.';
        stand.textContent = goed === 1 ? '1 regel goed' : goed + ' regels goed';
        return;
      }
      mis++;
      uit.className = 'bouw-uit fout';
      uit.textContent = mis < 2
        ? (bank.children.length ? 'Nog niet, er liggen nog woorden.' : 'Nog niet helemaal. Kijk waar het werkwoord staat.')
        : 'Zo staat het in het lied: ' + zin.stukken.join(' ');
    });
    var volgende = $('.bouw-volgende', box);
    if (volgende) volgende.addEventListener('click', regel);
    regel();
  }

  $$('.spel-koppel').forEach(function (box) { var s = D.spellen[box.dataset.spel]; if (s && s.paren.length) koppelSpel(box, s.paren); });
  $$('.spel-bouw').forEach(function (box) { var s = D.spellen[box.dataset.spel]; if (s && s.zinnen.length) bouwSpel(box, s.zinnen); });

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

  /* ---------- toets ---------- */
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
  var toetsReset = $('#toets-reset');
  if (toetsReset) toetsReset.addEventListener('click', function () {
    vragen.forEach(function (v) {
      delete v.dataset.klaar;
      $$('.opt', v).forEach(function (o) { o.disabled = false; o.classList.remove('goed', 'fout'); });
      $('.toel', v).hidden = true;
    });
    scoreBij();
  });

  /* ---------- kaarten, in de naslag ---------- */
  var kaart = $('#kaart');
  if (kaart) {
    var gekend = store.get(sleutel + 'kaarten', []).filter(function (v) {
      return D.kaarten.some(function (k) { return k.v === v; });
    });
    var stapel = [], om = false;
    var vulStapel = function () { stapel = D.kaarten.filter(function (k) { return gekend.indexOf(k.v) === -1; }); };
    var tekenKaart = function () {
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
        if (k.regel) kaart.appendChild(chips([[k.regel.indexOf('→') !== -1 ? 'k' : 'l', k.regel]]));
        kaart.appendChild(el('span', 'k-txt', k.txt));
      }
    };
    kaart.addEventListener('click', function () { if (stapel.length) { om = !om; tekenKaart(); } });
    $('#k-ja').addEventListener('click', function () {
      if (!stapel.length) return;
      gekend.push(stapel.shift().v);
      store.set(sleutel + 'kaarten', gekend);
      om = false; tekenKaart();
    });
    $('#k-nee').addEventListener('click', function () {
      if (!stapel.length) return;
      stapel.push(stapel.shift());
      om = false; tekenKaart();
    });
    $('#k-reset').addEventListener('click', function () {
      gekend = []; store.set(sleutel + 'kaarten', gekend);
      vulStapel(); om = false; tekenKaart();
    });
    vulStapel(); tekenKaart();
  }

  /* ---------- de reis: pad, stappen, voortgang ---------- */
  var desk = window.matchMedia('(min-width: 1000px)');
  var haltes = D.haltes, stappen = [];
  haltes.forEach(function (h) { h.stappen.forEach(function (s) { s.h = h; stappen.push(s); }); });
  if (!stappen.length) return;
  function stap(id) { return stappen.filter(function (s) { return s.id === id; })[0]; }
  function halte(id) { return haltes.filter(function (h) { return h.id === id; })[0]; }
  var gezien = store.get(sleutel + 'gezien', []).filter(function (id) { return !!stap(id); });
  var nu = stap(store.get(sleutel + 'nu', '')) || stappen[0];
  function isGezien(id) { return gezien.indexOf(id) !== -1; }
  function halteAf(h) { return h.stappen.every(function (s) { return isGezien(s.id); }); }
  function eersteOpen(h) { return (h.stappen.filter(function (s) { return !isGezien(s.id); })[0] || h.stappen[0]).id; }

  function tekenPad() {
    $$('.pad .halte').forEach(function (li) {
      var h = halte(li.dataset.halte);
      li.classList.toggle('af', halteAf(h));
      li.classList.toggle('nu', nu.h === h);
      $$('.sub a', li).forEach(function (a) {
        a.classList.toggle('af', isGezien(a.dataset.stap));
        if (a.dataset.stap === nu.id) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
      });
    });
  }
  function tekenKop() {
    var h = nu.h, k = haltes.indexOf(h);
    var titel = $('#kop-titel');
    titel.textContent = '';
    titel.appendChild(el('b', null, h.naam));
    titel.appendChild(el('span', null, (k + 1) + ' van ' + haltes.length));
    var balk = $('#balk');
    balk.textContent = '';
    haltes.forEach(function (x) {
      var seg = el('span');
      var deel = x.stappen.filter(function (s) { return isGezien(s.id); }).length / x.stappen.length;
      var vul = el('i'); vul.style.width = Math.round(deel * 100) + '%';
      seg.appendChild(vul);
      balk.appendChild(seg);
    });
    var pillen = $('#pillen');
    pillen.textContent = '';
    if (h.stappen.length > 1) {
      h.stappen.forEach(function (s) {
        var b = knop('pil' + (s === nu ? ' nu' : isGezien(s.id) ? ' af' : ''), s.naam);
        b.dataset.stap = s.id;
        if (s === nu) b.setAttribute('aria-current', 'step');
        pillen.appendChild(b);
      });
    }
  }
  function zet(s) {
    // De secties heten stap-<id>, zodat de browser niet zelf naar het adres in de balk springt.
    stappen.forEach(function (x) { document.getElementById('stap-' + x.id).hidden = x !== s; });
    nu = s;
    if (!isGezien(s.id)) { gezien.push(s.id); store.set(sleutel + 'gezien', gezien); }
    store.set(sleutel + 'nu', s.id);
    tekenKop(); tekenPad();
  }
  function toonOverzicht() {
    zet(nu);
    if (desk.matches) return;
    document.body.classList.add('ov-open');
    var hier = $('.pad .halte.nu');
    if (hier) hier.scrollIntoView({ block: 'center' });
  }
  function route() {
    sluitSheet();
    var id = decodeURIComponent(location.hash.slice(1)), s = stap(id);
    if (s) {
      zet(s);
      document.body.classList.remove('ov-open');
      window.scrollTo(0, 0);
    } else if (id === 'overzicht' || !desk.matches) {
      toonOverzicht();
    } else {
      zet(nu);
      document.body.classList.remove('ov-open');
    }
  }
  function ga(id) {
    if (location.hash.slice(1) === id) route(); else location.hash = id;
  }

  // Kaartje onderaan op de telefoon: wat er bij deze halte komt.
  var sheet = $('#sheet'), sheetAchter = $('#sheet-achter');
  function sluitSheet() { sheet.hidden = true; sheetAchter.hidden = true; }
  function openSheet(h) {
    sheet.textContent = '';
    sheet.appendChild(el('div', 'greep'));
    var naam = el('p', 'lab', h.naam); naam.id = 'sheet-naam';
    sheet.appendChild(naam);
    if (h.inleiding) sheet.appendChild(el('p', 'verteller', h.inleiding));
    if (h.soort === 'couplet') { var r = el('p', 'de', h.label); r.lang = 'de'; sheet.appendChild(r); }
    if (h.woorden.length) {
      var rij = el('div', 'sheet-woorden');
      h.woorden.forEach(function (w) { var c = el('span', 'hwk', w); c.lang = 'de'; rij.appendChild(c); });
      sheet.appendChild(rij);
    }
    var begonnen = h.stappen.some(function (s) { return isGezien(s.id); });
    var b = knop('btn pri groot', halteAf(h) ? 'Nog een keer' : begonnen ? 'Verder' : 'Begin');
    b.addEventListener('click', function () { ga(halteAf(h) ? h.stappen[0].id : eersteOpen(h)); });
    sheet.appendChild(b);
    sheet.hidden = false; sheetAchter.hidden = false;
    b.focus();
  }
  sheetAchter.addEventListener('click', sluitSheet);
  $('.pad').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-halte]');
    if (!b || ev.target.closest('.sub')) return;
    var h = halte(b.dataset.halte);
    if (desk.matches) ga(eersteOpen(h)); else openSheet(h);
  });

  // Verder, de stappen bovenin en de knop naar het overzicht.
  document.addEventListener('click', function (ev) {
    var v = ev.target.closest('.verder');
    if (v) { ga(v.dataset.naar); return; }
    var p = ev.target.closest('.pil');
    if (p) ga(p.dataset.stap);
  });
  $('#naar-overzicht').addEventListener('click', function () { ga('overzicht'); });

  // De naslag schuift er van rechts in.
  var naslag = $('#naslag'), naslagAchter = $('#naslag-achter');
  function sluitNaslag() { naslag.hidden = true; naslagAchter.hidden = true; document.body.classList.remove('naslag-open'); }
  function openNaslag(doel) {
    naslag.hidden = false; naslagAchter.hidden = false;
    document.body.classList.add('naslag-open');
    var d = doel && document.getElementById(doel);
    if (d) d.scrollIntoView({ block: 'start' }); else naslag.scrollTop = 0;
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-naslag]');
    if (!a) return;
    ev.preventDefault();
    if (naslag.hidden || !a.dataset.naslag) openNaslag(a.dataset.naslag);
    else { var d = document.getElementById(a.dataset.naslag); if (d) d.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  });
  $('#sluit-naslag').addEventListener('click', sluitNaslag);
  naslagAchter.addEventListener('click', sluitNaslag);
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (!naslag.hidden) sluitNaslag(); else if (!sheet.hidden) sluitSheet();
  });

  window.addEventListener('hashchange', route);
  if (desk.addEventListener) desk.addEventListener('change', route);
  route();
})();
