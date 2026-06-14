# Song Typealong

Song Typealong is a small browser app for practicing typing song lyrics while a YouTube video of that song plays. It is not karaoke and it does not try to sync each word to the music. It just keeps track of the next word you need to type and lets you move through the lyrics at your own pace.

The app runs as plain static files: no build step, no install step, and no server-side code. Songs, lyrics, and playlists are stored in your browser's local storage. You can export your data to JSON and import it again later.

Note that this app is not fully tested. In particular export and import have only briefly been tested.

## Run Locally

From this directory, start any simple static server:

```sh
python3 -m http.server
```

Then open:

```text
http://localhost:8000/
```

If you start the app on a different port, it won't load your previously saved `localStorage` data, so load on the same port every time for the persistence behavior you are probably expecting.

If you have Node installed, this also works:

```sh
npx serve .
```

Or with a newer Node version:

```sh
npx http-server .
```

Once the app has been tested more thoroughly, it will be hosted on GitHub Pages so that you don't have to run the app locally.