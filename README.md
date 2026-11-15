# Shelf

A reading shelf. Search Open Library, then keep the cover, author, and year.

Accounts and saved books use Firebase Authentication and Cloud Firestore. The public site is Firebase Hosting, the same kind of link as Study Deck and Puzzle Cube.

A shelf can be kept without an account. Those books stay in this browser. Registering or signing in moves them onto the account.

## Run it

```bash
npm install
npm test
npm run dev
```

Copy `.env.example` to `.env.local` and paste the web app config from Firebase Project settings. Those values are the public client config, not a service account. Do not commit `.env.local`.

Without that file the shelf still runs, and books stay in this browser.

## Share it

1. Create a Firebase project and a web app. Set that project id in `.firebaserc`.
2. In Authentication, enable Email/Password. This app does not use anonymous sign-in or a GitHub sign-in button.
3. Create a Cloud Firestore database in production mode.
4. Add this site’s domain to Authentication authorized domains. Firebase Hosting’s `web.app` domain is added for the project, and a custom domain needs to be added too.
5. From this folder, after `npx firebase-tools login`:

```bash
npx firebase-tools deploy --only firestore:rules
npm run build
npx firebase-tools deploy --only hosting
```

The build writes the site to `out/`. The public address is `https://YOUR_PROJECT_ID.web.app`.

GitHub Actions runs `npm test` and `npm run build` on every push.
