ExploraNet

ExploraNet è un progetto composto da due parti distinte:

Server – Backend in Node.js/TypeScript (ts-node)

Client – Frontend sviluppato con Vite

Questo documento spiega come clonare il repository, installare le dipendenze e avviare entrambe le parti del progetto.

📦 Prerequisiti

Assicurati di avere installato:

Node.js (versione 18+ consigliata)

npm (incluso con Node)

Git

Puoi verificare con:

node -v
npm -v

📥 1. Clonare il repository
git clone https://github.com/MarcoMarcoulli/ExploraNetServer.git
cd ExploraNetServer

🛠️ 2. Installazione delle dipendenze
Backend (server)
cd server
npm install

Frontend (client)

Apri una nuova tab del terminale oppure torna alla root:

cd ../client
npm install

▶️ 3. Avviare il progetto
Avviare il server

Da dentro la cartella server:

npm start


Questo avvia:

ts-node src/index.ts


Il server sarà in ascolto sulla porta configurata nel progetto (es. 3000 o 5000 a seconda del codice).

Avviare il client

Da dentro la cartella client:

npm run dev


Vite mostrerà l'indirizzo locale, tipicamente:

Local:   http://localhost:5173/


Aprilo nel browser.
