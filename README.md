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

The Firebase project is `reading-shelf-2617`. The public site is [https://reading-shelf-2617.web.app](https://reading-shelf-2617.web.app).

Cloud Firestore is in production mode, and the rules in `firestore.rules` are deployed. Hosting serves the static export in `out/`.

Guest shelves work on the public site. Email and password accounts need Authentication turned on once in the Firebase console: open Authentication, choose Get started, then enable the Email/Password provider. This app does not use anonymous sign-in or a GitHub sign-in button. After that, authorized domains should include `localhost`, `reading-shelf-2617.firebaseapp.com`, and `reading-shelf-2617.web.app`.

To publish a new version:

```bash
npm run build
npx firebase-tools deploy --only firestore:rules,hosting
```

GitHub Actions runs `npm test` and `npm run build` on every push.
