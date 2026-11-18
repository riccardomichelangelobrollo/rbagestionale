# Istruzioni per Claude — gestionale dello studio Riccardo Brollo Architetto

Questo file serve a riprendere il lavoro in una nuova conversazione. Caricalo insieme alla cartella (o al suo zip) e chiedi a Claude di leggerlo prima di tutto.

## Chi e che cosa

- **Utente:** Riccardo Brollo, architetto. Sito: www.riccardobrolloarchitetto.it (dominio registrato su **Aruba**). Lavora insieme allo studio di famiglia (Arch. Giuseppe "Peppo" Brollo, Cesate MI): pratiche edilizie (CILA, SCIA, PdC, sanatorie), direzione lavori, coordinamento sicurezza, parcelle.
- **Obiettivo:** un gestionale web dello studio, all'indirizzo **gestionale.riccardobrolloarchitetto.it**, usato da **più persone dello studio**, dal computer e dal telefono.
- **Preferenze di Riccardo:** dare del tu; risposte in italiano, chiare, non impersonali; grafica sobria come il suo sito: **Inter** per testo e comandi, **Times New Roman** per titoli e nomi dei progetti, etichette in minuscolo, bianco e nero con **colori pastello** usati con un senso logico.

## Storia del progetto

1. Prima versione: un'app "cose da fare" pubblicata come artifact su claude.ai (file in `extra/cose-da-fare.html`), con sincronizzazione tramite il database degli artifact. Ha un pulsante **copia backup** che esporta tutto in JSON.
2. Seconda versione (questa cartella): gestionale autonomo, perché un artifact di Claude non può stare su un dominio proprio. I dati dell'app "cose da fare" si importano dalla sezione **studio → incolla il backup**.

## Architettura

- **Front-end statico**, senza compilazione: `index.html` + `app.js` (JavaScript puro, IIFE) + `style.css` + `config.js`. Libreria `@supabase/supabase-js@2.119.0` da jsDelivr (build UMD, `window.supabase`).
- **Pubblicazione:** GitHub Pages da un repository pubblico, ramo `main`, cartella radice. File `CNAME` con il sottodominio, `.nojekyll`.
- **DNS:** su Aruba, record CNAME `gestionale` → `<utente-github>.github.io`.
- **Dati e accesso:** Supabase (piano gratuito, regione Francoforte). Accesso con email e password (`signInWithPassword` / `signUp`; "Confirm email" disattivato). Aggiornamenti in tempo reale con `postgres_changes` sul canale `gestionale`.
- **Tieni sveglio:** `.github/workflows/tieni-sveglio-supabase.yml` interroga il database ogni 3 giorni (il piano gratuito mette in pausa dopo 7 giorni di scarsa attività).

## Database (`supabase/schema.sql`, idempotente)

| Tabella | Campi principali |
|---|---|
| `membri` | email (minuscolo, unica), nome, ruolo `admin`/`membro`, attivo |
| `clienti` | nome, codice_fiscale (CF o P.IVA), email, telefono, indirizzo, note |
| `progetti` | nome, cliente_id → clienti, comune, indirizzo, stato `attivo`/`in pausa`/`chiuso`, note |
| `pratiche` | progetto_id → progetti (cascade), tipo (testo libero con suggerimenti), comune, protocollo, data_deposito, scadenza, stato `in preparazione`/`depositata`/`integrazioni richieste`/`conclusa`, note |
| `attivita` | titolo, progetto_id, categoria `pa`/`can`/`prog`/`cli`/`amm`/`stu`, scadenza, ogni_giorno, fatta, fatta_il, fatta_oggi (per le attività quotidiane), in_oggi (giorno in cui è stata messa in programma), attesa_chi, attesa_cosa, note, assegnata_a → membri, creata_da → membri |

Tutte le tabelle hanno `id uuid`, `created_at` e `updated_at` (aggiornato da trigger). Gli id sono generati dal client (`crypto.randomUUID`) per poter salvare in modo ottimistico con `upsert`.

**Permessi (RLS):** funzioni `mia_email()` (dal JWT), `is_membro()` e `is_admin()` (security definer). Tutti i membri attivi leggono e scrivono clienti, progetti, pratiche e attività; solo gli admin scrivono `membri`. Chi si registra senza essere in `membri` entra ma non vede nulla: l'app gli mostra un messaggio. Lo schema è stato provato su PostgreSQL 16 con utenti simulati (admin, membro, estraneo).

## Funzionamento dell'app (`app.js`)

- Al login carica tutte le tabelle in memoria (`D[tabella]` = Map), poi le tiene aggiornate in tempo reale; rilegge tutto quando la pagina torna in primo piano.
- Rotte sull'hash: `#oggi`, `#settimana`, `#progetti`, `#progetto/<id>`, `#attesa`, `#pratiche`, `#clienti`, `#fatte`, `#studio`.
- Selettore **le mie / tutto lo studio** (in localStorage): "le mie" = assegnate a me o non assegnate.
- **Logica delle categorie e dei colori:** azzurro carta = pratiche e P.A.; giallo cantiere smorzato = cantiere e sicurezza; verde salvia = progetto e disegno; pesca = clienti e sopralluoghi; rosa cipria = parcelle e amministrazione; lilla = studio e personale. **Tratteggio grigio** = in attesa di altri (come la campitura di ciò che non è ancora definito in una tavola). Rosso scuro `#B3261E` solo per scaduto e "integrazioni richieste".
- Le pratiche compaiono in "oggi" e "prossimi 7 giorni" quando hanno una scadenza, e in "in attesa" quando sono depositate.
- Moduli in finestre a scomparsa (`sheetAttivita`, `sheetProgetto`, `sheetPratica`, `sheetCliente`, `sheetMembro`, `sheetImport`); eliminazione con doppia pressione, mai `confirm()`.
- Importazione dal backup dell'app "cose da fare": `kind: project` → progetti; `kind: task` → attivita (cat→categoria, due→scadenza, daily→ogni_giorno, done/doneAt, doneOn→fatta_oggi, plannedFor→in_oggi, waitWho/waitWhat→attesa_chi/attesa_cosa).

