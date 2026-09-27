/* Pizzaiolo — scene animate (.cp-scena). Nessuna libreria, nessuna API pubblica.
 *
 * Aggancio: basta includere <script src="/assets/scena.js" defer></script>.
 * Al DOMContentLoaded e poi con un MutationObserver il file trova ogni .cp-scena con un id noto
 * (vedi SCENE), ne costruisce l'interno se manca e la ridisegna a ogni cambio dei suoi data-*.
 * Lo sviluppo scrive SOLO gli attributi (SPEC §6.3); il contenitore può essere vuoto:
 *   <div id="scena-impasto" class="cp-scena" data-panetti="6" data-peso="250" data-temp="22"
 *        data-ore="24" data-frigo="18" data-lievito="0.42" data-valido="1"
 *        data-idratazione="65" data-tipo-lievito="fresco"></div>
 * data-idratazione (%, 50–100) e data-tipo-lievito (fresco|secco) sono facoltativi (SPEC §7.1):
 * se mancano valgono 65 e fresco; non influiscono su data-valido né sull'umore.
 * Gli SVG (panetto, nuvola, termometro, caraffa, lievito, lievito-secco) si caricano con fetch da "svg/" accanto a questo file
 * (quindi /assets/svg/...), una volta sola: funziona da qualsiasi pagina senza markup extra.
 * Se il fetch fallisce la scena resta leggibile (etichette e panetti semplificati).
 *   <div id="scena-koda" class="cp-scena" data-fiamma="alta" data-pietra="412" data-fase="preriscaldo"></div>
 * (koda: senza SVG restano fumetto, etichette e indicatore della pietra, più una sagoma CSS).
 */
