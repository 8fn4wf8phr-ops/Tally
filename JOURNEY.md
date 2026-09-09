# Build Journey: Tally

How Tally came together, from idea to a working native iOS app.

## 1. The idea

This one started differently from the other projects — instead of picking something to build, it started with a real need: a simple way to get reminded to take medication or stick to a routine, without handing personal health info to some app's servers. The requirements were clear from the start: simple, offline, private — no accounts, no cloud sync, nothing leaves the device. Capacitor was the pick for wrapping a plain HTML/CSS/JS app as a real iOS app, rather than learning a whole new framework like React Native just for this.

## 2. Naming it

"MedReminder" was the working name, but it didn't stick — too clinical, and too narrow (the app is really for any daily routine, not just meds). After going back and forth on options, **Tally** won: short, easy to say, and it fits the idea of the app — literally tallying off what you've done for the day.

## 3. Scoping v1

It would have been easy to scope this too big — dosage tracking, history, multiple times a day, streaks. Instead v1 stayed deliberately small: add a reminder with a name and a time, get a local notification, mark it taken, edit or delete it. A reminder's "taken" status is just a stored date string compared against today's date, so it resets itself every day automatically — no scheduled job, no extra logic required.

## 4. Building the web app

The core app is vanilla JS: a form to add reminders, a list that renders from an in-memory array backed by `@capacitor/preferences` (falling back to `localStorage` when just previewing in a browser), and `@capacitor/local-notifications` to schedule a daily repeating notification at the chosen time. It was smoke-tested in a browser first — adding, editing, deleting, and marking reminders taken — before ever touching Xcode, to catch bugs early and cheaply.

## 5. Going native

Getting from a web app to something installable on a phone meant a first for this set of projects: a real build step. Vite bundles the ES module imports Capacitor needs, `npx cap add ios` scaffolds the native Xcode project, and the whole thing gets built and signed from Xcode itself. This step also couldn't run in a sandboxed environment — installing dependencies, building, and adding the iOS platform all had to happen in a real local terminal, on the real machine, to get real native tooling and network access.

## 6. Making it pop

The first working version used a muted, warm color palette. After living with it for a bit, it needed more energy — so it got an electric-teal accent color, a small animated accent mark next to the title, a glow-and-press effect on the add button, soft shadows on reminder cards, and a bouncy check-off animation. Small things, but they make the app feel alive rather than just functional.

## What's next

- Open it in Xcode and actually run it on a phone for the first time
- App icon and launch screen
- Push notification permission flow polish
- Maybe: multiple times per day for a single reminder
- Maybe: a simple weekly view of what's been taken
