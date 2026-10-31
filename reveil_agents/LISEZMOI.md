# Relais GitHub des agents — 1.8.2

## Version 1.8.2 — cadrans et routage QA .77

- Tableau de bord : les quatre graphiques inférieurs sont remplacés par trois cadrans analogiques. L'historique des acceptations alimente LAST et la moyenne à fenêtre sélectionnable (dix derniers intervalles, série actuelle, dernières 24 heures). Le cadran QA affiche le temps depuis la dernière livraison refusée et l'intervalle moyen entre deux refus QA. Le cadran fluorescent 0–200 % affiche les billets acceptés / cible et (billets acceptés + reprises effectivement livrées) / cible.
- Reprise : les livraisons de code distinctes d'un même numéro constituent des reprises; les refus QA comptent chacun comme événements pour l'intervalle des bad deliveries. Aucun comptage déduit d'une simple intention de correction.
- Reconnaissance d'un rapport QA conforme : « **Résultat : conforme. Aucune divergence constatée.** » est reconnu en plus des formulations déjà acceptées; le JSON doit toujours être complet, cohérent et sans constat. Le cycle .77 déjà publié peut ainsi router vers l'Architecte sans republier la QA.
- Conserver le dossier/ID et stockage de l'extension. Remplacer les fichiers existants par `reveil_agents/`, recharger dans `edge://extensions`, puis déclencher **Lire GitHub**. Les reçus existants ne sont pas effacés.

## Correctif 1.8.1 — rapport QA conforme en gras

Le rapport QA peut présenter « Aucune divergence constatée. » en texte ordinaire ou en gras Markdown (`**...**` ou `__...__`). Le relais reconnaît ces formulations quand le verdict structuré est conforme, complet et sans constat; les divergences et verdicts incohérents restent bloqués ou dirigés vers le Programmeur selon leur contenu. Cette correction permet de reprendre le signal QA déjà publié, sans le republier ni effacer les reçus.

Remplacer les fichiers dans le même dossier d’extension, recharger dans `edge://extensions`, vérifier 1.8.1 puis appuyer une fois sur **Lire GitHub**. Conserver les réglages, prises en charge et reçus; ne pas utiliser un réessai volontaire si aucun envoi à l’Architecte n’a été effectué.

Remplacer les fichiers dans le dossier de la même extension et la recharger dans Edge. Les conversations sélectionnées, le dépôt et les réglages sont conservés. Ne pas installer une deuxième copie de l’extension en parallèle.

## Cycle

1. Une autorisation complète désigne le Programmeur.
2. Sa livraison désigne le Vérificateur.
3. Une divergence statique QA retourne au Programmeur dans le même cycle et billet, avec une tentative supérieure.
4. Seule une QA statique complète conforme désigne l’Architecte.
5. L’autorisation suivante commence le prochain billet déjà prescrit.

Chaque rôle publie sa prise_en_charge.json avant son travail. GitHub reste l’autorité du travail et des résultats. La surveillance lit GitHub toutes les 30 secondes ; elle ne renvoie pas l’invitation à chaque lecture.

## Reçu de transmission

Le reçu persiste dans l’extension, avec la clé dépôt / branche / rôle / cycle / billet / SHA source / URL de conversation. Le titre, l’heure, la reprise de surveillance et un commit GitHub supplémentaire ne créent pas un nouveau reçu.

Avant d’injecter le message, une tentative est enregistrée. Le service autorise son clic une seule fois. Une transmission terminée attend la prise en charge GitHub. Une transmission interrompue ou dont le résultat est inconnu reste incertaine : aucune nouvelle tentative automatique. Un redémarrage conserve ces reçus et transforme une tentative interrompue en état incertain.

Un nouvel onglet pour la même URL ne change pas la conversation. Une nouvelle URL choisie dans les réglages crée une destination indépendante et peut recevoir le relais. Une ancienne prise associée à l’ancienne destination connue ne bloque pas cette relève ; la nouvelle prise recommence l’attente. Un nouveau cycle, même pour le même rôle et la même conversation, possède un nouveau reçu. Les résultats GitHub font toujours avancer le cycle, même si un ancien reçu reste incertain.

## Commandes

