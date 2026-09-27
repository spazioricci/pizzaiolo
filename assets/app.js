'use strict';

/*
 * Comportamento delle pagine diverse dal calcolatore (SPEC §6.4): stepper generici,
 * anteprima della foto caricata, conferma prima delle azioni distruttive.
 * Il calcolatore ha la sua logica dedicata in assets/calcolo.js.
 */
(function () {
  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', () => {
    // Stepper generico: incrementa/decrementa l'input dentro un .cp-stepper.
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
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (meno) meno.addEventListener('click', () => sposta(-1));
      if (piu) piu.addEventListener('click', () => sposta(1));
    });

    // Ridimensiona una foto nel browser prima di caricarla (le foto del telefono possono
    // superare il limite del server, 2 MB): lato massimo 1600px, JPEG qualità 0.85, come fa
    // già il server con GD (includes/Foto.php) — qui serve solo a restare sotto il limite
    // PRIMA dell'invio. Ruota secondo l'EXIF (imageOrientation:'from-image'), quindi il file
    // risultante non ha più bisogno di rotazione. Se qualcosa non è supportato dal browser,
    // o il risultato non è più piccolo dell'originale, si tiene il file originale: il server
    // resta comunque l'ultima parola (mostra un errore se davvero troppo grande).
    async function ridimensionaFoto(file, latoMax, qualita) {
      if (!file || file.type.indexOf('image/') !== 0 || typeof createImageBitmap !== 'function') {
        return file;
      }
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const scala = Math.min(1, latoMax / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scala));
        const h = Math.max(1, Math.round(bitmap.height * scala));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
        bitmap.close();
        const blob = await new Promise((risolvi) => canvas.toBlob(risolvi, 'image/jpeg', qualita));
        if (!blob || blob.size >= file.size) return file;
        const nome = (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg';
        return new File([blob], nome, { type: 'image/jpeg' });
      } catch (e) {
        return file;
      }
    }

    // Anteprima della foto scelta in un input file dentro .cp-foto-carica; la ridimensiona
    // prima e sostituisce il file dell'input, così quel che si vede è quel che verrà inviato.
    document.querySelectorAll('.cp-foto-carica input[type="file"]').forEach((input) => {
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        const contenitore = input.closest('.cp-foto-carica');
        if (!contenitore) return;
        let anteprima = contenitore.querySelector('img.cp-foto-anteprima');
        if (!file) {
          if (anteprima) anteprima.remove();
          return;
        }
        const bottone = contenitore.querySelector('button[type="submit"]')
          || contenitore.closest('form')?.querySelector('button[type="submit"]');
        if (bottone) bottone.disabled = true;

        const fileRidotto = await ridimensionaFoto(file, 1600, 0.85);
        if (fileRidotto !== file) {
          const trasferimento = new DataTransfer();
          trasferimento.items.add(fileRidotto);
          input.files = trasferimento.files;
        }
        if (bottone) bottone.disabled = false;

        if (!anteprima) {
          anteprima = document.createElement('img');
          anteprima.className = 'cp-foto-anteprima';
          anteprima.alt = 'Anteprima';
          contenitore.appendChild(anteprima);
        }
        const url = URL.createObjectURL(fileRidotto);
        anteprima.src = url;
        anteprima.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
      });
    });

    // Catalogo farine (farine.php, SPEC §7 punto 3): sceglierne una precompila il form.
    // window.CATALOGO_FARINE è scritto inline da farine.php solo se il catalogo esiste ed
    // è leggibile; senza, il select stesso non è in pagina.
    const selCatalogo = document.getElementById('f-catalogo');
    if (selCatalogo && Array.isArray(window.CATALOGO_FARINE)) {
      selCatalogo.addEventListener('change', () => {
        if (selCatalogo.value === '') return;
        const voce = window.CATALOGO_FARINE[Number(selCatalogo.value)];
        if (!voce) return;
        const campo = (id) => document.getElementById(id);
        if (campo('f-nome')) campo('f-nome').value = voce.nome || '';
        if (campo('f-marca')) campo('f-marca').value = voce.marca || '';
        // W: il campo accetta anche un intervallo testuale (es. "260-280"), quindi quando il
        // produttore non dà un numero singolo (w_testo, es. Caputo) ci va comunque il testo.
        if (campo('f-w')) {
          campo('f-w').value = voce.w !== null && voce.w !== undefined ? voce.w
            : (voce.w_testo || '');
        }
        if (campo('f-proteine')) {
          campo('f-proteine').value = voce.proteine !== null && voce.proteine !== undefined ? voce.proteine : '';
        }
        // Proteine non dichiarate come numero singolo dal produttore (proteine_testo, es. un
        // intervallo o "12 g/100g"): il campo proteine resta solo numerico, va nelle note.
        let note = voce.note || '';
        if ((voce.proteine === null || voce.proteine === undefined) && voce.proteine_testo) {
          note += (note ? '\n' : '') + 'Proteine: ' + voce.proteine_testo;
        }
        if (campo('f-note')) campo('f-note').value = note;
        if (campo('f-fonte')) campo('f-fonte').value = voce.fonte || '';
      });
    }

    // Conferma prima di inviare un form/cliccare un pulsante con data-conferma="testo".
    document.querySelectorAll('form[data-conferma]').forEach((form) => {
      form.addEventListener('submit', (ev) => {
        if (!window.confirm(form.dataset.conferma)) {
          ev.preventDefault();
        }
      });
    });
    document.querySelectorAll('[data-conferma]:not(form)').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (!window.confirm(el.dataset.conferma)) {
          ev.preventDefault();
        }
      });
    });

    // Foto del diario (link ".cp-foto-apri" al file originale): invece di navigare al file,
    // che sul telefono viene trattato come un download, la apre grande in un popup interno.
    // Senza JS il link resta un href normale al file (funziona comunque, apre il file).
    const linkFoto = document.querySelectorAll('a.cp-foto-apri');
    if (linkFoto.length) {
      const lightbox = document.createElement('div');
      lightbox.className = 'cp-lightbox';
      lightbox.hidden = true;
      lightbox.innerHTML = '<button type="button" class="cp-lightbox-chiudi" aria-label="Chiudi">&times;</button><img alt="">';
      document.body.appendChild(lightbox);
      const imgLightbox = lightbox.querySelector('img');

      function apriLightbox(href, alt) {
        imgLightbox.src = href;
        imgLightbox.alt = alt || '';
        lightbox.hidden = false;
        document.body.classList.add('cp-lightbox-aperta');
      }
      function chiudiLightbox() {
        lightbox.hidden = true;
        imgLightbox.src = '';
        document.body.classList.remove('cp-lightbox-aperta');
      }
      linkFoto.forEach((a) => {
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          const img = a.querySelector('img');
          apriLightbox(a.href, img ? img.alt : '');
        });
      });
      lightbox.addEventListener('click', (ev) => {
        if (ev.target === lightbox || ev.target.closest('.cp-lightbox-chiudi')) chiudiLightbox();
      });
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !lightbox.hidden) chiudiLightbox();
      });
    }
  });
})();
