# ExploraNetServer

ExploraNet è un progetto composto da due parti distinte:

- **Backend** in Node.js/TypeScript (`ts-node`)
- **Frontend**

In seguito si spiega come clonare il repository, installare le dipendenze e avviare entrambe le parti del progetto.

---

## Prerequisiti

Assicurati di avere installato:

- [Node.js](https://nodejs.org/) (versione **18+** consigliata)
- **npm** (incluso con Node)
- **Git**

---

## 1. Clonare il repository

```bash
git clone https://github.com/MarcoMarcoulli/ExploraNetServer.git
cd ExploraNetServer
## 2. Installazione delle dipendenze
Backend (server)
bash
Copy code
cd server
npm install
Frontend (client)
Apri una nuova tab del terminale oppure torna alla root del progetto:

bash
Copy code
cd ../client
npm install
## 3. Avviare il progetto
Avviare il server
Da dentro la cartella server:

bash
Copy code
npm start
Questo avvia:

bash
Copy code
ts-node src/index.ts
Il server sarà in ascolto sulla porta configurata nel progetto
(ad esempio 3000 o 5000, a seconda del codice).

Avviare il client
Da dentro la cartella client:

bash
Copy code
npm run dev
Il client verrà avviato in modalità sviluppo (tipicamente su http://localhost:5173 o simile, a seconda della configurazione).

## 📂 Struttura del progetto
text
Copy code
ExploraNetServer/
│
├── server/      # Backend Node.js/TypeScript
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
│
└── client/      # Frontend
    ├── src/
    ├── package.json
    └── ...
## 📝 Note
Backend e frontend devono essere avviati separatamente, ognuno nel proprio terminale.

Assicurati che le porte configurate per server e client non siano già utilizzate da altri processi.