- Enregistrer : modifier les destinations et réglages ; ne pas effacer les reçus.
- Démarrer / Reprendre : reprendre la surveillance ; ne pas ignorer la prise de l’agent ni réémettre un envoi enregistré.
- Arrêter : suspendre la surveillance. Une tentative qui n’a pas encore obtenu son autorisation de clic est refusée après cet arrêt.
- Lire GitHub : observer immédiatement, sans réémission du même reçu.
- Réessayer volontairement cet envoi : demander explicitement une nouvelle tentative pour le reçu affiché, si la réception a échoué ou si la session de l’agent a été abandonnée. Cette commande peut réémettre un message déjà transmis ; elle n’est jamais exécutée par la surveillance. Elle invalide l’ancien identifiant de tentative, conserve la destination et ignore seulement la prise déjà observée pour cette demande. Une nouvelle prise différente rétablit l’attente. Un reçu ou un relais qui a changé ne peut pas être réessayé depuis un ancien bouton.

Un onglet occupé, une session expirée, un onglet fermé ou un brouillon humain rencontré avant toute tentative ne consomme pas le relais : la lecture suivante pourra le réévaluer. Un brouillon de relais laissé par une tentative interrompue peut être repris par un réessai volontaire, sans écraser un autre brouillon.

## Mise à jour et limites

Les anciens événements 1.7.3 déjà transmis ou incertains sont importés sans renvoi automatique. Les messages déjà présents dans la page peuvent aussi produire le reçu manquant. Aucun changement de focus, rafraîchissement, invite périodique ni garde-fou Retry.

Le navigateur et GitHub ne fournissent pas une transaction unique d’envoi et de prise en charge : un clic ou un compositeur vidé ne prouve pas à lui seul la réception serveur. C’est pourquoi l’état incertain demande un choix explicite au lieu d’un réessai aveugle.

Validation par simulations locales du transport, des trois rôles, des transitions, des reprises, des erreurs et de la migration. La session Edge de l’utilisateur n’est pas pilotée par ces tests.

## Programmeur bloqué — 1.7.5 historique remplacé par la 1.8.0

Le mode GitHub lit aussi collaboration/programmeur/statut.json (facultatif pour les anciens dépôts). Un statut schema_version=1, role=dev, etat=bloque et livraison=false doit correspondre au cycle, billet, branche et base de l’autorisation active, ainsi qu’à son vrai commit. source_sha désigne alors le checkpoint partiel déclaré, pas une livraison complète.

Le plugin retrouve le dernier commit qui a modifié statut.json dans l’historique de ce fichier et relit les données à ce commit. Il ne substitue pas le dernier commit général de main. La demande envoyée à l’Architecte contient ce commit figé, le checkpoint, la base et le commit de l’autorisation consommée. La validation exige que ce commit modifie bien statut.json et que les données figées concordent. En cas de lecture incohérente ou d’historique indisponible, aucun agent n’est lancé.

Le blocage correspondant est prioritaire sur la livraison et ne déclenche jamais le Vérificateur. Il est mémorisé jusqu’à une nouvelle autorisation ; effacer le statut ou le passer à un autre état ne relance pas le Programmeur. Une autorisation nouvelle pour le même cycle est aussi reconnue par son commit réel ; le statut qui précède cette nouvelle autorisation devient périmé. Un ancien statut d’un autre cycle est ignoré.

La clé de transmission du blocage est dépôt / branche / cycle / commit du statut. Les changements sans rapport sur main, les relectures, les redémarrages et les changements de conversation ne renvoient pas cet événement. Un nouveau commit de statut bloqué dans le même cycle constitue un nouvel événement. La prise en charge architecte est reconnue seulement si cycle/billet/checkpoint et relais_commit_sha correspondent exactement au statut figé. Le reçu normal de transport et le réessai volontaire restent disponibles, sans réessai automatique.

L’Architecte arbitre et publie une nouvelle autorisation avec son masterticket. C’est cette publication qui libère le Programmeur. Le plugin ne décide pas de terminer le billet, de valider le checkpoint ou de fabriquer une livraison.

**La section précédente décrit le protocole historique. En 1.8.0, elle ne gouverne plus les nouveaux relais : un ancien statut bloque déclenche une poursuite Programmeur, sans arbitrage ou morcellement Architecte. Une livraison complète cohérente reste prioritaire sur ce statut ancien.**

