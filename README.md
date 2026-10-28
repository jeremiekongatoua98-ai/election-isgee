# Élections étudiantes ISGEE

Prototype serveur local pour préparer une démonstration de vote partagé.

## Démarrer dans VS Code

Installe Node.js 18 ou plus récent, ouvre le dossier du projet dans VS Code, puis dans le terminal PowerShell choisis un mot de passe d’au moins 8 caractères et saisis :

```powershell
$env:ADMIN_PASSWORD = "choisir-un-mot-de-passe-de-8-caracteres-minimum"
npm start
```

Ouvre `http://localhost:8000`. Garde ce terminal ouvert. Le mot de passe n’est plus inscrit dans le code.

Pour partager une démonstration depuis ton ordinateur, ouvre un second terminal et lance :

```powershell
cloudflared tunnel --url http://localhost:8000
```

Partage l’adresse `trycloudflare.com` affichée. Le serveur et le tunnel doivent rester lancés. L’adresse temporaire change au prochain démarrage.

## Préparer une démonstration

1. Ouvre **Administration** et connecte-toi avec `ADMIN_PASSWORD`.
2. Colle une ligne par étudiant sous la forme `identifiant;nom complet` et crée les codes.
3. Télécharge le CSV contenant les codes générés; distribue chaque code confidentiellement à la personne concernée. Les codes ne peuvent pas être réaffichés.
4. Ouvre le scrutin. Chaque étudiant utilise son identifiant et son code pour voter une fois.
5. L’administration voit la participation et les résultats agrégés; aucun bulletin n’est lié à un nom.

Les candidats sont des exemples inscrits dans `app.js` et `server.js` : remplace-les par les candidats validés avant une démonstration.

## Données et limites

Les données persistantes sont conservées dans `data/election.json` sur cet ordinateur. Fais une sauvegarde protégée avant d’ouvrir le scrutin. N’efface pas le fichier pendant l’élection. Les codes sont conservés sous forme d’empreintes; les bulletins ne sont conservés que dans les totaux par candidat. L’export administrateur liste les inscrits et leur statut de participation, jamais leur choix.

Ce prototype est destiné à une présentation technique et à des essais. Un tunnel temporaire expose le site à toute personne qui possède le lien, l’adresse change et le service dépend de ton ordinateur et de ta connexion. Avant un vote officiel, l’université doit valider l’authentification des étudiants, les règles électorales, les sauvegardes, la confidentialité, la sécurité, l’accessibilité et le dispositif de secours avec son service informatique et son responsable électoral. Les codes individuels et le mot de passe administrateur sont sensibles; distribue-les séparément et ne partage pas le CSV des codes.

