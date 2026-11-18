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
| `attivita` | titolo, progetto_id, categoria `pa`/`can`/`cont`/`prog`/`cli`/`amm`/`stu`, scadenza, ogni_giorno, fatta, fatta_il, fatta_oggi (per le attività quotidiane), in_oggi (giorno in cui è stata messa in programma), attesa_chi, attesa_cosa, note, assegnata_a → membri, creata_da → membri |

Tutte le tabelle hanno `id uuid`, `created_at` e `updated_at` (aggiornato da trigger). Gli id sono generati dal client (`crypto.randomUUID`) per poter salvare in modo ottimistico con `upsert`.

**Permessi (RLS):** funzioni `mia_email()` (dal JWT), `is_membro()` e `is_admin()` (security definer). Tutti i membri attivi leggono e scrivono clienti, progetti, pratiche e attività; solo gli admin scrivono `membri`. Chi si registra senza essere in `membri` entra ma non vede nulla: l'app gli mostra un messaggio. Lo schema è stato provato su PostgreSQL 16 con utenti simulati (admin, membro, estraneo).

## Funzionamento dell'app (`app.js`)

- Al login carica tutte le tabelle in memoria (`D[tabella]` = Map), poi le tiene aggiornate in tempo reale; rilegge tutto quando la pagina torna in primo piano.
- Rotte sull'hash: `#oggi`, `#settimana`, `#progetti`, `#progetto/<id>`, `#attesa`, `#pratiche`, `#clienti`, `#fatte`, `#studio`.
- Vista unica per tutto lo studio (il selettore "le mie / tutto lo studio" è stato tolto il 18/11/2026): tutti vedono tutte le attività; le iniziali dicono chi le segue.
- **Logica delle categorie e dei colori:** azzurro carta = pratiche e P.A.; giallo cantiere smorzato = cantiere e sicurezza; terra = contabilità di cantiere; verde salvia = progetto e disegno; pesca = clienti e sopralluoghi; rosa cipria = parcelle e amministrazione; lilla = studio e personale. **Tratteggio grigio** = in attesa di altri (come la campitura di ciò che non è ancora definito in una tavola). Rosso scuro `#B3261E` solo per scaduto e "integrazioni richieste".
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

### Revisione 3: scrivania a cartelle
- **Syne** sostituisce il Times (titoli, nomi, numeri grandi; variabile `--display`). Stile più morbido: angoli 6–14px, fondo carta `#fbf8f5`, ombre piene corte sugli elementi toccabili. Tolte le diagonali dal riepilogo.
- **Home = Scrivania** (`#scrivania`, `vScrivania`): tre ripiani di cartelle (`folder()`):
  - "La giornata": Oggi, Prossimi 7 giorni, In attesa di altri, Pratiche edilizie;
  - "Progetti in corso": una cartella per progetto attivo, più "Nuovo progetto";
  - "Studio": Studio e generali (attività senza progetto, `vGenerali`), In pausa, Completate.
  Una cartella aperta (`#scrivania/<vista>` o `#scrivania/progetto/<id>`) si sovrappone alla scrivania (`deskOverlay`), la barra laterale resta. Si chiude con "Chiudi", con Esc o con un clic fuori. I link ai progetti aprono la cartella del progetto.
- **Mappa solo da guardare** su fondo neutro: passando sopra un progetto o un'attività si evidenzia il gruppo; tasto destro (sul telefono: tieni premuto) apre `ctxMenu` con priorità, tipo, "metti in programma oggi", "segna come fatta", "modifica tutti i dettagli". Niente più trascinamento sulla mappa.
- Attenzione ai nomi di classe già usati: `.pill` (stato), `.ghost` (copia durante il trascinamento). Per questo le etichette della mappa sono `.mp` e la cartella tratteggiata è `.fd-new`.