## Correction de sérialisation — 1.7.6

Sans blocage mémorisé, le troisième argument de readGitHubWeb était undefined, valeur refusée par chrome.scripting.executeScript. Il est maintenant explicitement null. Les simulations vérifient récursivement la sérialisation de tous les arguments injectés. Le cas réel de l’autorisation .21 cycle 002 est couvert, sans ancien blocage et après blocage du cycle 001 : le Programmeur reçoit un seul relais. Aucun effacement de reçu, changement de protocole ou nouvelle publication GitHub requis.


## Correction du statut figé — 1.7.7

La comparaison des JSON ignore désormais l’ordre des propriétés des objets, qui peut changer lors des transferts Chrome. Elle conserve tous les champs, valeurs et l’ordre des tableaux. Le relais bloqué conserve son commit figé, son checkpoint et sa déduplication. Remplacer les fichiers de la même extension puis la recharger ; le prochain relevé GitHub reprend le relais existant, sans republier le statut.


## Reprise vers une nouvelle conversation — 1.7.8

Le bouton Réessayer volontairement enregistre la sélection affichée et dirige le réessai vers cette conversation. Il permet aussi de reprendre une transmission restée prepared ou committing. Le jeton précédent est invalidé avant le nouveau permis ; aucune reprise automatique supplémentaire. Après mise à jour, choisir la conversation puis cliquer Réessayer volontairement une fois.


## Script compositeur suspendu — 1.7.9

Le réessai volontaire remplace le script compositeur précédent même si son callback est resté suspendu après une interruption du service. Un ancien script qui se réveille ne peut plus cliquer. Les refus ultérieurs montrent désormais le détail enregistré, l’état du reçu et sa destination. Sans réessai explicite, les lectures ne renvoient aucun message supplémentaire.


## Détection du compositeur — 1.7.10

Alignement du contrôle initial et du script d’envoi : textarea, contenteditable true ou plaintext-only, éditeur imbriqué dans prompt-textarea/composer-input, ProseMirror et textbox de formulaire. Seuls les champs visibles et modifiables sont retenus. Mise à jour puis Réessayer volontairement pour reprendre le reçu incertain.


## Contrôle initial explicite — 1.7.11

Un bouton arrêt caché ne bloque plus l’envoi. Le contrôle distingue arrêt visible, brouillon distinct et absence d’éditeur. Pour cette dernière, il affiche les caractéristiques techniques des champs observés sans leur texte. Cette instrumentation ne prouve pas à elle seule la cause sur l’ordinateur utilisateur.


## Rotation automatique du Programmeur — 1.7.12

Seulement pour le Programmeur (`dev`). Juste avant un **nouveau** relais sans reçu, l'extension recherche dans la conversation active un avis visible et explicite de longueur maximale ainsi que **son** bouton « Continue in new chat » / « Continuer dans une nouvelle conversation ». Le bouton ordinaire « Nouveau chat » de la barre de navigation ne suffit jamais. Un brouillon humain ou une ambiguïté bloque la rotation sans altérer la page.

Si le bouton est trouvé, l'extension n'effectue qu'un clic, surveille la navigation du même onglet ou l'ouverture d'un nouvel onglet enfant, puis exige une vraie URL ChatGPT `/c/...` différente. Elle enregistre cette URL dans `settings.devUrl`, le titre d'onglet dans `settings.devTitle` dès qu'il est disponible, ainsi qu'un historique `conversationHistory` (ancien/nouveau lien, titre, cycle, billet et date). Le popup recharge sa sélection après mise à jour des réglages. Ensuite le relayeur applique son protocole habituel de validation du commit GitHub, de reçu unique et de transmission. QA et Architecte sont inchangés.

**Limitation volontaire :** certains écrans de ChatGPT ne donnent pas encore d'URL `/c/...` à la nouvelle conversation avant le premier message. Dans ce cas, l'extension **n'envoie aucun relais** à une URL provisoire et ne fabrique jamais d'identifiant. Le clic est mémorisé dans `devRollover` et peut être récupéré si une URL canonique apparaît après coup. L'échec ou le rechargement ne provoque pas un second clic. La surveillance affichera un blocage explicite si aucune URL exploitable ne se matérialise. Réaffecter manuellement un nouvel onglet ChatGPT dans ce cas pour reprendre. Ne pas effacer les reçus de transport.

