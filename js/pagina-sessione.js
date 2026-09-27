'use strict';

/* Pizzaiolo Amici — logica di sessione.html: elenco sessioni aperte (senza ?id)
 * o checklist della sessione (con ?id=N), risincronizzazione (SPEC §8.2) e
 * correzione dell'appretto per temperatura reale allo staglio (SPEC §8.2). */

(function () {
  const db = window.PizzaioloDB;
  const repo = window.PizzaioloRepo;

  const TITOLI_TAPPA = {
    impasto: 'Impasto', puntata: 'Fine impastatura e puntata', frigo_dentro: 'In frigo',
    koda: 'Accendi il Koda', infornata: 'Infornata',
  };
  function titoloTappa(tipo, oreFrigo) {
    if (tipo === 'staglio') return oreFrigo > 0 ? 'Fuori dal frigo e staglio a freddo' : 'Staglio';
    return TITOLI_TAPPA[tipo] || tipo;
  }
  function formattaDataOra(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' })} `
      + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  function formattaOraSemplice(d) {
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  function valoreDatetimeLocale(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let idCorrente = null;

  async function renderElenco() {
    document.getElementById('vista-sessione').hidden = true;
    document.getElementById('vista-elenco').hidden = false;

    const esperimenti = await db.getAll('esperimenti');
    const aperte = [];
    for (const e of esperimenti) {
      const passi = await db.getAllByIndice('passi', 'esperimento_id', e.id);
      const infornata = passi.find((p) => p.tipo === 'infornata');
      if (infornata && !infornata.fatto_il) aperte.push({ esperimento: e, infornata });
    }
    aperte.sort((a, b) => new Date(a.infornata.previsto_il) - new Date(b.infornata.previsto_il));

    const lista = document.getElementById('lista-sessioni-aperte');
    lista.replaceChildren();
    document.getElementById('nessuna-sessione').hidden = aperte.length > 0;

    aperte.forEach(({ esperimento, infornata }) => {
      const li = document.createElement('li');
      li.className = 'cp-lista-voce';
      const a = document.createElement('a');
      a.href = `sessione.html?id=${esperimento.id}`;
      a.textContent = `${esperimento.data} — infornata prevista ${formattaOraSemplice(new Date(infornata.previsto_il))}`;
      li.appendChild(a);
      lista.appendChild(li);
    });
  }

  function aggiornaScenaKoda(passi, esperimento) {
    const koda = passi.find((p) => p.tipo === 'koda');
    const infornata = passi.find((p) => p.tipo === 'infornata');
    const scena = document.getElementById('scena-koda');
    const fineCottura = document.getElementById('fine-cottura');

    if (infornata && infornata.fatto_il) {
      const completata = esperimento.pietra_finale_c != null && esperimento.cottura_secondi != null;
      scena.dataset.fase = completata ? 'fine' : 'cottura';
      scena.dataset.fiamma = 'bassa';
      scena.dataset.pietra = completata ? esperimento.pietra_finale_c : (infornata.temperatura ?? '');
      fineCottura.hidden = completata;
    } else if (koda && koda.fatto_il) {
      scena.dataset.fase = 'preriscaldo';
      scena.dataset.fiamma = 'alta';
      scena.dataset.pietra = koda.temperatura ?? '';
      fineCottura.hidden = true;
    } else {
      scena.dataset.fase = 'preriscaldo';
      scena.dataset.fiamma = 'spenta';
      scena.dataset.pietra = '';
      fineCottura.hidden = true;
    }
  }

  async function mostraAvvisoAppretto(idEsperimento, idPassoStaglio, fattoIl, temperaturaReale, ricetta) {
    const { passi } = await repo.dettaglioEsperimento(idEsperimento);
    const staglio = passi.find((p) => p.id === idPassoStaglio);
    const infornata = passi.find((p) => p.tipo === 'infornata');
    const koda = passi.find((p) => p.tipo === 'koda');
    if (!staglio || !infornata) return;

    const apprettoPrevistoOre = (new Date(infornata.previsto_il) - new Date(staglio.previsto_il)) / 3600000;
    const fattore = (ricetta.temperatura / temperaturaReale) ** (2.5 / 1.2);
    const apprettoStimatoOre = apprettoPrevistoOre * fattore;
    const nuovaInfornata = new Date(new Date(fattoIl).getTime() + apprettoStimatoOre * 3600000);
    const gapKoda = koda ? (new Date(infornata.previsto_il) - new Date(koda.previsto_il)) : 30 * 60000;
    const nuovaKoda = new Date(nuovaInfornata.getTime() - gapKoda);

    const el = document.getElementById('avviso-appretto');
    el.hidden = false;
    el.replaceChildren();
    const testo = document.createElement('span');
    testo.textContent = `Stima dal modello: con ${temperaturaReale} °C invece di ${ricetta.temperatura} °C `
      + `i panetti saranno pronti verso ${formattaOraSemplice(nuovaInfornata)} `
      + `(previsto ${formattaOraSemplice(new Date(infornata.previsto_il))}). Conferma col raddoppio del volume.`;
    const bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'cp-btn cp-btn-secondario mt-2';
    bottone.textContent = 'Sposta accensione e infornata';
    bottone.addEventListener('click', async () => {
      await db.put('passi', { ...infornata, previsto_il: nuovaInfornata.toISOString() });
      if (koda) await db.put('passi', { ...koda, previsto_il: nuovaKoda.toISOString() });
      el.hidden = true;
      renderSessione(idEsperimento);
    });
    el.append(testo, document.createElement('br'), bottone);
  }

  async function segnaFatta(idEsperimento, passo, oraValore, tempValore, ricetta) {
    const fattoIl = oraValore ? new Date(oraValore).toISOString() : new Date().toISOString();
    const temperatura = tempValore !== '' && tempValore !== null ? parseFloat(tempValore) : null;
    await repo.segnaTappaFatta(idEsperimento, passo.id, fattoIl, temperatura);
    await renderSessione(idEsperimento); // resetta anche avviso-appretto.hidden: va rifatto DOPO

    if (passo.tipo === 'staglio' && temperatura !== null && ricetta.temperatura != null
        && Math.abs(temperatura - ricetta.temperatura) >= 1) {
      await mostraAvvisoAppretto(idEsperimento, passo.id, fattoIl, temperatura, ricetta);
    }
  }

  async function renderSessione(id) {
    const dettaglio = await repo.dettaglioEsperimento(id);
    if (!dettaglio) {
      document.getElementById('vista-sessione').hidden = true;
      document.getElementById('vista-elenco').hidden = false;
      return;
    }
    idCorrente = id;
    const { esperimento, ricetta, passi } = dettaglio;
    document.getElementById('vista-elenco').hidden = true;
    document.getElementById('vista-sessione').hidden = false;
    document.getElementById('avviso-appretto').hidden = true;

    document.getElementById('titolo-sessione').textContent = `Sessione — ${esperimento.data}`;
    document.getElementById('riepilogo-ricetta').textContent =
      `${ricetta.panetti} panetti da ${ricetta.peso_panetto} g · idratazione ${ricetta.idratazione}% · ${ricetta.temperatura} °C`;

    const lista = document.getElementById('lista-passi');
    lista.replaceChildren();
    const primaNonFatta = passi.find((p) => !p.fatto_il);

    passi.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'cp-passo' + (p.fatto_il ? ' is-fatta' : '') + (p === primaNonFatta ? ' is-prossima' : '');
      li.dataset.tipo = p.tipo;

      const titolo = document.createElement('div');
      titolo.className = 'cp-passo-titolo';
      titolo.textContent = titoloTappa(p.tipo, ricetta.ore_frigo);

      const previsto = document.createElement('div');
      previsto.className = 'cp-passo-previsto';
      previsto.textContent = 'Previsto: ' + formattaDataOra(p.previsto_il);

      li.append(titolo, previsto);

      if (p.fatto_il) {
        const fatto = document.createElement('div');
        fatto.className = 'cp-passo-fatto';
        fatto.textContent = 'Fatto alle ' + formattaDataOra(p.fatto_il)
          + (p.temperatura !== null && p.temperatura !== undefined ? ` · ${p.temperatura} °C` : '');
        li.appendChild(fatto);
      } else {
        const campi = document.createElement('div');
        campi.className = 'cp-passo-campi row g-2';

        const colOra = document.createElement('div');
        colOra.className = 'col-6';
        const campoOra = document.createElement('div');
        campoOra.className = 'cp-campo';
        const labelOra = document.createElement('label');
        labelOra.textContent = 'Ora reale';
        const inputOra = document.createElement('input');
        inputOra.type = 'datetime-local';
        inputOra.className = 'cp-input';
        inputOra.value = valoreDatetimeLocale(new Date());
        campoOra.append(labelOra, inputOra);
        colOra.appendChild(campoOra);

        const colTemp = document.createElement('div');
        colTemp.className = 'col-6';
        const campoTemp = document.createElement('div');
        campoTemp.className = 'cp-campo';
        const labelTemp = document.createElement('label');
        labelTemp.textContent = (p.tipo === 'koda' || p.tipo === 'infornata') ? 'Temperatura pietra (°C)' : 'Temperatura (°C)';
        const inputTemp = document.createElement('input');
        inputTemp.type = 'number';
        inputTemp.step = '0.5';
        inputTemp.className = 'cp-input';
        campoTemp.append(labelTemp, inputTemp);
        colTemp.appendChild(campoTemp);

        campi.append(colOra, colTemp);

        const bottone = document.createElement('button');
        bottone.type = 'button';
        bottone.className = 'cp-btn cp-btn-primario';
        bottone.textContent = 'Fatto';
        bottone.addEventListener('click', () => segnaFatta(id, p, inputOra.value, inputTemp.value, ricetta));

        li.append(campi, bottone);
      }

      lista.appendChild(li);
    });

    aggiornaScenaKoda(passi, esperimento);
  }

  document.getElementById('b-fine-sessione') && document.getElementById('b-fine-sessione').addEventListener('click', async () => {
    if (!idCorrente) return;
    const pietra = parseFloat(document.getElementById('s-pietra-finale').value);
    const secondi = parseInt(document.getElementById('s-secondi').value, 10);
    const esperimento = await db.get('esperimenti', idCorrente);
    esperimento.pietra_finale_c = Number.isFinite(pietra) ? pietra : null;
    esperimento.cottura_secondi = Number.isFinite(secondi) ? secondi : null;
    await db.put('esperimenti', esperimento);
    await renderSessione(idCorrente);
    const msg = document.getElementById('msg-sessione');
    msg.textContent = 'Sessione completata. La trovi nel diario.';
    msg.hidden = false;
    msg.classList.add('is-ok');
  });

  document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id') ? Number(params.get('id')) : null;
    if (id) {
      await renderSessione(id);
    } else {
      await renderElenco();
    }
  });
})();
