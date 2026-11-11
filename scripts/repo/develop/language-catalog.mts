// Complete phrases keep commands, task IDs, paths, and tool output unchanged.
export const ITALIAN: Record<string, string> = {
  'Additional checks for your change.': 'Altri controlli per la tua modifica.',
  'Choose another task to continue.':
    'Scegli un’altra attività per continuare.',
  'New checkout? Start with setup. Then edit and review.':
    'Nuovo checkout? Inizia dalla configurazione. Poi modifica e verifica.',
  'Developer wizard': 'Assistente di sviluppo',
  'Choose a task. Enter runs it.': 'Scegli un’attività. Invio la avvia.',
  'Choose an available task.': 'Scegli un’attività disponibile.',
  'More checks · Choose a check. Esc returns.':
    'Altri controlli · Scegli un controllo. Esc torna indietro.',
  'Set up this checkout': 'Configura questo checkout',
  'Open documentation': 'Apri la documentazione',
  'Review my changes': 'Controlla le mie modifiche',
  'Run GitHub Actions locally': 'Esegui GitHub Actions in locale',
  'Troubleshoot setup': 'Diagnostica la configurazione',
  'VoiceOver controls': 'Controlli VoiceOver',
  'Run full review': 'Esegui tutti i controlli',
  'Run unit tests': 'Esegui i test unitari',
  'Run integration tests': 'Esegui i test di integrazione',
  'Run browser tests': 'Esegui i test nel browser',
  'Check nested selectors': 'Controlla i selettori annidati',
  'Check attribute parsing': 'Controlla gli attributi',
  'Check legacy DOM support': 'Controlla il DOM legacy',
  'Update terminal snapshots': 'Aggiorna le istantanee del terminale',
  'Prepare tools, dependencies, editor setup, and build outputs.':
    'Prepara strumenti, dipendenze, editor e file di build.',
  'Downloads missing tools and dependencies, then builds the project.':
    'Scarica gli strumenti e le dipendenze mancanti, poi compila il progetto.',
  'Needs network access on first use. Existing downloads are reused.':
    'Al primo utilizzo serve la rete. I download esistenti vengono riutilizzati.',
  'open the documentation and choose a change.':
    'apri la documentazione e scegli una modifica.',
  'Browse the docs while you edit.':
    'Consulta la documentazione mentre lavori.',
  'Starts a docs server and opens your browser. Set NWSAPI_GUIDE_NO_OPEN=1 to skip opening it.':
    'Avvia il server della documentazione e apre il browser. Imposta NWSAPI_GUIDE_NO_OPEN=1 per non aprirlo.',
  'Runs until you stop it.': 'Resta attivo finché non lo interrompi.',
  'After editing: review your changes.':
    'Dopo le modifiche: esegui i controlli.',
  'Check lint, formatting, types, and unit tests.':
    'Controlla lint, formattazione, tipi e test unitari.',
  'Run after editing. Checks run in order and stop at the first failure.':
    'Esegui dopo le modifiche. I controlli procedono in ordine e si fermano al primo errore.',
  'This does not automatically fix, commit, or publish files.':
    'Non corregge i file e non esegue commit o pubblicazioni automaticamente.',
  'inspect git diff and choose any additional checks for your change.':
    'esamina git diff e scegli altri controlli per la tua modifica.',
  'Run the CI workflow in the local Actions runner.':
    'Esegui il workflow CI nel runner Actions locale.',
  'Uses the pinned run-local-ci tool with .github/workflows/ci.yml. Checks for a working runtime first. Installs OrbStack on macOS or Docker on other platforms if needed. Workflow secrets come from .env.local-ci or the environment.':
    'Usa la versione fissata di run-local-ci con .github/workflows/ci.yml. Verifica prima il runtime. Se necessario, installa OrbStack su macOS o Docker sulle altre piattaforme. I segreti provengono da .env.local-ci o dall’ambiente.',
  'review any failed job in the local runner output.':
    'esamina i job non riusciti nell’output del runner locale.',
  'Check missing tools or incompatible versions.':
    'Verifica strumenti mancanti o versioni incompatibili.',
  'Checks tools and suggests the next command.':
    'Verifica gli strumenti e suggerisce il comando successivo.',
  'Read-only. Use this whenever setup needs attention.':
    'Sola lettura. Usalo per diagnosticare problemi di configurazione.',
  'Follow the report. For executable paths: pnpm run setup:check --details.':
    'Segui il rapporto. Per i percorsi degli eseguibili: pnpm run setup:check --details.',
  'Explicitly start or stop macOS VoiceOver.':
    'Avvia o interrompi esplicitamente VoiceOver su macOS.',
  'Shows the current state before offering a Start or Stop action. It never toggles implicitly. Command-F5 is the macOS emergency toggle.':
    'Mostra lo stato attuale prima di proporre Avvia o Interrompi. Non cambia lo stato implicitamente. Comando-F5 attiva o disattiva VoiceOver su macOS in caso di necessità.',
  'VoiceOver control finished. You can return to this action to stop it.':
    'Operazione VoiceOver conclusa. Puoi tornare qui per interromperlo.',
  'Check individual behaviors without browser setup.':
    'Verifica i singoli comportamenti senza configurare un browser.',
  'Use while changing implementation or tests. For the complete pre-commit checks, choose Run full review.':
    'Usalo quando modifichi implementazione o test. Per tutti i controlli prima del commit, scegli Esegui tutti i controlli.',
  'Fix failures, then run full review.':
    'Correggi gli errori, poi esegui tutti i controlli.',
  'Check how repository tools and components work together.':
    'Verifica come interagiscono strumenti e componenti del repository.',
  'Use after changing setup, process execution, or integrations.':
    'Usalo dopo modifiche alla configurazione, ai processi o alle integrazioni.',
  'Inspect failures, then rerun this check.':
    'Esamina gli errori, poi ripeti il controllo.',
  'Check behavior in a real browser.':
    'Verifica il comportamento in un browser reale.',
  'May install the pinned browser on first use. Requires network access for missing downloads.':
    'Al primo utilizzo può installare la versione fissata del browser. I download mancanti richiedono la rete.',
  'Inspect the browser report.': 'Esamina il rapporto del browser.',
  'Check nested CSS selectors and parser initialization.':
    'Verifica i selettori CSS annidati e l’inizializzazione del parser.',
  'Use after changing selector parsing or optimization. Includes cached selection checks.':
    'Usalo dopo modifiche al parsing o all’ottimizzazione dei selettori. Verifica anche la selezione con cache.',
  'Check attribute-selector parsing and invalid input.':
    'Verifica il parsing dei selettori di attributo e gli input non validi.',
  'Use after changing attribute selectors or syntax-error handling.':
    'Usalo dopo modifiche ai selettori di attributo o alla gestione degli errori di sintassi.',
  'Check compatibility with older DOM implementations.':
    'Verifica la compatibilità con implementazioni DOM precedenti.',
  'Use after changing DOM compatibility paths.':
    'Usalo dopo modifiche alla compatibilità DOM.',
  'Run full review before submitting changes.':
    'Esegui tutti i controlli prima di inviare le modifiche.',
  'Replace the saved wizard images and gallery.':
    'Sostituisce le immagini salvate dell’assistente e la galleria.',
  'Use only after an intentional UI change. Review the SVG diff and gallery before committing.':
    'Usalo solo dopo una modifica intenzionale all’interfaccia. Esamina le differenze SVG e la galleria prima del commit.',
  'Review the gallery and run tests without -u.':
    'Esamina la galleria ed esegui i test senza -u.',
  'Ctrl+C stops the server and returns here.':
    'Ctrl+C interrompe il server e torna qui.',
  'Choose where to begin. You can return to any task.':
    'Scegli da dove iniziare. Puoi tornare a qualsiasi attività.',
  'Needs attention': 'Da verificare',
  'Needs fixing': 'Da correggere',
  Available: 'Disponibile',
  Ready: 'Pronto',
  Disabled: 'Disabilitato',
  'macOS only': 'Solo macOS',
  Optional: 'Facoltativo',
  'Command options': 'Opzioni del comando',
  'Command:': 'Comando:',
  'Next:': 'Poi:',
  'Usage:': 'Uso:',
  '[options]': '[opzioni]',
  'choose task': 'scegli',
  'Return run': 'Invio avvia',
  'Enter run': 'Invio avvia',
  'Esc / q quit': 'Esc / q esci',
  'Esc back': 'Esc indietro',
  'q quit': 'q esci',
  '? options': '? opzioni',
  'm more': 'm altri',
  'PgUp/PgDn scroll': 'PgUp/PgDn scorri',
  'Show help.': 'Mostra l’aiuto.',
  'Print machine-readable output.':
    'Stampa l’output per gli strumenti automatici.',
  'Show command help.': 'Mostra l’aiuto del comando.',
  'Print the task result as JSON.':
    'Stampa il risultato dell’attività in JSON.',
  'Prepare checkout tools, dependencies, and build outputs.':
    'Prepara strumenti, dipendenze e file di build del checkout.',
  'Opt in to VoiceOver setup.':
    'Abilita la configurazione facoltativa di VoiceOver.',
  'Preview the setup plan.': 'Mostra il piano di configurazione.',
  'Describe setup without running it.':
    'Descrivi la configurazione senza eseguirla.',
  'Choose a task, preview it, then run it.':
    'Scegli un’attività, esaminala, poi eseguila.',
  'Use numbered text prompts.': 'Usa le richieste testuali numerate.',
  'List tasks without running them.': 'Elenca le attività senza eseguirle.',
  'Run one task, then exit.': 'Esegui un’attività, poi esci.',
  'Describe the available tasks.': 'Descrivi le attività disponibili.',
  'Preview checkout setup.': 'Mostra la configurazione del checkout.',
  'Choose the product checkout.': 'Scegli il checkout del prodotto.',
  'Preview worktree cleanup.': 'Mostra la pulizia delle worktree.',
  'Apply the proposed cleanup.': 'Applica la pulizia proposta.',
  'Start the documentation server. Ctrl+C stops it.':
    'Avvia il server della documentazione. Ctrl+C lo interrompe.',
  'Choose the server address.': 'Scegli l’indirizzo del server.',
  'Choose the listening port.': 'Scegli la porta di ascolto.',
  'Open the browser at a path.': 'Apri il browser su un percorso.',
  'Fail if the chosen port is occupied.':
    'Termina con un errore se la porta scelta è occupata.',
  'Show this project help.': 'Mostra l’aiuto del progetto.',
  'Run lint, formatting, types, and unit tests. Stop at the first failure.':
    'Esegui lint, formattazione, tipi e test unitari. Fermati al primo errore.',
  'Show help without running checks.':
    'Mostra l’aiuto senza eseguire controlli.',
  'Run the local workflow. Requires a container runtime.':
    'Esegui il workflow locale. Richiede un runtime per container.',
  'Show help without starting containers.':
    'Mostra l’aiuto senza avviare container.',
  'Inspect checkout readiness without changing it.':
    'Verifica lo stato del checkout senza modificarlo.',
  'Show tool paths and detailed diagnostics.':
    'Mostra i percorsi degli strumenti e la diagnostica dettagliata.',
  'Check prerequisites for a task.': 'Verifica i prerequisiti di un’attività.',
  'Ask before changing VoiceOver. Requires macOS.':
    'Chiedi conferma prima di modificare VoiceOver. Richiede macOS.',
  'Explicitly start VoiceOver.': 'Avvia esplicitamente VoiceOver.',
  'Stop VoiceOver.': 'Interrompi VoiceOver.',
  'nwsapi developer menu': 'nwsapi assistente di sviluppo',
  'Preview a task:': 'Anteprima attività:',
  'b to go back': 'b per tornare indietro',
  'm for more checks': 'm per altri controlli',
  'l for language': 'l per la lingua',
  'or q to quit:': 'oppure q per uscire:',
  'Enter to run,': 'Invio per eseguire,',
}
