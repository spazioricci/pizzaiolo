'use strict';

/*
 * Formula dell'impasto — Calcolapizza 2.1 della Confraternita della Pizza
 * (https://laconfraternitadellapizza.net/calcolapizza/calcolapizza2.js, copia in
 * test/originale-calcolapizza2.js). Riprodotta fedelmente per il sottoinsieme di
 * parametri usati da quest'app (grassi=0, pasta di riporto=0, teglia=no).
 *
 * Implementazione gemella di includes/Impasto.php: calcolaImpasto() qui e
 * Impasto::calcola() in PHP devono dare risultati identici.
 */

// Sale: SPEC §7 punto 1 lo rende una costante fissa (non più un campo in pagina).
// Unico punto della costante per questa implementazione (gemella in includes/Impasto.php).
const SALE_G_L = 50;

/**
 * @param {{n:number, peso:number, temp:number, ore:number, frigo:number, H:number, tipoLievito?:string}} input
 * @returns {{valido:boolean, errori:Object<string,string>, farina:?number, acqua:?number, sale:?number, lievito:?number, lievitoSecco:?number, w:?number}}
 */
function calcolaImpasto({ n, peso, temp, ore, frigo, H, tipoLievito }) {
  const S = SALE_G_L;
  const errori = {};

  const nOk = Number.isFinite(n) && n >= 1 && n % 1 === 0;
  if (!nOk) errori.n = 'Inserire un numero intero di panetti, almeno 1.';

  const pesoOk = Number.isFinite(peso) && peso > 0;
  if (!pesoOk) errori.peso = 'Inserire un peso per panetto maggiore di 0.';

  const tempOk = Number.isFinite(temp) && temp >= 15 && temp <= 35;
  if (!tempOk) errori.temp = 'Inserire una temperatura tra 15 e 35 °C.';

  const oreOk = Number.isFinite(ore) && ore >= 3 && ore <= 96;
  if (!oreOk) errori.ore = 'Inserire un numero di ore totali tra 3 e 96.';

  // Regola SPEC §2: frigo valido se 0, oppure se 0 <= frigo <= ore-1.
  // (Nell'originale la validazione del frigo ha un comportamento limite diverso
  // quando "ore" non è un numero valido, per via del confronto con NaN in
  // JavaScript; qui si segue la regola esplicita di SPEC, più chiara. Vedi
  // includes/Impasto.php per lo stesso commento lato server.)
  let frigoOk;
  if (frigo === 0) {
    frigoOk = true;
  } else {
    frigoOk = Number.isFinite(frigo) && frigo >= 0 && oreOk && frigo <= ore - 1;
  }
  if (!frigoOk) errori.frigo = 'Inserire 0 oppure un numero di ore non superiore a ore totali meno 1.';

  const HOk = Number.isFinite(H) && H >= 50 && H <= 100;
  if (!HOk) errori.H = 'Idratazione fuori intervallo (50–100).';

  const valido = Object.keys(errori).length === 0;

  if (!valido) {
    return { valido: false, errori, farina: null, acqua: null, sale: null, lievito: null, lievitoSecco: null, w: null };
  }

  const c = ore - 0.9 * frigo;
  const wLog = 81.4206918743428 + 78.3939060802556 * Math.log(ore);
  const w = 10 * Math.round(wLog / 10);

  const Y = (2250 * (1 + S / 200))
    / ((4.2 * H - 80 - 0.0305 * H * H) * Math.pow(temp, 2.5) * Math.pow(c, 1.2));

  const impasto = n * peso;
  const C = H * S + 1000 * (H + 100);

  const farinaGrezza = (1e5 * impasto) / C;
  const acquaGrezza = (1000 * H * impasto) / C;
  const saleGrezza = (S * H * impasto) / C;
  // Il lievito si calcola sulla farina NON arrotondata (come nell'originale).
  const lievitoGrezzo = farinaGrezza * Y;
  // Lievito secco (SPEC §7.1): fresco/3 dal valore NON arrotondato, poi arrotondato a 2 decimali.
  const lievitoSeccoGrezzo = lievitoGrezzo / 3;

  return {
    valido: true,
    errori: {},
    farina: Number(farinaGrezza.toFixed(0)),
    acqua: Number(acquaGrezza.toFixed(0)),
    sale: Number(saleGrezza.toFixed(0)),
    lievito: Number(lievitoGrezzo.toFixed(2)),
    lievitoSecco: Number(lievitoSeccoGrezzo.toFixed(2)),
    w,
    tipoLievito: tipoLievito === 'secco' ? 'secco' : 'fresco',
  };
}

