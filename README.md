# Shelf

A reading shelf. Search Open Library, then keep the cover, author, and year.

Accounts use Firebase Authentication and Cloud Firestore. GitHub is a sign-in provider through Firebase. Without Firebase environment variables the shelf still runs: guest books stay in this browser until its data is cleared, and GitHub sign-in stays off.

## Run it

```bash
npm install
npm test
npm run dev
```

## Connect Firebase and GitHub

1. Create a Firebase project and a web app. Set that project id in `.firebaserc`.
2. Copy `.env.example` to `.env.local` and fill in the web app config. Those values are the public client config, not a service account.
3. In Authentication, enable Anonymous, Email/Password, and GitHub.
4. In GitHub, create an OAuth app. Set the callback URL to `https://YOUR_PROJECT.firebaseapp.com/__/auth/handler` and paste the client id and secret into the Firebase GitHub provider.
5. Add this site’s domain to Authentication authorized domains.
6. Deploy the rules in `firestore.rules`: `npx firebase-tools deploy --only firestore:rules`.
7. Build with the env vars set, then deploy hosting from the `out` folder if you host on Firebase: `npx firebase-tools deploy --only hosting`.

A guest is an anonymous Firebase user. Their books stay with that browser session until the browser data is cleared, or until they create an account, which keeps the same shelf. GitHub Actions runs `npm test` and `npm run build` on every push.
