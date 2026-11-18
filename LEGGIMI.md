# Gestionale dello studio — guida all'installazione

Questa cartella contiene tutto il gestionale: il codice, il database e queste istruzioni. Messo in linea, si apre all'indirizzo **https://gestionale.riccardobrolloarchitetto.it**, dal computer e dal telefono, con un accesso personale per ogni persona dello studio.

Il gestionale si regge su tre servizi gratuiti, e conviene pensarli come un piccolo edificio:

| Parte | Servizio | Ruolo |
|---|---|---|
| le fondamenta | **Supabase** | conserva i dati (clienti, progetti, pratiche, attività) e controlla chi entra |
| la facciata | **GitHub Pages** | pubblica le pagine del gestionale su internet |
| il numero civico | **Aruba** | fa puntare `gestionale.riccardobrolloarchitetto.it` alla facciata |

Il sito attuale `www.riccardobrolloarchitetto.it` non viene toccato: si aggiunge solo un sottodominio.

---

## Cosa c'è nella cartella

```
gestionale/
├── index.html             la pagina che si apre
├── app.js                 tutto il funzionamento del gestionale
├── style.css              la grafica (Inter + Times New Roman, colori pastello)
├── config.js              ← l'unico file da compilare: indirizzo e chiave di Supabase
├── icon.svg               l'icona per la schermata Home del telefono
├── CNAME                  il sottodominio, letto da GitHub Pages
├── .nojekyll              dice a GitHub di pubblicare i file così come sono
├── .github/workflows/     un promemoria automatico che tiene sveglio il database
├── supabase/schema.sql    il database: tabelle e permessi, da eseguire una volta
├── LEGGIMI.md             questa guida
├── ISTRUZIONI-PER-CLAUDE.md  il quadro completo, da dare a Claude per continuare il lavoro
└── extra/cose-da-fare.html   la prima app "cose da fare", come riferimento
```

---

## 1. Supabase: il database (15 minuti)

1. Vai su **supabase.com**, crea un account (anche con GitHub) e poi **New project**.
   - Nome: `gestionale-studio`
   - Password del database: generala e salvala nel tuo gestore di password
   - Regione: **Central EU (Frankfurt)**, la più vicina
2. Quando il progetto è pronto apri **SQL Editor → New query**.
3. Apri il file `supabase/schema.sql`, vai all'**ultima riga** e sostituisci `scrivi-qui-la-tua-email@esempio.it` con la tua email, tutta in minuscolo. Sarai il primo amministratore.
4. Copia tutto il contenuto del file nell'editor e premi **Run**. Deve comparire "Success". Se lo esegui una seconda volta non succede niente di male.
5. Vai in **Authentication → Sign In / Providers → Email** e **disattiva "Confirm email"**. Così chi aggiungi allo studio entra subito, senza aspettare una mail di conferma. È sicuro: chi non è nell'elenco delle persone dello studio entra ma non vede nessun dato.
6. Vai in **Authentication → URL Configuration** e scrivi in **Site URL** `https://gestionale.riccardobrolloarchitetto.it`.
7. Vai in **Project Settings → API** (o **API Keys**) e copia due valori:
   - **Project URL**, del tipo `https://abcd1234.supabase.co`
   - la chiave **anon / public** (o **publishable**, che inizia con `sb_publishable_`)
8. Incollali in `config.js` al posto dei due `INSERISCI-QUI`.

> La chiave pubblica può stare nel codice: è fatta apposta. I dati sono protetti dai permessi del database (vedi `schema.sql`, sezione "permessi"), non dalla segretezza della chiave. La **service_role** o **secret key** invece non va mai messa nel codice.

**Una cosa da sapere sul piano gratuito.** Supabase mette in pausa i progetti gratuiti che restano poco attivi per sette giorni. I dati non si perdono: dal pannello si preme **Resume project** e tutto torna com'era. Per evitarlo nella cartella c'è il file `.github/workflows/tieni-sveglio-supabase.yml`, che ogni tre giorni manda una piccola richiesta al database. Parte da solo una volta caricato su GitHub. Attenzione: GitHub sospende i promemoria automatici dei repository in cui non si modifica nulla per due mesi, e in quel caso manda una mail per riattivarli.

Il piano gratuito non fa copie di sicurezza automatiche. Ogni tanto conviene esportare i dati: in Supabase **Table Editor → tabella → Export to CSV**.

---

## 2. GitHub: pubblicare le pagine (10 minuti)

1. Su **github.com** crea un nuovo repository, per esempio `gestionale`.
   - Con l'account gratuito il repository deve essere **pubblico** perché GitHub Pages funzioni. Vuol dire che chiunque può leggere il **codice**, non i **dati**: quelli stanno su Supabase, dietro l'accesso. Per un repository privato serve GitHub Pro.