Cette reconnaissance repose sur le DOM de ChatGPT (interface non contractuelle), et a été validée en simulation locale : le comportement réel du bouton Edge/ChatGPT peut varier. Les boutons des autres rôles ne sont jamais inspectés. Seuls les paramètres de conversation du Programmeur sont modifiés.

## Correction et inspection du Programmeur — 1.7.13

Le numéro du popup est désormais obtenu directement de `chrome.runtime.getManifest().version` : l’ancienne inscription statique `1.7.11` était erronée dans la 1.7.12. Le service doit aussi répondre en 1.7.13.

La reconnaissance de fin de conversation autorise désormais l’avis système placé dans une réponse affichée (et non uniquement dans un bloc `role=alert`). Elle exige toujours un bouton natif de continuation à proximité de l’avis et ignore le bouton de navigation global « New chat » ainsi que le contenu rédigé par l’utilisateur.

Le bouton « Vérifier la limite Programmeur » dans le popup inspecte la conversation actuellement affectée au Programmeur et indique `normal`, `full` ou `blocked`, **sans cliquer** et **sans transmettre de relais**. Les deux autres rôles ne sont jamais inspectés par cette commande. La rotation automatique est déclenchée uniquement à l’arrivée d’un **nouveau** relais Programmeur non encore envoyé.

**Installation :** dans `edge://extensions`, ouvrir les détails de l’extension déjà installée pour vérifier son dossier chargé. Extraire l’archive et copier le contenu de `reveil_agents/` PAR-DESSUS le dossier chargé existant (ne pas ajouter un second niveau `reveil_agents/`). Conserver le même chemin et l’ID de l’extension pour préserver `chrome.storage.local` (destinations et reçus). Cliquer ensuite sur **Recharger**. Ne pas installer une nouvelle copie séparée, ce qui pourrait utiliser un autre stockage. Le manifeste dans Edge doit afficher 1.7.18.

Si le clic de continuation mène à une page sans URL `/c/...` définitive, le relais demeure suspendu comme précédemment. Aucun second clic automatique et aucun envoi dans une URL provisoire.

## Reconnaissance du bandeau réel ChatGPT — 1.7.14

Le message rouge « You've reached the maximum length for this conversation … » et « Start new chat » peut se trouver *hors* `main`, immédiatement au-dessus du compositeur. Le scanner ne dépend désormais plus du conteneur `main` ni d’un attribut `role=alert`. Il ne clique que si le message et le bouton sont présents dans un même petit conteneur visible non rédigé par l’utilisateur et distinct de la navigation. L’inspection affiche le nombre d’avis et de boutons repérés pour diagnostic.

Ce changement ne fait pas de relève en permanence : la vérification automatique a lieu avant un **nouveau relais Programmeur** sans reçu, jamais pendant le travail de QA ou de l’Architecte. L’URL définitive `/c/...` reste indispensable avant l’envoi ; si ChatGPT n’en attribue pas, la relève reste suspendue, sans doublon. Le bouton d’inspection est disponible à tout moment et ne clique jamais.

Pour charger la 1.7.14, remplacer le contenu du *même répertoire* d’extension Edge, sans changer son ID, puis recharger depuis `edge://extensions`.

## Reconnaissance du bouton — 1.7.15

La 1.7.14 détectait correctement l’avertissement mais pouvait rejeter son bouton
« Start new chat » lorsque le conteneur React sépare l’avertissement et le
bouton en éléments distincts, ou lorsque le contrôle est niché dans un `header`.
La 1.7.15 accepte un seul contrôle visible correspondant à l’action et relié
soit à un petit conteneur DOM contenant l’avertissement, soit par proximité
géométrique stricte dans le même bandeau. Elle cherche aussi les libellés
accessibles et les textes internes des boutons. L’inspection donne le nombre
d’avis, de boutons compatibles et de boutons associés, sans effectuer de clic.

