# CLAUDE.md — Progetto "Pizzaiolo Amici"

Vedi il piano di sessione per contesto e stadi:
`/home/guido/.claude/plans/voglio-costruire-pizzaiolo-amico-groovy-lollipop.md`.

## Cos'è
PWA statica (niente server, niente PHP/MySQL), dati in IndexedDB nel browser, per condividere
il calcolatore/diario pizza con amici senza accesso al Tailscale di casa. Gemella (non copia) di
`/mnt/dev/pizza`, che resta l'app di casa e non va toccata.

## Stack
- Niente framework, niente build step: pagine HTML statiche una per file.
- IndexedDB nativa, scritta a mano (nessuna libreria: niente idb, niente Dexie).
- Service worker scritto a mano (`sw.js`), cache-first con precache quasi totale.
- Riuso diretto da `/mnt/dev/pizza` (copia, non link): `assets/cartoon.css`, `assets/scena.js`,
  `assets/calcolo.js`, `assets/svg/*`.

## Comandi
- `node test/confronto-formula.js` — verifica `calcolaImpasto()` contro i casi di
  `test/casi-originale.json` (gemello del sito originale del Calcolapizza).
- `python3 -m http.server 8099` — server statico locale per collaudo.

## Convenzioni
- Codice, commenti e interfaccia in italiano.
- Zero dipendenze superflue: nessuna libreria nuova senza chiedere.
- Niente profili/login: un telefono = uno spazio dati.
- Niente assistente AI: nessun backend per tenere una chiave al sicuro.
- Messaggi di commit in italiano.