2. Carica tutti i file della cartella, comprese le cartelle `.github` e `supabase` e il file `.nojekyll`. Il modo più semplice è **Add file → Upload files** e trascinare dentro il contenuto della cartella. Se le cartelle che iniziano con il punto non vengono caricate, usa GitHub Desktop.
3. Vai in **Settings → Pages**:
   - **Source**: *Deploy from a branch*
   - **Branch**: `main`, cartella `/ (root)` → **Save**
   - **Custom domain**: `gestionale.riccardobrolloarchitetto.it` → **Save**
4. Dopo qualche minuto il gestionale risponde all'indirizzo `https://TUO-UTENTE.github.io/gestionale/`. Il sottodominio funzionerà dopo il passo 3.

---

## 3. Aruba: il sottodominio (5 minuti, più l'attesa)

1. Entra in **admin.aruba.it**, scegli il dominio `riccardobrolloarchitetto.it` e apri la **Gestione DNS**.
2. Aggiungi un record **CNAME**:
   - **Nome / Host**: `gestionale`
   - **Valore / Punta a**: `TUO-UTENTE.github.io` (il tuo nome utente GitHub, senza `https://` e senza `/gestionale`)
   - **TTL**: lascia quello proposto
3. Salva. La modifica impiega da qualche minuto a qualche ora per propagarsi.
4. Torna su GitHub in **Settings → Pages**: quando il controllo del dominio è verde, spunta **Enforce HTTPS**.

Se nel pannello DNS esiste già un record `gestionale`, va eliminato prima di aggiungere il CNAME.

---

## 4. Primo accesso

1. Apri `https://gestionale.riccardobrolloarchitetto.it`.
2. Scegli **"primo accesso: crea la password"**, scrivi la stessa email che hai messo in `schema.sql` e una password di almeno 8 caratteri.
3. Sei dentro come amministratore.

**Per aggiungere un collaboratore:** sezione **studio → + aggiungi**, scrivi la sua email e il nome. Poi gli mandi l'indirizzo del gestionale: entra con "primo accesso: crea la password" usando quella email.

**Sul telefono:** apri l'indirizzo, poi Condividi → **Aggiungi alla schermata Home** (iPhone) oppure menu → **Aggiungi a schermata Home** (Android).

**Password dimenticata:** il pulsante c'è, ma il servizio email incluso in Supabase è molto limitato e potrebbe non recapitare la mail a tutti. Per renderlo affidabile si collega una casella di posta del dominio in **Authentication → SMTP Settings**, con i dati SMTP di Aruba. Nel frattempo, se qualcuno dimentica la password, un amministratore elimina il suo utente da Supabase in **Authentication → Users**: la persona rifà "primo accesso: crea la password" con la stessa email e ritrova tutto, perché i dati dello studio non dipendono dal suo utente.

---

## 5. Portare dentro le "cose da fare" già scritte

1. Apri l'app **cose da fare** su Claude e in fondo premi **copia backup**.
2. Nel gestionale vai su **studio → incolla il backup**, incolla e premi **importa**.

Progetti e attività vengono aggiunti a quelli presenti e assegnati a chi importa. Le attività in attesa, quelle di ogni giorno e le scadenze restano come erano. L'app su Claude non viene modificata: resta lì finché non decidi di eliminarla.

---

## Come è organizzato il gestionale

- **oggi**: scadute, pratiche in scadenza, attività da fare oggi, attività di ogni giorno, attività in attesa ma in scadenza, fatte oggi.
- **prossimi 7 giorni**: scadenze di attività e pratiche, giorno per giorno.
- **progetti**: in corso, in pausa, chiusi. Ogni progetto ha la sua pagina con cliente, comune, pratiche e attività.
- **in attesa**: le attività ferme perché si aspetta qualcun altro, raggruppate per chi deve muoversi, più le pratiche depositate in attesa del Comune.
- **pratiche**: tutte le pratiche per stato (in preparazione, depositata, integrazioni richieste, conclusa).
- **clienti**: anagrafica con ricerca e progetti collegati.
- **fatte** e **studio**: lo storico e le persone dello studio.

In alto, **le mie / tutto lo studio** sceglie se vedere solo le tue attività (e quelle non assegnate) o quelle di tutti. Le iniziali a destra di un'attività dicono chi la sta seguendo.

**Colori per tipo di attività:** azzurro per pratiche e P.A., giallo per cantiere e sicurezza, verde salvia per progetto e disegno, pesca per clienti e sopralluoghi, rosa per parcelle e amministrazione, lilla per studio e personale. Il **tratteggio** indica le cose ferme perché si aspetta qualcun altro.

---

## Per modificare il gestionale

Si modificano i file e si ricaricano su GitHub: dopo un minuto la nuova versione è in linea. Per le modifiche più grandi, dai a Claude il file `ISTRUZIONI-PER-CLAUDE.md` insieme ai file: ci trova tutto quello che serve per riprendere il lavoro.