Tout ce mécanisme est réservé au Programmeur. La relève automatique se produit
seulement avant le prochain billet Programmeur non acquitté. Les protections de
reçu et d’URL définitive restent inchangées. En l’absence d’URL `/c/...` après
la continuation, aucune invitation n’est envoyée.


## Version 1.7.17 — Compositeur hors formulaire

Le contrôle préalable et le script d'envoi examinent tous les champs candidats dans l'ordre de priorité, puis retiennent le premier visible et modifiable. Le repli reconnaît aussi un `[role="textbox"][contenteditable]` hors d'un formulaire. Un champ caché placé avant le compositeur ne bloque plus la reprise. Aucun relais bloqué n'est marqué transmis par cette mise à jour ; recharger l'extension et déclencher une nouvelle lecture volontaire de GitHub pour reprendre le cycle conservé.

## Version 1.7.16 — Gantt de supervision (lecture seule)

Le bouton **Gantt des agents** dans la popup ouvre `dashboard.html`. Le tableau lit les historiques GitHub des prises en charge et signaux de cloture Programmeur, Verificateur et Architecte, reconstruit des intervalles observables et des latences de relais; couleurs par role, fenetre 6/12/24/48 heures, detail cliquable avec commits. Les intervalles ne sont pas des durees CPU ni des tokens.

Autorisation hote supplementaire requise : `https://api.github.com/*` (lecture des commits publics, aucun jeton transmis). Cache local 10 minutes, actualisation volontaire ou toutes les 15 minutes si visible. Cette page ne declenche ni build ni publication GitHub. La future ligne de compilation ne sera affichee qu'apres implementation d'un vrai journal instrumente. Aucun statut VR n'est ajoute.


## Version 1.7.18 — Nouveau fil facultatif par rôle, sans Work

Dans **Conversations des rôles**, une case indépendante est proposée pour **Programmeur** et pour **Vérificateur** : **Nouvelle conversation à chaque demande (GPT-6 High)**. L'Architecte ne possède pas de case et conserve toujours sa conversation. Par défaut, les deux cases sont désactivées pour préserver le comportement de la 1.7.17.

**Effet immédiat sur le prochain relais non transmis :** le changement de case est enregistré dès le clic dans la popup, sans redémarrer la surveillance, sans changer la branche GitHub et sans renvoyer les messages déjà acquittés. Quand la case est cochée, l'extension réutilise exactement **l'onglet ChatGPT associé au rôle**, vérifie qu'il ne contient aucun brouillon ni réponse en cours, navigue dans **ce même onglet** vers la page de nouvelle conversation ChatGPT normale, puis cherche à y sélectionner **GPT-6 et High**. Elle n'ouvre pas de nouvel onglet ni de session Work, et n'effectue aucune action portant le libellé Work. Si GPT-6 High ne peut pas être confirmé dans le sélecteur, **aucun relais n'est envoyé** : le journal indique le blocage.

Après la soumission, la nouvelle URL canonique `/c/...` remplace l'ancienne association du rôle et un événement est conservé dans `conversationHistory`. Si la case est ensuite décochée, les demandes suivantes du même rôle s'ajoutent à cette **dernière conversation**, dans le même onglet. Si elle est recochée, le prochain billet non envoyé renouvelle à nouveau. Le suivi `freshPending` protège les transitions et la récupération après interruption; les reçus sont conservés et rebasculés vers la nouvelle URL sans autoriser un double envoi. Le mécanisme préexistant de continuation en cas de limite de longueur du Programmeur reste indépendant, et n'est utilisé que si la case de renouvellement systématique est désactivée.

**Important :** la structure du sélecteur de modèles est une interface ChatGPT changeante et non une API garantie. Les simulations automatisées vérifient le sélecteur, les états persistants et les protections de transport, mais l'interface authentifiée réelle d'Edge n'est pas testable dans cet environnement. Si le sélecteur a changé, la transition s'arrête explicitement plutôt que d'envoyer en Instant, dans un autre modèle ou dans Work. Ne pas effacer `chrome.storage.local` pour résoudre un état de transition inachevé : les reçus protègent contre les duplications.

