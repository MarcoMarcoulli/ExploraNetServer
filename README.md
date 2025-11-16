# ExploraNetServer

ExploraNet è un progetto composto da due parti distinte:

- **Backend** in Node.js/TypeScript (`ts-node`)
- **Frontend**

In seguito si spiega come clonare il repository, installare le dipendenze e avviare entrambe le parti del progetto.

---

## Prerequisiti

Assicurati di avere installato:

- [Node.js](https://nodejs.org/) 
- **Git**

---

## 1. Clonare il repository

```bash
git clone https://github.com/MarcoMarcoulli/ExploraNetServer.git
cd ExploraNetServer
```
## 2. Installazione delle dipendenze
Backend (server)
```bash
cd server
npm install
```
Frontend (client)
Apri una nuova tab del terminale oppure torna alla root del progetto:

```bash
cd ../client
npm install
```
## 3. Avviare il progetto
Avviare il server
Da dentro la cartella server:

```bash
npm start
```
Questo avvia: ts-node src/index.ts

Il server sarà in ascolto sulla porta 3001.

Avviare il client
Da dentro la cartella client:

```bash
npm run dev
```
Il client verrà avviato in modalità sviluppo.