### Revisione 4: scrivania minimale
- Syne tolto. **Times New Roman grassetto solo per i titoli** (`--title`: pagine, sezioni, cartelle, schede, progetti sulla mappa); tutto il resto Inter, etichette in Plex Mono.
- **Barra laterale nascosta**: si apre con la freccia in alto a sinistra (`setNav`), si chiude con la freccia, un clic fuori o scegliendo una voce. Contiene: Scrivania, Mappa, Calendario; anagrafiche (progetti, pratiche, clienti); persone e accessi. Niente più barra in basso sul telefono.
- **Scrivania** = home: solo le cartelle (più piccole), testata minima con logo e data piccola a destra; `+` accanto a "Progetti in corso" crea un progetto. Le cartelle aperte hanno i pulsanti "+ Attività", "+ Pratica", "Modifica" secondo il contenuto.
- **Mappa** a tutta pagina, solo visualizzazione: attività disposte a cerchi intorno al progetto per priorità (alta vicina, bassa lontana); legenda fissa in basso; tasto destro / pressione lunga per modificare.
- **Calendario** (`#calendario`, `vCalendario`): mese con le scadenze di attività e pratiche, clic su un giorno per creare un'attività con quella scadenza; "Scarica le scadenze (.ics)" (`scaricaIcs`) per Google/Apple/Outlook. Prossimo passo possibile: feed .ics sempre aggiornato tramite una Edge Function di Supabase con un indirizzo segreto per persona.