/**
 * Pianificazione a ritroso (SPEC §8.1) — gemella di Pianificatore::pianifica() in PHP.
 * Metodo di Guido: impasto → puntata (default 0) → frigo → fuori dal frigo e staglio a
 * freddo → appretto a temperatura ambiente → accensione Koda → infornata.
 * @param {{
 *   ore:number, frigo:number, infornata:Date,
 *   puntataMin?:number, kodaPreriscaldoMin?:number
 * }} input
 * @returns {{tappe: Array<{tipo:string, quando:Date}>, avviso: ?string, errore: ?string}}
 */
function pianifica({ ore, frigo, infornata, puntataMin = 0, kodaPreriscaldoMin = 30 }) {
  const infornataTs = infornata.getTime();
  const impastoTs = infornataTs - ore * 3600 * 1000;
  const puntataFineTs = impastoTs + puntataMin * 60 * 1000;
  const frigoDentroTs = puntataMin > 0 ? puntataFineTs : impastoTs;

  const tappe = [];
  tappe.push({ tipo: 'impasto', quando: impastoTs });
  if (puntataMin > 0) {
    tappe.push({ tipo: 'puntata', quando: puntataFineTs });
  }

  let staglioTs;
  if (frigo > 0) {
    tappe.push({ tipo: 'frigo_dentro', quando: frigoDentroTs });
    staglioTs = frigoDentroTs + frigo * 3600 * 1000;
  } else {
    staglioTs = frigoDentroTs;
  }
  tappe.push({ tipo: 'staglio', quando: staglioTs });

  const kodaTs = infornataTs - kodaPreriscaldoMin * 60 * 1000;
  tappe.push({ tipo: 'koda', quando: kodaTs });
  tappe.push({ tipo: 'infornata', quando: infornataTs });

  tappe.sort((a, b) => a.quando - b.quando);

  // Appretto = ore - frigo - puntata/60 (SPEC §8.1), non impostabile: derivato.
  const apprettoOre = ore - frigo - puntataMin / 60;

  let avviso = null;
  let errore = null;
  if (apprettoOre <= 0) {
    errore = `Appretto di ${formattaOre(apprettoOre)} h: non c'è tempo per l'appretto dopo lo `
      + `staglio. Riduci la puntata o le ore di frigo, oppure aumenta le ore totali.`;
  } else if (apprettoOre < 2 || apprettoOre > 8) {
    avviso = `Appretto di ${formattaOre(apprettoOre)} h: fuori dall'intervallo tipico 2–8 h `
      + `indicato dalle fonti (Ooni ~5 h). Controlla il raddoppio.`;
  }

  const tappeArrotondate = tappe.map((t) => ({
    tipo: t.tipo,
    quando: new Date(Math.round(t.quando / 60000) * 60000), // arrotonda al minuto
  }));

  return { tappe: tappeArrotondate, avviso, errore };
}

function formattaOre(ore) {
  const s = ore.toFixed(1).replace(/\.?0+$/, '').replace('.', ',');
  return s === '' ? '0' : s;
}

/** Peso del lievito nel tipo scelto, a partire dal fresco già arrotondato (2 decimali)
 * salvato in una ricetta — porting di Impasto::pesoLievitoTipo(). */
function pesoLievitoTipo(frescoG, tipo) {
  return tipo === 'secco' ? Number((frescoG / 3).toFixed(2)) : frescoG;
}

/** Ordine delle tappe (SPEC §8.1); una sessione può non avere 'puntata' o 'frigo_dentro'. */
const ORDINE_TAPPE = ['impasto', 'puntata', 'frigo_dentro', 'staglio', 'koda', 'infornata'];

/**
 * Risincronizza il piano (SPEC §8.2, richiesta di Guido del 26/09/2026) — porting di
 * Pianificatore::risincronizza(). Quando una tappa viene fatta a un orario diverso da
 * quello previsto, le tappe successive NON ANCORA fatte slittano dello stesso
 * scostamento: si scorrono le tappe in ordine, ogni tappa già fatta aggiorna lo
 * scostamento corrente (fatto_il - previsto_il, col previsto_il più recente, che
 * riflette eventuali scostamenti precedenti); le tappe non ancora fatte dopo l'ultima
 * fatta vengono spostate di quello scostamento.
 * @param {Array<{id:number, tipo:string, previsto_il:?string, fatto_il:?string}>} passi
 * @returns {Object<number, Date>} id del passo -> nuovo previsto_il
 */