**Installation de la mise à jour :** extraire l'archive, remplacer les fichiers **dans le même dossier d'extension déjà chargé** (pas dans un nouveau dossier sous celui-ci), puis cliquer sur **Recharger** dans `edge://extensions`. Conserver le même identifiant d'extension et le même stockage. Vérifier que le manifeste affiche **1.7.18** et que les deux cases sont visibles. Les nouveaux réglages ne nécessitent plus « Enregistrer » à chaque changement de case.

La compilation `validation/build-service-worker.cjs` reconstruit l'unique worker Manifest V3 depuis les modules (y compris `fresh-chat.js`). Les tests `fresh-chat.test.cjs`, `fresh-recovery.test.cjs` et `model-picker.test.cjs` complètent les scénarios antérieurs.


## Version 1.7.19 — Reprise automatique et sélecteur GPT-6 High facultatif

Correctif du blocage réel « Sélecteur de modèle ChatGPT introuvable ; GPT-6 High non vérifié » observé après ouverture d'un nouveau chat. **Le relais est désormais autorisé même si la sélection GPT-6 High ne peut pas être contrôlée dans le DOM**, car la configuration ChatGPT de l'utilisateur ouvre actuellement les nouveaux fils en GPT-6 High. Si le sélecteur est accessible, l'extension tente toujours de sélectionner ce mode. Si le sélecteur est absent, ambigu ou si son inspection échoue, elle **ne choisit pas Work** et poursuit avec le modèle courant. La sélection effective n'est alors **pas garantie par l'extension**. Les validations GitHub, le contrôle de l'onglet, le compositeur et les reçus demeurent obligatoires.

L'état durable `freshPending` comprend déjà l'identifiant numérique `tabId` du rôle. La 1.7.19 reprend les phases `navigation` **et** `ready` dans cet onglet même quand son titre reste temporairement `ChatGPT`, sans le rouvrir. La fenêtre étroite après validation de la nouvelle page mais avant création du reçu ne bloque plus la reprise : s'il n'existe pas encore de reçu, le premier envoi se poursuit; si un reçu est incertain, la protection contre les doubles envois demeure stricte. Un redémarrage volontaire de la surveillance, qui renouvelle l'identifiant d'activation, peut aussi réadopter l'onglet pendant cette phase **seulement si aucun reçu n'existe**. Après le premier envoi, l'URL `/c/...` devient la destination; le titre provisoire n'est pas mémorisé comme identité. La case décochée ajoute ensuite les prochains billets au même fil par cette URL.

**Mise à jour de la 1.7.18 actuellement bloquée :** ne pas fermer, renommer ni réaffecter l'onglet du Programmeur ouvert sur une page ChatGPT vierge. Extraire la 1.7.19 et remplacer les fichiers dans le **répertoire déjà chargé** de l'extension, sans supprimer son stockage ni installer de deuxième extension. Aller sur `edge://extensions`, cliquer sur **Recharger**; le manifeste doit indiquer **1.7.19**. La surveillance active reprend automatiquement au prochain contrôle GitHub (habituellement dans les 30 secondes). Pour déclencher immédiatement le contrôle, cliquer une seule fois sur **Lire GitHub**; **ne pas utiliser « Réessayer volontairement »** pour la panne de sélecteur, car aucun reçu n'a été créé à ce stade. Le prochain contrôle réutilise `freshPending.tabId` plutôt que le titre temporaire de l'onglet.

Si un reçu d'envoi est déjà marqué `uncertain`/`committing` après une interruption, ne pas forcer automatiquement un second envoi : vérifier d'abord si l'invitation est visible dans ChatGPT ou si la prise en charge a été publiée sur GitHub. Les tests automatisés vérifient la reprise à partir des phases `navigation` et `ready`, le titre provisoire `ChatGPT`, le contrôle de l'onglet et la reprise en mode append. Ils ne peuvent pas garantir l'apparence future du sélecteur ChatGPT d'Edge.

## Observatoire des projets — 1.7.20

Le tableau de bord n'est plus propre à ConsoleVR : son titre est générique. Le nom du projet, la série, son mandat et la borne estimée proviennent du masterticket canonique du dépôt choisi dans les réglages. Le ruban affiche seulement le rôle actif et son billet, lorsqu'ils sont observés par le relais. Le Gantt précède les courbes ; les quatre cartes « live » et les textes d'interprétation ont été retirés.