(function () {
  'use strict';

  var script = document.currentScript || document.querySelector('script[src*="scena.js"]');
  var BASE_SVG = new URL('svg/', script ? script.src : location.href).href;

  var ATTRIBUTI = [
    'data-panetti', 'data-peso', 'data-temp', 'data-ore', 'data-frigo', 'data-lievito', 'data-valido',
    'data-idratazione', 'data-tipo-lievito',
    'data-pietra', 'data-fiamma', 'data-fase'
  ];

  /* ---------- SVG: caricamento e clonazione ---------- */
  var cacheSvg = {};
  function caricaSvg(nome) {
    if (!cacheSvg[nome]) {
      cacheSvg[nome] = fetch(BASE_SVG + nome + '.svg')
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (testo) {
          var t = document.createElement('template');
          t.innerHTML = testo.replace(/<\?xml[^>]*>/, '').trim();
          return t.content.querySelector('svg');
        })
        .catch(function () { return null; });
    }
    return cacheSvg[nome];
  }
  function clona(svg) { return svg ? document.importNode(svg, true) : null; }

  /* ---------- utilità ---------- */
  function numero(el, nome) {
    var v = parseFloat(String(el.getAttribute(nome) || '').replace(',', '.'));
    return isFinite(v) ? v : NaN;
  }
  function limita(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function formatta(v, dec) {
    return v.toLocaleString('it-IT', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 1 });
  }
  function crea(tag, classe, testo) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo) e.textContent = testo;
    return e;
  }

  /* ---------- Scena impasto ----------
   * Umore della mascotte (priorità dall'alto):
   *   confusa   — data-valido="0" o un valore non numerico
   *   frenetica — ore totali ≤ 8 con temperatura ≥ 25 °C, oppure ore totali ≤ 4
   *   assonnata — ore di frigo ≥ 12
   *   serena    — tutti gli altri casi
   * Scale visive:
   *   panetti   — ne disegna al massimo 12 (griglia 6×2), oltre compare "+N";
   *               lato ∝ radice cubica del peso (peso ∝ volume), 250 g = 0,82, limiti 0,5–1
   *   termometro— 15 °C → 20% della colonna, 35 °C → 95%, lineare
   *   lievito   — logaritmica: 0,05 g → scala 0,3; 5 g → scala 1 (limiti inclusi);
   *               fresco = mucchietto sbriciolato, secco = bustina + granuli (lievito-secco.svg)
   *   caraffa   — livello dell'acqua: 50% → 20% della caraffa, 100% → 95%, lineare
   *   nuvola    — (SPEC §10) --cp-nuvola sull'interno, 0–1: 0 fino a NUVOLA_DA %, 1 a 100%,
   *               smoothstep in mezzo. nuvola.svg viene innestato nel panetto (mascotte e
   *               panetti piccoli); il CSS incrocia le opacità impasto/nuvola, fa spuntare i
   *               batuffoli e solleva la figura dal piano. Da VOLA_DA % in su data-vola="1"
   *               sull'interno accende la fluttuazione (spenta con prefers-reduced-motion).
   */
  var FRASI = {
    serena: 'Tutto sotto controllo.',
    assonnata: 'Zzz… lunga notte in frigo.',
    frenetica: 'Caldo e poco tempo: si corre!',
    confusa: 'Mmh, qualche dato non torna.'
  };
  var MAX_PANETTI = 12;
  var NUVOLA_DA = 65, VOLA_DA = 88;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* Panetto + nuvola in un solo SVG: tutto tranne l'ombra va in g.cp-panetto-figura (si solleva),
   * gli sbuffi dietro al corpo, il corpo-nuvola sopra l'impasto ma sotto guance ed espressioni. */
  function componiPanetto(panetto, nuvola) {
    if (!panetto) return null;
    var p = panetto.cloneNode(true);
    var figura = document.createElementNS(SVG_NS, 'g');
    figura.setAttribute('class', 'cp-panetto-figura');
    Array.prototype.slice.call(p.children).forEach(function (c) {
      if (!c.classList.contains('cp-panetto-ombra')) figura.appendChild(c);
    });
    p.appendChild(figura);
    if (nuvola) {
      var sbuffi = nuvola.querySelector('.cp-nuvola-sbuffi'), corpo = nuvola.querySelector('.cp-nuvola-corpo');
      if (sbuffi) figura.insertBefore(sbuffi.cloneNode(true), figura.firstChild);
      if (corpo) figura.insertBefore(corpo.cloneNode(true), figura.querySelector('.cp-panetto-guance, .cp-espressione'));
    }
    return p;
  }

  function umore(d) {
    if (!d.valido) return 'confusa';
    if ((d.ore <= 8 && d.temp >= 25) || d.ore <= 4) return 'frenetica';
    if (d.frigo >= 12) return 'assonnata';
    return 'serena';
  }

  var scenaImpasto = {
    monta: function (el, stato) {
      var interno = crea('div', 'cp-scena-interno');
      var mascotte = crea('div', 'cp-scena-mascotte');
      var fumetto = crea('p', 'cp-scena-fumetto');
      fumetto.setAttribute('aria-live', 'polite');

      var termometro = crea('div', 'cp-scena-termometro');
      var etTemp = crea('span', 'cp-scena-etichetta');
      termometro.appendChild(etTemp);

      var caraffa = crea('div', 'cp-scena-caraffa');
      var etAcqua = crea('span', 'cp-scena-etichetta');
      caraffa.appendChild(etAcqua);

      var lievito = crea('div', 'cp-scena-lievito');
      var etLievito = crea('span', 'cp-scena-etichetta');
      lievito.appendChild(etLievito);

      var cassetta = crea('div', 'cp-scena-cassetta');
      var conto = crea('span', 'cp-scena-conto');
      var extra = crea('span', 'cp-scena-extra');
      extra.hidden = true;
      var griglia = crea('div', 'cp-scena-panetti');
      cassetta.append(conto, extra, griglia);

      interno.append(fumetto, mascotte, termometro, lievito, cassetta, caraffa);
      el.replaceChildren(interno);

      stato.parti = {
        interno: interno, mascotte: mascotte, fumetto: fumetto, termometro: termometro, etTemp: etTemp,
        caraffa: caraffa, etAcqua: etAcqua,
        lievito: lievito, etLievito: etLievito, cassetta: cassetta, conto: conto, extra: extra, griglia: griglia
      };
      stato.ultimi = { panetti: 6, peso: 250, temp: 22, ore: 24, frigo: 0, lievito: 0.5, idratazione: 65 };

      return Promise.all([caricaSvg('panetto'), caricaSvg('termometro'), caricaSvg('lievito'),
        caricaSvg('lievito-secco'), caricaSvg('caraffa'), caricaSvg('nuvola')])
        .then(function (svg) {
          stato.svgPanetto = componiPanetto(svg[0], svg[5]);
          var p = clona(stato.svgPanetto);
          if (p) mascotte.appendChild(p);
          var t = clona(svg[1]);
          if (t) termometro.insertBefore(t, etTemp);
          var l = clona(svg[2]);
          if (l) lievito.insertBefore(l, etLievito);
          var ls = clona(svg[3]);
          if (ls) lievito.insertBefore(ls, etLievito);
          var c = clona(svg[4]);
          if (c) caraffa.insertBefore(c, etAcqua);
          griglia.replaceChildren(); // i panetti semplificati lasciano posto agli SVG
        });
    },

    aggiorna: function (el, stato) {
      var P = stato.parti, u = stato.ultimi;
      var letti = {
        panetti: numero(el, 'data-panetti'), peso: numero(el, 'data-peso'), temp: numero(el, 'data-temp'),
        ore: numero(el, 'data-ore'), frigo: numero(el, 'data-frigo'), lievito: numero(el, 'data-lievito')
      };
      var tuttiNumeri = true;
      Object.keys(letti).forEach(function (k) {
        if (isNaN(letti[k])) tuttiNumeri = false; else u[k] = letti[k]; // se manca, resta l'ultimo buono
      });
      var d = {
        valido: el.getAttribute('data-valido') !== '0' && tuttiNumeri,
        ore: u.ore, temp: u.temp, frigo: u.frigo
      };

      // Panetti
      var n = Math.max(0, Math.round(u.panetti));
      var visibili = Math.min(n, MAX_PANETTI);
      var g = P.griglia;
      while (g.children.length > visibili) g.lastElementChild.remove();
      while (g.children.length < visibili) {
        var mini = crea('span', 'cp-scena-mini');
        var s = clona(stato.svgPanetto);
        if (s) mini.appendChild(s);
        g.appendChild(mini);
      }
      P.cassetta.style.setProperty('--cp-scala', limita(0.82 * Math.cbrt(Math.max(u.peso, 1) / 250), 0.5, 1).toFixed(3));
      P.conto.textContent = n + ' × ' + formatta(u.peso) + ' g';
      P.extra.hidden = n <= MAX_PANETTI;
      if (n > MAX_PANETTI) P.extra.textContent = '+' + (n - MAX_PANETTI);

      // Termometro
      P.termometro.style.setProperty('--cp-livello', limita(0.2 + (u.temp - 15) / 20 * 0.75, 0.12, 1).toFixed(3));
      P.etTemp.textContent = formatta(u.temp) + ' °C';

      // Lievito
      var t = u.lievito > 0 ? (Math.log10(u.lievito) - Math.log10(0.05)) / 2 : 0;
      P.lievito.style.setProperty('--cp-quantita', (0.3 + 0.7 * limita(t, 0, 1)).toFixed(3));
      P.etLievito.textContent = d.valido ? formatta(u.lievito, 2) + ' g' : '– g';
      P.lievito.setAttribute('data-tipo', el.getAttribute('data-tipo-lievito') === 'secco' ? 'secco' : 'fresco');

      // Acqua (idratazione): se manca o non è un numero resta l'ultimo valore buono
      var h = numero(el, 'data-idratazione');
      if (!isNaN(h)) u.idratazione = h;
      P.caraffa.style.setProperty('--cp-livello', limita(0.2 + (u.idratazione - 50) / 50 * 0.75, 0.1, 1).toFixed(3));
      P.etAcqua.textContent = formatta(u.idratazione) + '%';

      // Nuvola (SPEC §10)
      var e = limita((u.idratazione - NUVOLA_DA) / (100 - NUVOLA_DA), 0, 1);
      P.interno.style.setProperty('--cp-nuvola', (e * e * (3 - 2 * e)).toFixed(3));
      if (u.idratazione >= VOLA_DA) P.interno.setAttribute('data-vola', '1');
      else P.interno.removeAttribute('data-vola');

      // Umore
      var nuovo = umore(d);
      if (nuovo !== stato.umore) {
        stato.umore = nuovo;
        var panetto = P.mascotte.querySelector('.cp-panetto');
        if (panetto) panetto.setAttribute('data-umore', nuovo);
        P.fumetto.textContent = FRASI[nuovo];
        if (stato.montata) {
          P.mascotte.classList.remove('is-sobbalzo');
          void P.mascotte.offsetWidth; // riavvia l'animazione
          P.mascotte.classList.add('is-sobbalzo');
          clearTimeout(stato.timerSobbalzo);
          stato.timerSobbalzo = setTimeout(function () { P.mascotte.classList.remove('is-sobbalzo'); }, 700);
        }
      }
      stato.montata = true;
    }
  };

  /* ---------- Scena Koda (sessione.php) ----------
   * Attributi (SPEC §6.3/§6.5), scritti dallo sviluppo sul contenitore vuoto #scena-koda:
   *   data-fiamma  spenta | bassa | alta          (altro/vuoto → spenta)
   *   data-pietra  °C misurati, anche decimali     (vuoto → indicatore senza lancetta)
   *   data-fase    preriscaldo | pronta | cottura | fine   (altro/vuoto → preriscaldo)
   * Fasce della pietra: < 350 fredda, 350–<400 quasi, 400–450 pronta, > 450 troppo calda.
   * Scala dell'indicatore: 250–500 °C lineare (valori fuori scala restano sul bordo).
   * Fiamma, pizza e fumo sono puro CSS sugli attributi del contenitore; qui si calcolano
   * solo fascia, lancetta, etichette e fumetto.
   */
  var PIETRA_MIN = 250, PIETRA_MAX = 500;
  var FASCE = [
    { nome: 'fredda', etichetta: 'fredda', testo: 'fredda', fino: 350 },
    { nome: 'quasi', etichetta: 'quasi', testo: 'quasi pronta', fino: 400 },
    { nome: 'pronta', etichetta: 'pronta', testo: 'pronta', fino: 450.0001 },
    { nome: 'calda', etichetta: 'troppo', testo: 'troppo calda', fino: Infinity }
  ];
  var FIAMME = { spenta: 'Fiamma spenta', bassa: 'Fiamma bassa', alta: 'Fiamma alta' };
  var FASI = ['preriscaldo', 'pronta', 'cottura', 'fine'];

  function fasciaPietra(t) {
    if (isNaN(t)) return null;
    for (var i = 0; i < FASCE.length; i++) if (t < FASCE[i].fino) return FASCE[i];
    return FASCE[FASCE.length - 1];
  }

  function fraseKoda(fase, fiamma, fascia) {
    var f = fascia ? fascia.nome : '';
    if (fase === 'cottura') return 'In forno! Gira la pizza spesso.';
    if (fase === 'fine') return 'Sfornata! Segna pietra e secondi.';
    if (f === 'calda') return 'Pietra troppo calda: abbassa la fiamma.';
    if (fase === 'pronta') return fiamma === 'alta' ? 'Pietra pronta: fiamma al minimo e inforna!' : 'Pietra pronta: inforna!';
    if (fiamma === 'spenta') return 'Koda spento: accendi a fiamma alta.';
    if (!f) return 'Si scalda… misura la pietra col termometro IR.';
    if (f === 'fredda') return 'Si scalda… la pietra è ancora fredda.';
    if (f === 'quasi') return 'Quasi pronta, ancora qualche minuto.';
    return 'Pietra in temperatura!';
  }

  var scenaKoda = {
    monta: function (el, stato) {
      var interno = crea('div', 'cp-scena-koda');
      var fumetto = crea('p', 'cp-scena-fumetto');
      fumetto.setAttribute('aria-live', 'polite');
      var forno = crea('div', 'cp-scena-forno');

      var dati = crea('div', 'cp-scena-koda-dati');
      var etFiamma = crea('span', 'cp-scena-etichetta cp-scena-fiamma-etichetta');
      var etPietra = crea('span', 'cp-scena-etichetta');
      dati.append(etFiamma, etPietra);

      var indicatore = crea('div', 'cp-koda-indicatore');
      indicatore.setAttribute('aria-hidden', 'true');
      var fasce = crea('div', 'cp-koda-fasce');
      FASCE.forEach(function (f) {
        var s = crea('span', 'cp-koda-fascia', f.etichetta);
        s.setAttribute('data-fascia', f.nome);
        fasce.appendChild(s);
      });
      var tacche = crea('div', 'cp-koda-tacche');
      [350, 400, 450].forEach(function (t) {
        var s = crea('span', '', String(t));
        s.style.left = ((t - PIETRA_MIN) / (PIETRA_MAX - PIETRA_MIN) * 100) + '%';
        tacche.appendChild(s);
      });
      var lancetta = crea('span', 'cp-koda-lancetta');
      indicatore.append(fasce, tacche, lancetta);

      interno.append(fumetto, forno, dati, indicatore);
      el.replaceChildren(interno);
      stato.parti = { interno: interno, fumetto: fumetto, forno: forno, etFiamma: etFiamma, etPietra: etPietra, indicatore: indicatore, lancetta: lancetta };

      return caricaSvg('koda').then(function (svg) {
        var k = clona(svg);
        if (k) forno.appendChild(k);
      });
    },

    aggiorna: function (el, stato) {
      var P = stato.parti;
      var fiamma = el.getAttribute('data-fiamma');
      if (!FIAMME[fiamma]) fiamma = 'spenta';
      var fase = el.getAttribute('data-fase');
      if (FASI.indexOf(fase) < 0) fase = 'preriscaldo';
      var t = numero(el, 'data-pietra');
      var fascia = fasciaPietra(t);

      P.interno.setAttribute('data-fascia', fascia ? fascia.nome : '');
      P.indicatore.setAttribute('data-fascia', fascia ? fascia.nome : '');
      if (fascia) {
        P.lancetta.style.setProperty('--cp-pos', limita((t - PIETRA_MIN) / (PIETRA_MAX - PIETRA_MIN), 0.01, 0.99).toFixed(3));
      }
      P.etFiamma.setAttribute('data-fiamma', fiamma);
      P.etFiamma.textContent = FIAMME[fiamma];
      P.etPietra.textContent = fascia ? 'Pietra ' + formatta(t, 0) + ' °C · ' + fascia.testo : 'Pietra: – °C';

      var frase = fraseKoda(fase, fiamma, fascia);
      if (P.fumetto.textContent !== frase) P.fumetto.textContent = frase;
    }
  };

  /* Scene riconosciute per id. */
  var SCENE = {
    'scena-impasto': scenaImpasto,
    'scena-koda': scenaKoda
  };

  /* ---------- motore ---------- */
  var stati = new WeakMap();

  function aggancia(el) {
    var scena = SCENE[el.id];
    if (!scena || stati.has(el)) return;
    var stato = { pronta: false };
    stati.set(el, stato);
    var montaggio = scena.monta(el, stato);
    scena.aggiorna(el, stato); // disegno immediato, anche prima degli SVG
    stato.pronta = true;
    Promise.resolve(montaggio).then(function () {
      if (!el.isConnected) return;
      stato.umore = null; // riapplica l'umore al panetto appena inserito
      stato.montata = false;
      scena.aggiorna(el, stato);
    });
  }

  var inCoda = new Set();
  var richiesta = 0;
  function pianifica(el) {
    inCoda.add(el);
    if (!richiesta) richiesta = requestAnimationFrame(function () {
      richiesta = 0;
      inCoda.forEach(function (e) {
        var stato = stati.get(e), scena = SCENE[e.id];
        if (stato && stato.pronta && scena && e.isConnected) scena.aggiorna(e, stato);
      });
      inCoda.clear();
    });
  }

  function cercaScene(radice) {
    if (radice.nodeType !== 1) return;
    if (radice.matches('.cp-scena')) aggancia(radice);
    radice.querySelectorAll('.cp-scena').forEach(aggancia);
  }

  function avvia() {
    cercaScene(document.body);
    new MutationObserver(function (mutazioni) {
      mutazioni.forEach(function (m) {
        if (m.type === 'attributes') {
          if (m.target.classList.contains('cp-scena')) {
            if (!stati.has(m.target)) aggancia(m.target); else pianifica(m.target);
          }
        } else {
          m.addedNodes.forEach(cercaScene);
        }
      });
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRIBUTI });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();
