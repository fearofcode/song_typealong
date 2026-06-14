# Song Typealong

Song Typealong is a small browser app for practicing lyrics while a YouTube song plays. It is not karaoke and it does not try to sync each word to the music. It just keeps track of the next word you need to type and lets you move through the lyrics at your own pace.

The app runs as plain static files: no build step, no install step, and no server-side code. Songs, lyrics, and playlists are stored in your browser's local storage. You can export your data to JSON and import it again later.

Note that this app is not fully tested. In particular export and import have not been properly tested!

## Run Locally

From this directory, start any simple static server:

```sh
python3 -m http.server
```

Then open:

```text
http://localhost:8000/
```

If you have Node installed, this also works:

```sh
npx serve .
```

Or with a newer Node version:

```sh
npx http-server .
```

You can also host the files directly on GitHub Pages.

## Files

- `index.html` is the app shell.
- `styles.css` has the dark mode styling.
- `app.js` has the playlist editor, import/export, YouTube player, and typing logic.