## Stato al 18 novembre 2026

- Codice completo e provato in locale con un database simulato (accesso, progetto con nuovo cliente, pratica, attività assegnata a un collega, importazione del backup, tutte le viste, telefono e computer): nessun errore.
- **Supabase configurato (18 novembre 2026):** organizzazione "Riccardo Brollo Architetto" (piano Free), progetto `gestionale-studio`, ref `oubxjaspvsapvcaspofg`, regione Francoforte (`eu-central-1`). Eseguito `schema.sql` con primo amministratore `studio@riccardobrolloarchitetto.it`. Auth: conferma email disattivata (`mailer_autoconfirm`), Site URL `https://gestionale.riccardobrolloarchitetto.it`, redirect consentiti anche per `https://riccardomichelangelobrollo.github.io/rbagestionale/**`. `config.js` compilato con la chiave *publishable*. Permessi verificati simulando admin, estraneo e anonimo.
- `schema.sql` ora concede esplicitamente i privilegi sulle tabelle (`grant ... to authenticated`, `select` su `membri` ad `anon` per il workflow "tieni sveglio"), perché i progetti Supabase recenti possono non aprire più le tabelle all'API in automatico.
- **Ancora da fare:** repository GitHub `riccardomichelangelobrollo/rbagestionale` (pubblico, separato da quello del sito) con Pages e dominio personalizzato; record CNAME `gestionale` → `riccardomichelangelobrollo.github.io` su Aruba; primo accesso con "primo accesso: crea la password"; importazione del backup.

## Sviluppi possibili, nell'ordine in cui li proporrei

1. **Parcelle e pagamenti** per progetto: preventivo, onorario, acconti, fatture emesse, incassi; riepilogo degli importi da incassare.
2. **Ore** per progetto e per persona.
3. SMTP di Aruba in Supabase per rendere affidabile il recupero password.
4. Allegati (Supabase Storage) e collegamento a cartelle di progetto.
5. Esportazione CSV dei dati dall'app.

Regola per chi modifica: mantenere un solo `app.js` senza compilazione, aggiornare `schema.sql` in modo idempotente (`if not exists`, `drop policy if exists`) e annotare qui le modifiche.

## Grafica e funzioni aggiunte (ramo `proposta-grafica`, 18/11/2026)

- Stile ripreso da riccardobrolloarchitetto.it: bianco e nero, accento `#ff4f00` solo per ciò che scotta, angoli vivi, linee 1px. Logo spirale + R B A in Jost (font e `img/spirale.png` copiati dal sito). Inter per tutto, IBM Plex Mono per etichette/numeri, Times solo nelle note dei progetti. Regole in testa a `style.css`.
- Barra laterale: "da fare" (oggi, mappa, prossimi 7 giorni, in attesa di altri, completate), "anagrafiche" (progetti, pratiche edilizie, clienti), "impostazioni" (persone e accessi). Ogni voce ha una riga di spiegazione. Telefono: barra in basso oggi · mappa · progetti · pratiche · altro.
- **oggi**: riepilogo a blocchi; colonna "da sistemare" (le attività scritte al mattino, riordinabili) e **timeline** 07:00–21:00 a mezz'ore. Trascinamento con mouse o con il dito sulla maniglia puntinata (`draggable`, `onDrop`). Campi `ora_oggi` (HH:MM, valido solo se `in_oggi` = oggi) e `ordine`.
- **mappa**: foglio quadrettato con un riquadro per progetto e cartiglio; le attività sono blocchi colorati per categoria, grandi secondo la **priorità** (`priorita`: bassa/media/alta). Clic sull'etichetta di priorità per cambiarla, trascinamento su un altro progetto per spostarla.
- `schema.sql` aggiornato con `priorita`, `ora_oggi`, `ordine` (già eseguito sul database).

### Revisione successiva (stessa giornata)
- Maiuscola iniziale ovunque: `capAll()` passa sul DOM dopo ogni render e apertura di scheda (selettori in `CAP_SEL`), `cap()` per i messaggi.
- Times di nuovo per nomi propri e racconto (progetti, clienti, data del giorno, note, liste vuote); Inter per l'interfaccia.
- Attività con lo sfondo pastello della categoria su tutta la riga (non più striscia laterale). Pratiche come schede-documento (`rowPratica`, classe `.prat`, con data di scadenza grande a destra), separate dalle attività.
- Niente numerazioni decorative (tolte da barra laterale, progetti, mappa).
- Mappa ripensata: piano caldo, progetti come quadrati neri, attività come etichette sfumate (`.mp`) collegate con linee tratteggiate curve (SVG); grandezza = priorità; disposizione automatica con eliminazione delle sovrapposizioni; trascinamento libero (posizioni salvate nel browser, `localStorage` `gest-mappa`), lasciando un'attività sul quadrato di un altro progetto la si sposta lì.
