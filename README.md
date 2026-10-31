# Relais GitHub des agents — outils de gestion

Branche `outils-gestion` du dépôt `Tabernacle666/ConsoleVR`. **Branche autonome pour l'extension Edge et son observateur** : aucun fichier de cette branche n'a besoin d'être fusionné dans `main` ni `dev`.

## Contenu

- `reveil_agents/manifest.json`, `reveil_agents/service-worker.js` et modules JavaScript : extension Edge/Chromium Manifest V3, version **1.8.6**.
- `reveil_agents/dashboard.html`, `reveil_agents/dashboard.js`, `reveil_agents/gauge-data.js`, `reveil_agents/gantt-data.js`, `reveil_agents/progress-data.js`, `reveil_agents/telemetry-data.js` : observateur, cadrans et instrument personnalisable (10 métriques, 5 simultanées).
- `validation/` : tests unitaires et de routage, fixtures et résultats de référence ; ces fichiers n'appartiennent pas à la distribution du projet ConsoleVR.
- `LISEZMOI.md` : documentation et historique de l'extension.

## Synchroniser la branche seulement

```powershell
git clone --branch outils-gestion --single-branch https://github.com/Tabernacle666/ConsoleVR.git D:\GITLINK\RelaisAgents
```

Pour les mises à jour suivantes dans ce dossier :

```powershell
git pull --ff-only origin outils-gestion
```

Le sous-dossier `reveil_agents/` du clone est **directement chargeable** via Edge → `edge://extensions` → Mode développeur → Charger l'extension non empaquetée. Sélectionner `D:\GITLINK\RelaisAgents\\reveil_agents` (il contient `manifest.json`).

**Attention aux reçus existants** : changer le chemin d'une extension non empaquetée peut changer son identifiant Edge et donc son espace `chrome.storage.local`. Pour préserver conversations, réglages et reçus, privilégier le même chemin de dossier qu'avec l'extension déjà chargée, ou conserver l'ancienne extension active jusqu'à la migration volontaire des réglages. Ne pas effacer les reçus pour débloquer un cycle.

## Vérifications locales

```powershell
Get-ChildItem validation\*.test.cjs | ForEach-Object { node $_.FullName }
```

Si les modules sources `github-worker.js`, `background.js` ou autres changent, reconstruire `reveil_agents/service-worker.js` avec :

```powershell
node validation\build-service-worker.cjs
```

La branche est réutilisable avec plusieurs dépôts : le dépôt, la branche source et les destinations des rôles sont configurés dans l'extension, non dans Git. Aucun jeton d'accès ou donnée de navigateur n'est versionné.
