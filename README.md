# Tally

A simple, private, offline medication and routine reminder app — no accounts, no cloud, nothing ever leaves your device.

**GitHub:** https://github.com/8fn4wf8phr-ops/Tally

## Features

- Add a reminder with a name and a time
- Local daily notifications — no server, no account, works offline
- Mark a reminder taken for the day with one tap
- "Taken" status resets automatically every day, no cron job needed
- Edit or delete a reminder inline
- Everything is stored on-device — nothing syncs anywhere

## Tech Stack

- Vanilla JavaScript, HTML, CSS — no UI framework
- [Capacitor](https://capacitorjs.com/) to wrap the web app as a native iOS app
- `@capacitor/local-notifications` for daily reminder notifications
- `@capacitor/preferences` for on-device storage (falls back to `localStorage` in a plain browser)
- Vite as the build tool/bundler
- Built and run on real hardware via Xcode

## Getting Started

Install dependencies and build:

```
npm install
npm run build
```

To preview in a browser (notifications and native storage aren't available here, but everything else works):

```
npm run dev
```

To run it as a native iOS app:

```
npx cap sync ios
npx cap open ios
```

Then build and run from Xcode onto a simulator or a real device.

## Project Structure

```
Tally/
├── index.html
├── src/
│   ├── main.js
│   └── style.css
├── capacitor.config.json
└── ios/
    └── App/
```

## Related Projects

- [Weather App](https://github.com/8fn4wf8phr-ops/weather-app) — [live demo](https://weather-app-orcin-one.vercel.app/)
- [Tic-Tac-Toe (React)](https://github.com/8fn4wf8phr-ops/tic-tac-toe-react) — [live demo](https://tic-tac-toe-react-sand-ten.vercel.app/)
- [Calculator](https://github.com/8fn4wf8phr-ops/calculator-app) — [live demo](https://calculator-app-three-sand.vercel.app/)