function risincronizza(passi) {
  const ordine = Object.fromEntries(ORDINE_TAPPE.map((t, i) => [t, i]));
  const ordinati = [...passi].sort((a, b) => (ordine[a.tipo] ?? 99) - (ordine[b.tipo] ?? 99));

  let scostamentoMs = 0;
  const aggiornamenti = {};
  for (const p of ordinati) {
    if (p.previsto_il === null || p.previsto_il === undefined) continue;
    if (p.fatto_il !== null && p.fatto_il !== undefined) {
      scostamentoMs = new Date(p.fatto_il).getTime() - new Date(p.previsto_il).getTime();
    } else if (scostamentoMs !== 0) {
      aggiornamenti[p.id] = new Date(new Date(p.previsto_il).getTime() + scostamentoMs);
    }
  }
  return aggiornamenti;
}

/* ---------------------------------------------------------------------- */
/* Da qui in giù: logica di pagina (index.php). Legge i campi, ricalcola   */
/* live, scrive risultati e attributi data-* per la scena animata.        */
/* ---------------------------------------------------------------------- */

(function () {
  if (typeof document === 'undefined') return; // in esecuzione sotto node per i test

  // Nomi dei campi in pagina (SPEC §4 "Ti servono") -> chiavi di calcolaImpasto (SPEC §2).
  const MAPPA_CAMPI = {
    panetti: 'n', peso: 'peso', temp: 'temp', ore: 'ore', frigo: 'frigo', idratazione: 'H',
  };

  const TITOLI_TAPPA = {
    impasto: 'Impasto', puntata: 'Fine impastatura e puntata', frigo_dentro: 'In frigo',
    // frigo_fuori non si genera più (SPEC §8.1): la voce resta solo per tollerare
    // sessioni/esperimenti creati col vecchio calendario (SPEC §7 punto 3 del §8).
    frigo_fuori: 'Fuori dal frigo', staglio: 'Staglio', koda: 'Accendi il Koda',
    infornata: 'Infornata',
  };

  /** Titolo della tappa: 'staglio' dipende da frigo (SPEC §8.1), le altre sono fisse. */
  function titoloTappa(tipo, input) {
    if (tipo === 'staglio') {
      return input.frigo > 0 ? 'Fuori dal frigo e staglio a freddo' : 'Staglio';
    }
    return TITOLI_TAPPA[tipo] || tipo;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('[data-form-impasto]');
    if (!form) return;

    const scena = document.getElementById('scena-impasto');

    // I campi di "Regola i tempi" e la data di infornata stanno fuori dal <form>
    // (collegati con form="form-impasto"): si cercano nel documento, non nel form.
    function campoInput(nomeCampo) {
      return document.querySelector(`.cp-input[name="${nomeCampo}"]`);
    }

    function leggiCampo(nomeCampo, fallback) {
      const el = campoInput(nomeCampo);
      if (!el) return fallback !== undefined ? fallback : NaN;
      const v = String(el.value).trim().replace(',', '.');
      if (v === '') return fallback !== undefined ? fallback : NaN;
      return parseFloat(v);
    }

    function leggiScelta(nome, fallback) {
      const el = document.querySelector(`input[name="${nome}"]:checked`);
      return el ? el.value : fallback;
    }

    function marcaErrore(nomeCampo, errato) {
      const el = campoInput(nomeCampo);
      const campo = el && el.closest('.cp-campo');
      if (campo) campo.classList.toggle('is-errato', errato);
    }

    function scriviRisultato(chiave, testo, unita) {
      const el = document.querySelector(`.cp-risultato-valore[data-chiave="${chiave}"]`);
      if (!el) return;
      if (testo === null || testo === undefined) {
        el.textContent = '–';
        return;
      }
      el.textContent = unita ? `${testo} ${unita}` : testo;
    }

    function ricalcola() {
      const tipoLievito = leggiScelta('tipo_lievito', 'fresco');
      const input = {
        n: leggiCampo('panetti'),
        peso: leggiCampo('peso'),
        temp: leggiCampo('temp'),
        ore: leggiCampo('ore'),
        frigo: leggiCampo('frigo'),
        H: leggiCampo('idratazione'),
        tipoLievito,
      };

      const r = calcolaImpasto(input);

      Object.keys(MAPPA_CAMPI).forEach((nomeCampo) => {
        marcaErrore(nomeCampo, Boolean(r.errori[MAPPA_CAMPI[nomeCampo]]));
      });

      // Il valore mostrato dipende dal tipo di lievito scelto (SPEC §7.1).
      const lievitoMostrato = r.valido ? (tipoLievito === 'secco' ? r.lievitoSecco : r.lievito) : null;
      const etichettaLievitoEl = document.querySelector('[data-etichetta-lievito]');
      if (etichettaLievitoEl) {
        etichettaLievitoEl.textContent = `Lievito di birra ${tipoLievito === 'secco' ? 'secco' : 'fresco'}`;
      }

      // Grammi come interi; il lievito a 2 decimali con la virgola (formattazione di pagina).
      scriviRisultato('farina', r.farina !== null ? String(r.farina) : null, 'g');
      scriviRisultato('acqua', r.acqua !== null ? String(r.acqua) : null, 'g');
      scriviRisultato('sale', r.sale !== null ? String(r.sale) : null, 'g');
      scriviRisultato('lievito', lievitoMostrato !== null ? lievitoMostrato.toFixed(2).replace('.', ',') : null, 'g');
      scriviRisultato('w', r.w !== null ? String(r.w) : null, '');

      if (scena) {
        scena.dataset.panetti = Number.isFinite(input.n) ? String(input.n) : '';
        scena.dataset.peso = Number.isFinite(input.peso) ? String(input.peso) : '';
        scena.dataset.temp = Number.isFinite(input.temp) ? String(input.temp) : '';
        scena.dataset.ore = Number.isFinite(input.ore) ? String(input.ore) : '';
        scena.dataset.frigo = Number.isFinite(input.frigo) ? String(input.frigo) : '';
        scena.dataset.lievito = lievitoMostrato !== null ? lievitoMostrato.toFixed(2) : '';
        scena.dataset.valido = r.valido ? '1' : '0';
        scena.dataset.idratazione = Number.isFinite(input.H) ? String(input.H) : '';
        scena.dataset.tipoLievito = tipoLievito;
      }

      aggiornaTimeline(input, r.valido);
    }

    /** Testo dopo il titolo in grassetto di ogni <li> della timeline (dati già validi). */
    function dettaglioTappa(tipo, tappePerTipo, input, cfg) {
      switch (tipo) {
        case 'impasto':
          return 'impasta e copri.';
        case 'puntata': {
          const imp = tappePerTipo.impasto, p = tappePerTipo.puntata;
          const ore = imp && p ? formattaOre((p - imp) / 3600000) : '';
          return `${ore} h a temperatura ambiente.`;
        }
        case 'frigo_dentro':
          return `per ${formattaOre(input.frigo)} h.`;
        case 'frigo_fuori':
          return 'lascia acclimatare.';
        case 'staglio': {
          const st = tappePerTipo.staglio, inf = tappePerTipo.infornata;
          const appretto = st && inf ? formattaOre((inf - st) / 3600000) : '';
          return `appretto ${appretto} h.`;
        }
        case 'koda':
          return `${formattaOre(cfg.kodaPreriscaldoMin / 60)} h di preriscaldo.`;
        case 'infornata':
          return 'pietra a 400–450 °C.';
        default:
          return '';
      }
    }

    function aggiornaTimeline(input, impastoValido) {
      const lista = document.querySelector('.cp-timeline');
      const infornataEl = document.querySelector('[data-infornata]');
      const avvisoEl = document.querySelector('[data-avviso-pianificazione]');
      if (!lista || !infornataEl) return;

      const infornataVal = infornataEl.value;
      const infornata = infornataVal ? new Date(infornataVal) : null;
      if (!impastoValido || !infornata || Number.isNaN(infornata.getTime())) {
        lista.replaceChildren();
        if (avvisoEl) avvisoEl.hidden = true;
        return;
      }

      // I 2 parametri di "Regola i tempi" (SPEC §8.1): letti dal form, non da settings.
      const cfg = {
        ore: input.ore,
        frigo: input.frigo,
        infornata,
        puntataMin: leggiCampo('puntata_min', 0),
        kodaPreriscaldoMin: leggiCampo('koda_preriscaldo_min', 30),
      };

      const { tappe, avviso, errore } = pianifica(cfg);
      if (errore) {
        lista.replaceChildren();
        if (avvisoEl) {
          avvisoEl.textContent = errore;
          avvisoEl.hidden = false;
        }
        return;
      }
      const tappePerTipo = {};
      tappe.forEach((t) => { tappePerTipo[t.tipo] = t.quando; });

      const ora = new Date();
      const prossima = tappe.find((t) => t.quando >= ora);

      lista.replaceChildren(...tappe.map((t) => {
        const li = document.createElement('li');
        li.className = 'cp-tappa' + (t === prossima ? ' is-prossima' : '');
        li.dataset.tipo = t.tipo;

        const iconaSpan = document.createElement('span');
        iconaSpan.className = 'cp-tappa-icona';
        const tpl = document.querySelector(`template[data-tipo-icona="${t.tipo}"]`);
        if (tpl) iconaSpan.appendChild(tpl.content.cloneNode(true));

        const oraSpan = document.createElement('span');
        oraSpan.className = 'cp-tappa-ora';
        oraSpan.textContent = `${t.quando.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' })} `
          + t.quando.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        const testoSpan = document.createElement('span');
        testoSpan.className = 'cp-tappa-testo';
        const forte = document.createElement('strong');
        forte.textContent = titoloTappa(t.tipo, input);
        testoSpan.append(forte, ` — ${dettaglioTappa(t.tipo, tappePerTipo, input, cfg)}`);

        li.append(iconaSpan, oraSpan, testoSpan);
        return li;
      }));

      if (avvisoEl) {
        if (avviso) {
          avvisoEl.textContent = avviso;
          avvisoEl.hidden = false;
        } else {
          avvisoEl.hidden = true;
        }
      }
    }

    // I campi rilevanti non sono tutti dentro <form> (idratazione/panetti/... sì, i tempi
    // e l'infornata no, collegati con form="form-impasto"): si cerca nel documento.
    document.querySelectorAll('.cp-input').forEach((el) => {
      el.addEventListener('input', ricalcola);
    });
    document.querySelectorAll('.cp-scelta input[type="radio"]').forEach((el) => {
      el.addEventListener('change', ricalcola);
    });
    document.querySelectorAll('.cp-stepper').forEach((stepper) => {
      const input = stepper.querySelector('.cp-input');
      const meno = stepper.querySelector('.cp-stepper-meno');
      const piu = stepper.querySelector('.cp-stepper-piu');
      if (!input) return;
      const passo = parseFloat(input.step) || 1;
      const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
      const max = input.max !== '' ? parseFloat(input.max) : Infinity;
      function sposta(verso) {
        const v = parseFloat(String(input.value).replace(',', '.')) || 0;
        input.value = String(Math.min(max, Math.max(min, v + verso * passo)));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (meno) meno.addEventListener('click', () => sposta(-1));
      if (piu) piu.addEventListener('click', () => sposta(1));
    });

    const infornataEl = document.querySelector('[data-infornata]');
    if (infornataEl) infornataEl.addEventListener('input', ricalcola);

    // "Salva ricetta" / "Avvia la sessione": non si invia al server un calcolo non
    // valido, e "Avvia la sessione" richiede l'infornata. Il server rivalida comunque
    // tutto (SPEC §6): questo è solo un accorgimento per non far perdere un giro.
    form.addEventListener('submit', (ev) => {
      const azione = ev.submitter ? ev.submitter.value : '';
      const input = {
        n: leggiCampo('panetti'), peso: leggiCampo('peso'), temp: leggiCampo('temp'),
        ore: leggiCampo('ore'), frigo: leggiCampo('frigo'), H: leggiCampo('idratazione'),
        tipoLievito: leggiScelta('tipo_lievito', 'fresco'),
      };
      const r = calcolaImpasto(input);
      if (!r.valido) {
        ev.preventDefault();
        window.alert('Controlla i valori evidenziati prima di continuare.');
        return;
      }
      if (azione === 'avvia_sessione' && (!infornataEl || !infornataEl.value)) {
        ev.preventDefault();
        window.alert("Imposta data e ora dell'infornata per avviare la sessione.");
      }
    });

    ricalcola();
  });
})();

if (typeof module !== 'undefined') {
  module.exports = { calcolaImpasto, pianifica, pesoLievitoTipo, risincronizza };
}
