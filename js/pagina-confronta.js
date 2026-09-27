'use strict';

/* Pizzaiolo Amici — confronto affiancato di due esperimenti (confronta.php).
 * Markup ricalcato da design/confronta.html. Sola lettura: nessuna scrittura. */

(function () {
  const db = window.PizzaioloDB;
  const repo = window.PizzaioloRepo;

  function formattaDataEstesa(data) {
    if (!data) return '';
    const d = new Date(`${data}T12:00:00`);
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function creaColonna(id, dettaglio, foto) {
    const col = document.createElement('div');
    col.className = 'cp-confronto-col';
    const a = document.createElement('a');
    a.href = `esperimento.html?id=${id}`;
    const img = document.createElement('img');
    img.alt = `Esperimento ${id}, foto dall'alto`;
    if (foto) {
      img.src = URL.createObjectURL(foto.blob);
      img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
    } else {
      img.src = 'assets/svg/pizza.svg';
    }
    a.appendChild(img);
    const h2 = document.createElement('h2');
    h2.textContent = `#${id}`;
    const p = document.createElement('p');
    p.textContent = formattaDataEstesa(dettaglio.esperimento.data);
    col.append(a, h2, p);
    return col;
  }

  // `diversi`, se passato esplicitamente, sostituisce il confronto testuale di
  // default: necessario per i voti, il cui contenuto è un'icona (cp-voto) senza testo,
  // quindi confrontare il textContent non distinguerebbe mai due valori differenti.
  function riga(etichetta, contenutoA, contenutoB, diversi) {
    const div = document.createElement('div');
    div.className = 'cp-confronto-riga';
    const et = document.createElement('span');
    et.textContent = etichetta;
    const a = document.createElement('span');
    const b = document.createElement('span');
    const metti = (span, contenuto) => {
      if (contenuto instanceof Node) span.appendChild(contenuto);
      else span.textContent = contenuto;
    };
    metti(a, contenutoA);
    metti(b, contenutoB);
    if (diversi !== undefined ? diversi : a.textContent !== b.textContent) div.classList.add('is-diversa');
    div.append(et, a, b);
    return div;
  }

  function votoSpan(valore) {
    const span = document.createElement('span');
    span.className = 'cp-voto';
    span.dataset.voto = String(valore || 0);
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', valore ? `${valore} su 5` : 'non votato');
    return span;
  }

  function sottotitolo(testo) {
    const h3 = document.createElement('h3');
    h3.className = 'cp-sottotitolo';
    h3.textContent = testo;
    return h3;
  }

  function lievitoMostrato(ricetta) {
    const g = ricetta.tipo_lievito === 'secco' ? pesoLievitoTipo(ricetta.lievito_g, 'secco') : ricetta.lievito_g;
    return g.toFixed(2).replace('.', ',');
  }

  async function render() {
    const params = new URLSearchParams(location.search);
    const idA = Number(params.get('a'));
    const idB = Number(params.get('b'));
    const corpo = document.getElementById('corpo-confronto');

    if (!idA || !idB) {
      corpo.replaceChildren();
      const p = document.createElement('p');
      p.className = 'cp-nota';
      p.textContent = 'Mancano due esperimenti da confrontare: apri il confronto da un esperimento nel diario.';
      corpo.appendChild(p);
      document.getElementById('b-scambia').hidden = true;
      return;
    }

    const [dettA, dettB] = await Promise.all([repo.dettaglioEsperimento(idA), repo.dettaglioEsperimento(idB)]);
    if (!dettA || !dettB) {
      corpo.replaceChildren();
      const p = document.createElement('p');
      p.className = 'cp-nota';
      p.textContent = 'Uno dei due esperimenti non esiste (più).';
      corpo.appendChild(p);
      document.getElementById('b-scambia').hidden = true;
      return;
    }

    const fotoCopertina = (foto) => foto.find((f) => f.tipo === 'sopra') || foto[0] || null;

    corpo.replaceChildren(
      creaColonna(idA, dettA, fotoCopertina(dettA.foto)),
      creaColonna(idB, dettB, fotoCopertina(dettB.foto)),
      sottotitolo('Ricetta'),
      riga('Farina', dettA.farina ? dettA.farina.nome : 'senza farina', dettB.farina ? dettB.farina.nome : 'senza farina'),
      riga('Panetti', `${dettA.ricetta.panetti} × ${dettA.ricetta.peso_panetto} g`, `${dettB.ricetta.panetti} × ${dettB.ricetta.peso_panetto} g`),
      riga('Temperatura', `${dettA.ricetta.temperatura} °C`, `${dettB.ricetta.temperatura} °C`),
      riga('Ore totali', `${dettA.ricetta.ore_totali} h`, `${dettB.ricetta.ore_totali} h`),
      riga('Ore in frigo', `${dettA.ricetta.ore_frigo} h`, `${dettB.ricetta.ore_frigo} h`),
      riga('Lievito', `${lievitoMostrato(dettA.ricetta)} g`, `${lievitoMostrato(dettB.ricetta)} g`),
      riga('Variabile cambiata', dettA.esperimento.variabile_cambiata || '–', dettB.esperimento.variabile_cambiata || '–'),

      sottotitolo('Cottura'),
      riga('Pietra', dettA.esperimento.pietra_finale_c != null ? `${dettA.esperimento.pietra_finale_c} °C` : '–',
        dettB.esperimento.pietra_finale_c != null ? `${dettB.esperimento.pietra_finale_c} °C` : '–'),
      riga('Secondi', dettA.esperimento.cottura_secondi != null ? `${dettA.esperimento.cottura_secondi} s` : '–',
        dettB.esperimento.cottura_secondi != null ? `${dettB.esperimento.cottura_secondi} s` : '–'),

      sottotitolo('Voti'),
      ...Object.entries({
        cornicione: 'Cornicione', leopardatura: 'Leopardatura', sottopizza: 'Sottopizza',
        estensibilita: 'Estensibilità', digeribilita: 'Digeribilità',
      }).map(([campo, etichetta]) => {
        const vA = dettA.esperimento[`voto_${campo}`] || 0;
        const vB = dettB.esperimento[`voto_${campo}`] || 0;
        return riga(etichetta, votoSpan(vA), votoSpan(vB), vA !== vB);
      }),
    );

    document.getElementById('b-scambia').href = `confronta.html?a=${idB}&b=${idA}`;
    document.getElementById('b-scambia').hidden = false;
    document.title = `Confronto #${idA}/#${idB} — Pizzaiolo Amici`;
  }

  document.addEventListener('DOMContentLoaded', render);
})();