Les courbes emploient des couleurs différentes des trois rôles. Les livraisons, examens QA et décisions Architecte ne sont pas confondus. Un billet entre dans « acceptés » uniquement si une autorisation Architecte référence exactement le commit de vérification QA complète, avec une décision de continuation/correction/pause/clôture ; `reculer` est un refus, et une reprise du même numéro ne compte jamais deux fois. Les reprises et blocages apparaissent aussi sous forme de hachures datées, du statut `bloque` jusqu'à l'autorisation citant exactement `blocage_commit_sha`. Les objectifs successifs sont lus dans l'historique réel du masterticket : aucune cible ancienne n'est extrapolée lorsqu'elle est absente. Les délais sont des durées calendaires entre commits, jamais du temps CPU ni la preuve de tests ou de compilation.

Graphiques : livrés acceptés / cible révisée, reste à accepter, livraisons vs examens vs acceptations, délai entre acceptations, blocages/reculs/corrections. L'historique GitHub est consulté en lecture seule et mis en cache par SHA de commit ; aucun schéma, gabarit ni état de rôle GitHub n'est modifié.

## Version 1.8.0 — Corrections statiques et plan figé

Le rapport et le verdict JSON doivent être cohérents. Un rapport absent ou annonçant des divergences ne permet pas un envoi Architecte malgré un JSON marqué conforme; un rapport disant « Aucune divergence constatée. » contredit un JSON de correction et suspend ce signal incohérent.

La QA publie `rapport.md` et `verification.json` ensemble. Le JSON reprend cycle, billet, source, autorisation et tentative. Avec `destination=dev`, `resultat=a_corriger`, un `nombre_constats` positif et les constats structurés (id, exigence, fichier, symbole, preuve, consequence), le Programmeur reçoit la réparation du même billet. Il livre `tentative=N+1`, conserve l’autorisation initiale, utilise comme `base_sha` le code vérifié et référence le vrai `retour_qa_commit_sha`. La livraison corrigée retourne à QA. L’Architecte ne reçoit que `destination=arch`, `resultat=conforme`, `examen=complet`, zéro constat. Les vérifications incohérentes ne déclenchent aucun Architecte.

Les anciens signaux sans tentative valent tentative 1. Une ancienne vérification exige son rapport : « Aucune divergence constatée. » sans constat contradictoire permet l’Architecte; des divergences démontrées retournent au Programmeur. Un ancien résultat ambigu reste à clarifier, sans succès inventé. Les reçus et les prises distinguent les tentatives et les commits de retour QA; une ancienne prise du même cycle ne consomme pas la correction suivante. Aucun renvoi périodique n’a été ajouté.

Les statuts historiques `bloque` ne provoquent plus de morcellement : le Programmeur reprend le checkpoint du même billet. Le gabarit lui interdit désormais de déclarer une livraison incomplète ou de demander le redécoupage. Une erreur technique de transport reste observable; le plugin ne peut garantir que GitHub ou ChatGPT restent accessibles et ne fabrique jamais une livraison pour contourner cette erreur.

Le changement de plan `.64 -> pont administratif .65 -> .66 ... .175` est porté uniquement par les documents GitHub et le prochain travail de l’Architecte. Aucune condition propre à ce dépôt, à ces numéros ou à ce pont n’est codée dans le routage. La validation `bridge.test.cjs` vérifie même ce passage avec le sélecteur historique 1.7.20. Le pont ne devient pas un faux billet de code livré. Le tableau de progression peut lire une ligne générique `Billets administratifs : ...` pour les exclure du nombre de billets à programmer. Les périodes de correction QA sont visualisées à partir des vrais signaux.

Les agents ConsoleVR restent en contrôle statique seulement; le créateur compile et teste les candidats. Les tests de cette extension sont des simulations locales de son transport et ne sont pas des tests ConsoleVR ou de la session Edge réelle.

Installation : remplacer le contenu du même dossier d’extension Edge déjà chargé, puis cliquer Recharger dans `edge://extensions`. Conserver l’ID et le stockage pour garder conversations, réglages, reçus et historique. Vérifier version 1.8.0. Puis reprendre la surveillance à la QA de `.64`; aucune reprise ne doit réexécuter le Programmeur `.64` déjà livré en l’absence d’un retour QA.