### Revisione 5: pulizia (regole in testa a `style.css`, riscritto da zero)
- Solo due caratteri: **Times New Roman grassetto per i titoli**, **Inter per i testi** (unica eccezione il logo R B A in Jost). Plex Mono e Syne tolti.
- **Colori con gerarchia**: il tipo di attività dà il colore (`--c` tenue, `--cs` pieno, `--ci` inchiostro, via `catStyle`); la priorità dà il riempimento: alta = pieno, media = tenue, bassa = solo contorno. Tratteggio = in attesa. Arancio del sito = scaduto e puntatore.
- **Puntatore** a pallino arancio come sul sito (`.cur`, si ingrandisce su ciò che si può cliccare).
- **Menu**: linguetta "Menu" al centro del bordo sinistro (`.menu-strip`); un clic fa uscire la barra, che si chiude con la X. Margini della pagina sul bordo (nessuna larghezza massima).
- **Scrivania** centrata nello schermo; "Oggi" è la cartella nera. Regola unica per ogni cartella: numero = quante cose contiene; riga in grassetto = cosa scotta (solo se c'è); elenco = le prime cose dentro; piede = la scadenza più vicina; pallino arancio = qualcosa è scaduto.
- **Cartelle aperte**: pulsanti "+ Attività", "+ Pratica"; nei progetti i dati (cliente, comune, ecc.) stanno dietro "Dati del progetto". Ogni chiusura è una X (anche nelle schede: tolto "annulla").
- **Mappa**: disposizione organica (molle verso il progetto secondo la priorità, repulsione, gravità verso il centro, poi nessuna sovrapposizione e centratura nel foglio). Filtro per priorità in alto (caselle Alta/Media/Bassa, ricordate nel browser).
- **Mappa, cerchi dei progetti**: ogni progetto ha un cerchio di sfondo nel colore della sua cartella sulla scrivania (`.ring`); i cerchi non si sovrappongono (si sposta l'intero gruppo) e ogni attività sta nel proprio. Sugli schermi stretti i progetti vanno in colonna e la mappa si riduce in proporzione (`--sc`).
- **Mappa navigabile**: trascina col tasto sinistro (o un dito) per spostarti, rotellina (o due dita) per ingrandire; pulsanti +, − e "Tutto" in basso a destra. Lo stato della vista resta finché non cambiano filtri o gruppi (`mapView`). Il nome di ogni progetto è in una casella nera con scritte bianche.
- **Immagini nelle attività**: colonna `attivita.allegati` (jsonb, elenco di `{path, nome, tipo}`) e contenitore privato `allegati` in Supabase Storage (max 10 MB, solo immagini; regole: solo i membri leggono, caricano, tolgono). Nella scheda dell'attività: "+ Immagine" (anche dalla fotocamera del telefono) o incolla con Ctrl+V; le foto grandi vengono ridotte a 2000px in JPEG prima dell'invio; clic per vederle a tutto schermo; × per toglierle. Nelle righe compare l'icona con il numero di immagini. Funzioni: `galleria`, `caricaImmagini`, `urlsFor` (indirizzi firmati, 1 ora), `lightbox`.
- **Cartella del progetto**: in cima "Scadenze" (attività e pratiche con data, in ordine, con la data in un riquadro: nero oggi, arancio se scaduta; `rowScad`), poi "Da fare" (solo attività senza data), "In attesa di altri", "Fatte". Un "+" accanto a "Scadenze" (nuova attività con data proposta fra 7 giorni) e uno accanto a "Da fare"; in alto solo "Dati del progetto" (anagrafica + pratiche con "+ Pratica").
- **Nuovo tipo di attività `cont` – Contabilità di cantiere** (computi metrici, preventivi, conferme d'ordine, contratti, SAL, varianti): colore terra (`--c-cont`). Distinto da `can` (lavoro in cantiere e sicurezza) e da `amm` (conti dello studio: parcelle, fatture).
- **Orario delle scadenze**: colonna `scadenza_ora` ('HH:MM', facoltativa) su `attivita` e `pratiche`; campo ora accanto alla data nelle schede; ordinamento per data e poi ora (`sortA`); nelle Scadenze del progetto l'ora sta in un riquadro accanto alla data; nel calendario e nei testi compare prima del titolo o come "alle HH:MM" (`dueTxt`); nel file .ics diventa un evento di un'ora.
- **Attività da fare entro una scadenza**: colonna `attivita.per_scadenza` (uuid → un'altra attività con data; se quella viene eliminata il legame si azzera). Un'attività ha o una data sua o una scadenza a cui appartiene (nella scheda: "oppure entro la scadenza…", che disattiva data e ora). `effDue(a)` dà la data valida (propria o della scadenza): la usano Oggi, Prossimi 7 giorni e la cartella della settimana. Nella cartella del progetto le attività collegate stanno sotto la loro scadenza, con l'avanzamento ("2 di 4 fatte") e un "+" sulla riga della scadenza; non si ripetono in "Da fare". Altrove mostrano "Entro: <scadenza> · <quando>". Sulla mappa pendono dalla scadenza (linea più fitta), non dal progetto.
- **Menu in basso** (al posto della barra laterale e della linguetta): sul computer una riga fissa in basso, in maiuscolo — logo, Scrivania, Mappa, Calendario, Progetti, Pratiche, Clienti, Persone, data, Esci (`.bbar`); la voce attiva è sottolineata in arancio, un pallino segnala lo scaduto. Sul telefono: logo in basso a sinistra e "Menu" sottolineato a destra, che apre le voci grandi allineate a destra con la freccia diagonale (`.mpanel`), come sul sito; diventa "Chiudi". Esc chiude.
- Menu in basso, revisione: tolte Scrivania (ci porta il logo, che ha il pallino arancio se qualcosa è scaduto) e Calendario (la vista resta all'indirizzo `#calendario`); voci in Inter grassetto con la freccia diagonale del sito; nessuna linea sopra la riga.
- Revisione: le attività collegate a una scadenza compaiono anche in "Da fare" (con "Entro: …"); sotto la scadenza restano solo come piccole etichette (`ul.scad-f`). Menu in minuscolo; "Persone" ed "Esci" tolti dalla riga: il cerchio con le iniziali (`.bb-acc`) apre un riquadro (`accPop`) con nome, email, "persone e accessi" ed "esci". Sul telefono "persone" ed "esci" stanno in fondo al menu.
- La data è piccola e fissa in alto a destra (`.top-date`), non più nella riga del menu.
