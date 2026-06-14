(() => {
  "use strict";

  const STORAGE_KEY = "songTypealongData.v1";
  const DATA_VERSION = 1;

  const app = document.getElementById("app");
  const routeActions = document.getElementById("route-actions");
  const toast = document.getElementById("toast");

  let data = loadData();
  let guard = null;
  let cleanupRoute = null;
  let toastTimer = null;
  let currentHash = normalizeHash(window.location.hash || "#/");
  let approvedHash = null;
  let revertingHash = false;
  let ytApiPromise = null;

  document.addEventListener("click", handleNavigationClick);
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("beforeunload", (event) => {
    if (guard && guard.hasUnsaved()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  if (!window.location.hash) {
    window.location.hash = "#/";
  } else {
    renderRoute();
  }

  function handleNavigationClick(event) {
    const navLink = event.target.closest("[data-nav]");
    if (!navLink) return;

    const href = navLink.getAttribute("href");
    if (!href || !href.startsWith("#")) return;

    event.preventDefault();
    navigate(href);
  }

  function handleHashChange() {
    if (revertingHash) {
      revertingHash = false;
      return;
    }

    const targetHash = normalizeHash(window.location.hash || "#/");
    if (approvedHash === targetHash) {
      approvedHash = null;
      currentHash = targetHash;
      renderRoute();
      return;
    }

    if (!canLeaveCurrentRoute()) {
      revertingHash = true;
      window.location.hash = currentHash;
      return;
    }

    currentHash = targetHash;
    renderRoute();
  }

  function navigate(hash, options = {}) {
    const targetHash = normalizeHash(hash);
    if (!options.force && !canLeaveCurrentRoute()) return false;

    approvedHash = targetHash;
    if (normalizeHash(window.location.hash || "#/") === targetHash) {
      currentHash = targetHash;
      renderRoute();
    } else {
      window.location.hash = targetHash;
    }
    return true;
  }

  function canLeaveCurrentRoute() {
    if (!guard || !guard.hasUnsaved()) return true;
    return window.confirm(guard.message);
  }

  function renderRoute() {
    if (cleanupRoute) {
      cleanupRoute();
      cleanupRoute = null;
    }

    guard = null;
    app.className = "app";
    app.replaceChildren();
    routeActions.replaceChildren();

    const route = parseHash(window.location.hash || "#/");

    if (route.segments.length === 0) {
      renderHome();
      return;
    }

    const [section, id, action] = route.segments;

    if (section === "playlists" && id === "new") {
      renderPlaylistEditor(null);
      return;
    }

    if (section === "playlists" && id && action === "edit") {
      renderPlaylistEditor(id);
      return;
    }

    if (section === "playlists" && id && action === "view") {
      renderPlaylistView(id);
      return;
    }

    if (section === "songs" && id === "new") {
      renderSongEditor(null);
      return;
    }

    if (section === "songs" && id && action === "edit") {
      renderSongEditor(id);
      return;
    }

    if (section === "import") {
      renderImport();
      return;
    }

    if (section === "play") {
      renderPlayer(route.params);
      return;
    }

    renderNotFound();
  }

  function renderHome() {
    setActions([
      linkButton("Create playlist", "#/playlists/new", "primary"),
      linkButton("Create song", "#/songs/new"),
      button("Export data", "ghost", exportData),
      linkButton("Import data", "#/import", "ghost"),
    ]);

    const playlists = data.playlists;
    const songs = getOrderedSongs();

    app.append(
      el(
        "section",
        { className: "page-heading" },
        el("div", {}, el("h1", {}, "Song Typealong"))
      ),
      el(
        "div",
        { className: "home-grid" },
        el(
          "section",
          { className: "section" },
          el("h2", {}, "Playlists"),
          playlists.length
            ? el(
                "ul",
                { className: "item-list" },
                playlists.map((playlist) =>
                  el(
                    "li",
                    { className: "item-card" },
                    el("div", { className: "item-title" }, playlist.name),
                    el(
                      "div",
                      { className: "item-meta" },
                      `${playlist.songIds.length} ${pluralize("song", playlist.songIds.length)}`
                    ),
                    el(
                      "div",
                      { className: "inline-actions" },
                      linkButton("View", `#/playlists/${playlist.id}/view`),
                      linkButton("Edit", `#/playlists/${playlist.id}/edit`, "ghost")
                    )
                  )
                )
              )
            : el("p", { className: "empty" }, "No playlists yet.")
        ),
        el(
          "section",
          { className: "section" },
          el("h2", {}, "Songs"),
          songs.length
            ? el(
                "ul",
                { className: "item-list" },
                songs.map((song) =>
                  el(
                    "li",
                    { className: "item-card" },
                    el("div", { className: "item-title" }, song.title),
                    el("div", { className: "item-meta" }, song.startTimestamp),
                    el(
                      "div",
                      { className: "inline-actions" },
                      linkButton("Play", `#/play?song=${encodeURIComponent(song.id)}`),
                      linkButton("Edit", `#/songs/${song.id}/edit`, "ghost")
                    )
                  )
                )
              )
            : el("p", { className: "empty" }, "No songs yet.")
        )
      )
    );
  }

  function renderPlaylistEditor(playlistId) {
    const savedPlaylist = playlistId ? getPlaylist(playlistId) : null;
    if (playlistId && !savedPlaylist) {
      renderMissing("Playlist not found.");
      return;
    }

    const draft = savedPlaylist
      ? clonePlaylist(savedPlaylist)
      : { id: createId("playlist"), name: "", songIds: [] };
    let savedSnapshot = stableStringify(draft);
    let draftChanged = false;

    setActions([linkButton("Home", "#/", "ghost")]);

    guard = {
      message: "Discard unsaved playlist changes?",
      hasUnsaved: () => draftChanged && stableStringify(draft) !== savedSnapshot,
    };

    const title = savedPlaylist ? "Edit playlist" : "Create playlist";
    const nameInput = input({ value: draft.name, placeholder: "Playlist title", required: true });
    const nameError = fieldError("playlist-title-error");
    const playlistErrorFields = {
      name: { control: nameInput, error: nameError },
    };
    nameInput.setAttribute("aria-describedby", nameError.id);
    const songSelect = el("select");

    nameInput.addEventListener("input", () => {
      draft.name = nameInput.value;
      clearFieldError(nameInput, nameError);
      markChanged();
    });

    const form = el(
      "section",
      { className: "form-panel" },
      el(
        "section",
        { className: "page-heading" },
        el("div", {}, el("h1", {}, title))
      ),
      label("Playlist title", nameInput, "", nameError),
      el(
        "section",
        { className: "section stack" },
        el("h2", {}, "Songs"),
        el("div", { id: "playlist-song-list", className: "stack" }),
        el(
          "div",
          { className: "inline-actions" },
          songSelect,
          button("Add song", "", () => {
            const songId = songSelect.value;
            if (!songId) return;
            draft.songIds.push(songId);
            markChanged();
            renderSongList();
          }),
          linkButton("Create song", "#/songs/new", "ghost")
        )
      ),
      el(
        "div",
        { className: "form-actions" },
        button("Save", "primary", () => {
          draft.name = nameInput.value;
          const errors = validatePlaylistDraft(draft);
          showFieldErrors(playlistErrorFields, errors);
          if (errors.length) {
            showToast(firstValidationMessage(errors));
            return;
          }

          const nextPlaylist = {
            ...clonePlaylist(draft),
            name: draft.name.trim(),
          };

          if (savedPlaylist) {
            const index = data.playlists.findIndex((playlist) => playlist.id === draft.id);
            data.playlists[index] = nextPlaylist;
          } else {
            data.playlists.push(nextPlaylist);
          }

          saveData();
          draft.name = nextPlaylist.name;
          draft.songIds = [...nextPlaylist.songIds];
          nameInput.value = draft.name;
          savedSnapshot = stableStringify(draft);
          draftChanged = false;
          showToast("Playlist saved.");
          navigate(`#/playlists/${draft.id}/edit`, { force: true });
        }),
        button("Discard", "ghost", () => {
          if (!window.confirm("Discard unsaved playlist changes?")) return;
          const fresh = savedPlaylist ? clonePlaylist(getPlaylist(playlistId)) : {
            id: draft.id,
            name: "",
            songIds: [],
          };
          draft.name = fresh.name;
          draft.songIds = fresh.songIds;
          nameInput.value = draft.name;
          clearFieldErrors(playlistErrorFields);
          draftChanged = false;
          savedSnapshot = stableStringify(draft);
          renderSongList();
        }),
        savedPlaylist
          ? button("Delete playlist", "danger", () => {
              if (!window.confirm(`Delete "${savedPlaylist.name}"?`)) return;
              data.playlists = data.playlists.filter((playlist) => playlist.id !== savedPlaylist.id);
              saveData();
              showToast("Playlist deleted.");
              navigate("#/", { force: true });
            })
          : null
      )
    );

    app.append(form);
    renderSongList();

    function markChanged() {
      draftChanged = true;
    }

    function renderSongList() {
      const list = document.getElementById("playlist-song-list");
      const songs = draft.songIds.map(getSong).filter(Boolean);
      list.replaceChildren(
        songs.length
          ? el(
              "ul",
              { className: "item-list" },
              songs.map((song, index) =>
                el(
                  "li",
                  { className: "item-card song-row" },
                  el(
                    "div",
                    { className: "move-actions" },
                    button("Up", "ghost", () => {
                      moveSong(index, index - 1);
                    }, index === 0),
                    button("Down", "ghost", () => {
                      moveSong(index, index + 1);
                    }, index === songs.length - 1)
                  ),
                  el(
                    "div",
                    {},
                    el("div", { className: "item-title" }, song.title),
                    el("div", { className: "item-meta" }, song.startTimestamp)
                  ),
                  el(
                    "div",
                    { className: "inline-actions" },
                    linkButton("Edit", `#/songs/${song.id}/edit`, "ghost"),
                    button("Remove", "danger", () => {
                      draft.songIds.splice(index, 1);
                      markChanged();
                      renderSongList();
                    })
                  )
                )
              )
            )
          : el("p", { className: "empty" }, "No songs in this playlist.")
      );

      const availableSongs = getOrderedSongs().filter((song) => !draft.songIds.includes(song.id));
      songSelect.replaceChildren(
        ...(availableSongs.length
          ? availableSongs.map((song) => el("option", { value: song.id }, song.title))
          : [el("option", { value: "" }, "No available songs")])
      );
      songSelect.disabled = availableSongs.length === 0;
    }

    function moveSong(from, to) {
      if (to < 0 || to >= draft.songIds.length) return;
      const [songId] = draft.songIds.splice(from, 1);
      draft.songIds.splice(to, 0, songId);
      markChanged();
      renderSongList();
    }
  }

  function renderSongEditor(songId) {
    const savedSong = songId ? getSong(songId) : null;
    if (songId && !savedSong) {
      renderMissing("Song not found.");
      return;
    }

    const draft = savedSong
      ? cloneSong(savedSong)
      : {
          id: createId("song"),
          title: "",
          youtubeUrl: "",
          startTimestamp: "00:00",
          lyrics: "",
        };
    let savedSnapshot = stableStringify(draft);
    let draftChanged = false;

    setActions([linkButton("Home", "#/", "ghost")]);

    guard = {
      message: "Discard unsaved song changes?",
      hasUnsaved: () => draftChanged && stableStringify(draft) !== savedSnapshot,
    };

    const titleInput = input({ value: draft.title, placeholder: "Song title", required: true });
    const titleError = fieldError("song-title-error");
    const urlInput = input({
      value: draft.youtubeUrl,
      placeholder: "https://www.youtube.com/watch?v=...",
      required: true,
    });
    const urlError = fieldError("song-url-error");
    const timestampInput = input({
      value: draft.startTimestamp,
      placeholder: "00:00",
      pattern: "\\d+:\\d{1,2}",
      required: true,
    });
    const timestampError = fieldError("song-timestamp-error");
    const lyricsInput = el("textarea", { placeholder: "Paste lyrics here", required: true }, draft.lyrics);
    const lyricsError = fieldError("song-lyrics-error");
    const songErrorFields = {
      title: { control: titleInput, error: titleError },
      youtubeUrl: { control: urlInput, error: urlError },
      startTimestamp: { control: timestampInput, error: timestampError },
      lyrics: { control: lyricsInput, error: lyricsError },
    };

    titleInput.setAttribute("aria-describedby", titleError.id);
    urlInput.setAttribute("aria-describedby", urlError.id);
    timestampInput.setAttribute("aria-describedby", timestampError.id);
    lyricsInput.setAttribute("aria-describedby", lyricsError.id);

    bindInput(titleInput, "title");
    bindInput(urlInput, "youtubeUrl");
    bindInput(timestampInput, "startTimestamp");
    bindInput(lyricsInput, "lyrics");

    app.append(
      el(
        "section",
        { className: "page-heading" },
        el("div", {}, el("h1", {}, savedSong ? "Edit song" : "Create song"))
      ),
      el(
        "section",
        { className: "form-panel" },
        el(
          "div",
          { className: "field-grid" },
          label("Song title", titleInput, "", titleError),
          label("Lyrics start timestamp", timestampInput, "", timestampError),
          label("YouTube URL", urlInput, "wide-field", urlError),
          label("Lyrics", lyricsInput, "wide-field", lyricsError)
        ),
        el(
        "div",
        { className: "form-actions" },
        button("Save", "primary", () => {
          syncDraftFromFields();
          const errors = validateSongDraft(draft);
          showFieldErrors(songErrorFields, errors);
          if (errors.length) {
            showToast(firstValidationMessage(errors));
            return;
          }

            const now = new Date().toISOString();
            const nextSong = {
              ...draft,
              title: draft.title.trim(),
              youtubeUrl: draft.youtubeUrl.trim(),
              startTimestamp: draft.startTimestamp.trim(),
              updatedAt: now,
              createdAt: savedSong ? savedSong.createdAt || now : now,
            };

            data.songs[nextSong.id] = nextSong;
            if (!data.songOrder.includes(nextSong.id)) data.songOrder.push(nextSong.id);
            saveData();
            Object.assign(draft, cloneSong(nextSong));
            savedSnapshot = stableStringify(draft);
            draftChanged = false;
            showToast("Song saved.");
            navigate(`#/songs/${draft.id}/edit`, { force: true });
          }),
          button("Discard", "ghost", () => {
            if (!window.confirm("Discard unsaved song changes?")) return;
            const fresh = savedSong ? cloneSong(getSong(songId)) : {
              id: draft.id,
              title: "",
              youtubeUrl: "",
              startTimestamp: "00:00",
              lyrics: "",
            };
            Object.assign(draft, fresh);
            titleInput.value = draft.title;
            urlInput.value = draft.youtubeUrl;
            timestampInput.value = draft.startTimestamp;
            lyricsInput.value = draft.lyrics;
            clearFieldErrors(songErrorFields);
            draftChanged = false;
            savedSnapshot = stableStringify(draft);
          }),
          savedSong
            ? button("Delete song", "danger", () => {
                if (!window.confirm(`Delete "${savedSong.title}" from every playlist?`)) return;
                delete data.songs[savedSong.id];
                data.songOrder = data.songOrder.filter((id) => id !== savedSong.id);
                data.playlists.forEach((playlist) => {
                  playlist.songIds = playlist.songIds.filter((id) => id !== savedSong.id);
                });
                saveData();
                showToast("Song deleted.");
                navigate("#/", { force: true });
              })
            : null
        )
      )
    );

    function bindInput(field, key) {
      field.addEventListener("input", () => {
        draft[key] = field.value;
        const errorField = songErrorFields[key];
        if (errorField) clearFieldError(errorField.control, errorField.error);
        draftChanged = true;
      });
    }

    function syncDraftFromFields() {
      draft.title = titleInput.value;
      draft.youtubeUrl = urlInput.value;
      draft.startTimestamp = timestampInput.value;
      draft.lyrics = lyricsInput.value;
    }
  }

  function renderPlaylistView(playlistId) {
    const playlist = getPlaylist(playlistId);
    if (!playlist) {
      renderMissing("Playlist not found.");
      return;
    }

    const songs = playlist.songIds.map(getSong).filter(Boolean);
    setActions([
      linkButton("Home", "#/", "ghost"),
      linkButton("Edit playlist", `#/playlists/${playlist.id}/edit`),
      songs.length ? linkButton("Play from top", `#/play?playlist=${encodeURIComponent(playlist.id)}&startSong=${encodeURIComponent(songs[0].id)}`, "primary") : null,
    ]);

    app.append(
      el(
        "section",
        { className: "page-heading" },
        el(
          "div",
          {},
          el("h1", {}, playlist.name),
          el("p", {}, `${songs.length} ${pluralize("song", songs.length)}`)
        )
      ),
      el(
        "section",
        { className: "playlist-view" },
        songs.length
          ? el(
              "ul",
              { className: "item-list" },
              songs.map((song) =>
                el(
                  "li",
                  { className: "item-card" },
                  el("div", { className: "item-title" }, song.title),
                  el("div", { className: "item-meta" }, song.startTimestamp),
                  el(
                    "div",
                    { className: "inline-actions" },
                    linkButton("Start here", `#/play?playlist=${encodeURIComponent(playlist.id)}&startSong=${encodeURIComponent(song.id)}`, "primary"),
                    linkButton("Edit song", `#/songs/${song.id}/edit`, "ghost")
                  )
                )
              )
            )
          : el("p", { className: "empty" }, "No songs in this playlist.")
      )
    );
  }

  function renderImport() {
    setActions([linkButton("Home", "#/", "ghost")]);

    const fileInput = input({ type: "file", accept: "application/json,.json", required: true });
    const status = el("div");

    app.append(
      el(
        "section",
        { className: "page-heading" },
        el("div", {}, el("h1", {}, "Import data"))
      ),
      el(
        "section",
        { className: "import-drop" },
        fileInput,
        el(
          "div",
          { className: "inline-actions" },
          button("Import data", "primary", async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) {
              status.replaceChildren(el("div", { className: "error" }, "Choose a JSON file first."));
              return;
            }

            try {
              const parsed = JSON.parse(await file.text());
              const normalized = normalizeImportedData(parsed);
              const validation = validateImportedData(normalized);
              if (validation.length) {
                status.replaceChildren(el("div", { className: "error" }, validation[0]));
                return;
              }

              if (!window.confirm("Overwrite current local data with this import?")) return;
              data = normalized;
              saveData();
              status.replaceChildren(el("div", { className: "success" }, "Data imported."));
              showToast("Data imported.");
              navigate("#/", { force: true });
            } catch (error) {
              status.replaceChildren(el("div", { className: "error" }, "That file is not valid JSON."));
            }
          })
        ),
        status
      )
    );
  }

  function renderPlayer(params) {
    const queue = buildPlayQueue(params);
    if (!queue.length) {
      renderMissing("No playable songs found.");
      return;
    }

    app.className = "app full-width";

    let queueIndex = 0;
    let currentSong = queue[queueIndex];
    let tokens = tokenizeLyrics(currentSong.lyrics);
    let currentTokenIndex = tokens.length ? 0 : -1;
    let currentInput = "";
    let lyricsReady = parseTimestamp(currentSong.startTimestamp) === 0;
    let started = false;
    let videoEnded = false;
    let lyricComplete = tokens.length === 0;
    let intervalId = null;
    let player = null;
    let fallbackStartedAt = null;
    let hiddenWordInput = null;

    setActions([linkButton("Home", "#/", "ghost")]);
    renderSong();

    cleanupRoute = () => {
      if (intervalId) window.clearInterval(intervalId);
      if (player && typeof player.destroy === "function") player.destroy();
    };

    function renderSong() {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      if (player && typeof player.destroy === "function") {
        player.destroy();
        player = null;
      }

      tokens = tokenizeLyrics(currentSong.lyrics);
      currentTokenIndex = tokens.length ? 0 : -1;
      currentInput = "";
      lyricsReady = parseTimestamp(currentSong.startTimestamp) === 0;
      started = false;
      videoEnded = false;
      lyricComplete = tokens.length === 0;
      fallbackStartedAt = null;

      const videoId = parseYouTubeId(currentSong.youtubeUrl);
      const nextSong = queue[queueIndex + 1] || null;
      const sidebarCompleteAction = nextSong
        ? button("Next song", "", goToNextSong, !lyricComplete)
        : completeHomeButton();
      const lyricsCompleteAction = nextSong
        ? button("Next song", "", goToNextSong, !lyricComplete)
        : completeHomeButton();
      hiddenWordInput = el("textarea", {
        className: "hidden-word-input",
        "aria-label": "Type lyrics word",
        autocomplete: "off",
        autocapitalize: "off",
        spellcheck: "false",
        disabled: true,
      });
      hiddenWordInput.addEventListener("input", () => {
        currentInput = hiddenWordInput.value;
        handleWordInput();
      });
      const lyricsScroll = el("div", { id: "lyrics-scroll", className: "lyrics-scroll" });
      const lyricsPane = el(
        "section",
        { className: "lyrics-pane" },
        el(
          "div",
          { className: "completion-bar" },
          el("div", { id: "completion-status", className: "item-meta" }, ""),
          lyricsCompleteAction
        ),
        hiddenWordInput,
        lyricsScroll
      );
      lyricsPane.addEventListener("click", (event) => {
        if (event.target.closest("a, button")) return;
        focusHiddenInput();
      });

      app.replaceChildren(
        el(
          "section",
          { className: "player-layout" },
          el(
            "aside",
            { className: "video-pane" },
            el("div", { className: "video-frame", id: "video-frame" }),
            el(
              "div",
              { className: "player-meta" },
              el("strong", {}, currentSong.title),
              el("span", {}, "Lyrics in "),
              el("span", { id: "timer", className: "timer" }, formatCountdown(parseTimestamp(currentSong.startTimestamp))),
              el("span", { id: "player-status" }, "")
            ),
            el(
              "div",
              { className: "inline-actions" },
              button("Start", "primary", startPlayback, !videoId),
              sidebarCompleteAction,
              linkButton("Edit song", `#/songs/${currentSong.id}/edit`, "ghost")
            )
          ),
          lyricsPane
        )
      );

      if (!videoId) {
        document.getElementById("video-frame").append(
          el("div", { className: "error" }, "Could not read a YouTube video ID from this URL.")
        );
      } else {
        loadYouTubePlayer(videoId).then((loadedPlayer) => {
          player = loadedPlayer;
          if (started && typeof player.playVideo === "function") {
            player.playVideo();
          }
        });
      }

      renderLyrics();
      updatePlayerChrome();
    }

    function startPlayback(options = {}) {
      if (started) return;

      const shouldPlayVideo = options.playVideo !== false;
      started = true;
      fallbackStartedAt = Date.now();
      const startSeconds = parseTimestamp(currentSong.startTimestamp);
      lyricsReady = startSeconds === 0;

      if (shouldPlayVideo && player && typeof player.playVideo === "function") {
        player.playVideo();
      }

      if (intervalId) window.clearInterval(intervalId);
      intervalId = window.setInterval(updateCountdown, 200);
      updateCountdown();
      renderLyrics();
    }

    function updateCountdown() {
      const timer = document.getElementById("timer");
      const startSeconds = parseTimestamp(currentSong.startTimestamp);
      const currentSeconds = getVideoTime();
      const remaining = Math.max(0, startSeconds - currentSeconds);

      if (timer) timer.textContent = formatCountdown(remaining);
      if (remaining <= 0 && !lyricsReady) {
        lyricsReady = true;
        renderLyrics();
      }
    }

    function getVideoTime() {
      const fallbackSeconds = started && fallbackStartedAt
        ? (Date.now() - fallbackStartedAt) / 1000
        : 0;

      if (player && typeof player.getCurrentTime === "function") {
        const time = player.getCurrentTime();
        if (Number.isFinite(time)) return Math.max(time, fallbackSeconds);
      }
      return fallbackSeconds;
    }

    function renderLyrics() {
      const lyricsScroll = document.getElementById("lyrics-scroll");
      if (!lyricsScroll) return;

      const lines = groupTokensByLine(tokens);
      lyricsScroll.replaceChildren(
        ...(lines.length
          ? lines.map((line) => renderLyricLine(line))
          : [el("p", { className: "empty" }, "No lyrics saved for this song.")])
      );

      syncHiddenInput();
      window.requestAnimationFrame(() => {
        focusHiddenInput();
        ensureCurrentLineVisible();
      });

      updatePlayerChrome();
    }

    function renderLyricLine(line) {
      const lyricText = el("div", { className: "line-text" });
      line.tokens.forEach((token, index) => {
        lyricText.append(renderWord(token));
        if (index < line.tokens.length - 1) lyricText.append(" ");
      });

      const inputEcho = el("div", { className: "input-echo" });
      const currentToken = tokens[currentTokenIndex];
      const isCurrentLine = currentToken && currentToken.lineIndex === line.lineIndex;
      const completedOnLine = line.tokens.filter((token) => token.globalIndex < currentTokenIndex);

      completedOnLine.forEach((token) => {
        inputEcho.append(el("span", { className: "typed-word" }, token.text));
      });

      if (isCurrentLine && !lyricComplete && canTypeCurrentWord()) {
        inputEcho.append(renderTypingEcho());
      } else if (!completedOnLine.length) {
        inputEcho.append(el("span", { className: "input-spacer" }, ""));
      }

      const attrs = { className: "line-pair" };
      if (isCurrentLine) attrs.id = "current-line";
      return el(
        "div",
        attrs,
        lyricText,
        inputEcho
      );
    }

    function renderTypingEcho() {
      const echo = el("span", {
        className: currentInput && !isCurrentInputPrefixCorrect()
          ? "typing-echo input-error"
          : "typing-echo",
        "aria-hidden": "true",
      });
      echo.append(currentInput);
      echo.append(el("span", { className: "typing-cursor" }));
      return echo;
    }

    function renderWord(token) {
      const stateClass = getWordState(token);
      const word = el("span", { className: `word ${stateClass}` });
      if (token.globalIndex === currentTokenIndex && currentInput.trim()) {
        const comparison = getComparison(token.text, currentInput.trim(), token.wordIndex === 0);
        token.text.split("").forEach((letter, index) => {
          const typedLetter = comparison.typed[index];
          let letterClass = "letter";
          if (typedLetter !== undefined) {
            letterClass += comparison.matches[index] ? " match" : " wrong";
          }
          word.append(el("span", { className: letterClass }, letter));
        });
      } else {
        word.textContent = token.text;
      }
      return word;
    }

    function getWordState(token) {
      if (token.globalIndex < currentTokenIndex) return "past";
      if (token.globalIndex > currentTokenIndex || lyricComplete) return "future";
      if (!canTypeCurrentWord()) return "waiting";
      return currentInput && !isCurrentInputPrefixCorrect() ? "current wrong" : "current";
    }

    function handleWordInput() {
      const token = tokens[currentTokenIndex];
      if (!token) return;

      const trimmed = currentInput.trim();
      if (isWordComplete(token.text, trimmed, token.wordIndex === 0)) {
        currentTokenIndex += 1;
        currentInput = "";
        if (hiddenWordInput) hiddenWordInput.value = "";
        if (currentTokenIndex >= tokens.length) {
          lyricComplete = true;
        }
      }

      renderLyrics();
    }

    function isCurrentInputPrefixCorrect() {
      const token = tokens[currentTokenIndex];
      if (!token) return true;
      const typed = currentInput.trim();
      if (!typed) return true;
      const comparison = getComparison(token.text, typed, token.wordIndex === 0);
      return comparison.validPrefix;
    }

    function updatePlayerChrome() {
      const status = document.getElementById("player-status");
      const completion = document.getElementById("completion-status");
      const nextButtons = app.querySelectorAll("button");
      const nextSong = queue[queueIndex + 1] || null;

      if (status) {
        status.textContent = videoEnded && lyricComplete ? "Video and lyrics complete" : "";
      }

      if (completion) {
        const done = lyricComplete ? tokens.length : Math.max(0, currentTokenIndex);
        completion.textContent = `${done} / ${tokens.length} words`;
      }

      nextButtons.forEach((candidate) => {
        if (candidate.textContent === "Next song") {
          candidate.disabled = !nextSong || !lyricComplete;
        }
      });

      app.querySelectorAll("[data-complete-only]").forEach((candidate) => {
        candidate.hidden = !lyricComplete;
      });
    }

    function canTypeCurrentWord() {
      return started && lyricsReady && !lyricComplete && currentTokenIndex >= 0;
    }

    function syncHiddenInput() {
      if (!hiddenWordInput) return;
      hiddenWordInput.disabled = !canTypeCurrentWord();
      if (hiddenWordInput.value !== currentInput) hiddenWordInput.value = currentInput;
    }

    function focusHiddenInput() {
      if (!hiddenWordInput || hiddenWordInput.disabled) return;
      hiddenWordInput.focus({ preventScroll: true });
      hiddenWordInput.setSelectionRange(hiddenWordInput.value.length, hiddenWordInput.value.length);
    }

    function ensureCurrentLineVisible() {
      const lyricsScroll = document.getElementById("lyrics-scroll");
      const currentLine = document.getElementById("current-line");
      if (!lyricsScroll || !currentLine) return;

      const target = currentLine.querySelector(".input-echo") || currentLine;
      const targetRect = target.getBoundingClientRect();
      const scrollRect = lyricsScroll.getBoundingClientRect();
      const padding = 28;
      const scrollable = lyricsScroll.scrollHeight > lyricsScroll.clientHeight + 1;

      if (scrollable) {
        if (targetRect.bottom > scrollRect.bottom - padding) {
          lyricsScroll.scrollBy({
            top: targetRect.bottom - scrollRect.bottom + padding,
            behavior: "smooth",
          });
        } else if (targetRect.top < scrollRect.top + padding) {
          lyricsScroll.scrollBy({
            top: targetRect.top - scrollRect.top - padding,
            behavior: "smooth",
          });
        }
        return;
      }

      const viewportBottom = window.innerHeight - padding;
      if (targetRect.bottom > viewportBottom || targetRect.top < padding) {
        target.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    function goToNextSong() {
      if (!lyricComplete || !queue[queueIndex + 1]) return;
      queueIndex += 1;
      currentSong = queue[queueIndex];
      renderSong();
    }

    function loadYouTubePlayer(videoId) {
      const frame = document.getElementById("video-frame");
      frame.replaceChildren(el("div", { id: "youtube-player" }));

      return ensureYouTubeApi().then(
        () =>
          new Promise((resolve) => {
            const newPlayer = new window.YT.Player("youtube-player", {
              videoId,
              playerVars: {
                enablejsapi: 1,
                playsinline: 1,
                rel: 0,
                modestbranding: 1,
              },
              events: {
                onReady: () => resolve(newPlayer),
                onStateChange: (event) => {
                  if (event.data === window.YT.PlayerState.PLAYING && !started) {
                    startPlayback({ playVideo: false });
                  }
                  if (event.data === window.YT.PlayerState.ENDED) {
                    videoEnded = true;
                    updatePlayerChrome();
                  }
                },
              },
            });
          })
      );
    }

    function completeHomeButton() {
      const home = linkButton("Home", "#/", "primary");
      home.dataset.completeOnly = "true";
      home.hidden = !lyricComplete;
      return home;
    }
  }

  function renderMissing(message) {
    setActions([linkButton("Home", "#/", "ghost")]);
    app.append(
      el(
        "section",
        { className: "page-heading" },
        el("div", {}, el("h1", {}, message))
      )
    );
  }

  function renderNotFound() {
    renderMissing("Page not found.");
  }

  function setActions(actions) {
    routeActions.replaceChildren(...actions.filter(Boolean));
  }

  function loadData() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();

    try {
      const parsed = JSON.parse(raw);
      return normalizeImportedData(parsed, { allowEmpty: true });
    } catch (error) {
      return emptyData();
    }
  }

  function saveData() {
    data = normalizeImportedData(data, { allowEmpty: true });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  }

  function emptyData() {
    return {
      version: DATA_VERSION,
      playlists: [],
      songs: {},
      songOrder: [],
    };
  }

  function normalizeImportedData(source) {
    const normalized = emptyData();
    const incoming = source && typeof source === "object" ? source : {};

    if (Array.isArray(incoming.playlists)) {
      normalized.playlists = incoming.playlists.map((playlist) => ({
        id: String(playlist.id || createId("playlist")),
        name: String(playlist.name || "").trim(),
        songIds: Array.isArray(playlist.songIds)
          ? playlist.songIds.map(String)
          : [],
      }));
    }

    if (incoming.songs && typeof incoming.songs === "object" && !Array.isArray(incoming.songs)) {
      Object.entries(incoming.songs).forEach(([id, song]) => {
        if (!song || typeof song !== "object") return;
        const songId = String(song.id || id);
        normalized.songs[songId] = {
          id: songId,
          title: String(song.title || ""),
          youtubeUrl: String(song.youtubeUrl || ""),
          startTimestamp: String(song.startTimestamp || "00:00"),
          lyrics: String(song.lyrics || ""),
          createdAt: song.createdAt ? String(song.createdAt) : "",
          updatedAt: song.updatedAt ? String(song.updatedAt) : "",
        };
      });
    }

    const order = Array.isArray(incoming.songOrder) ? incoming.songOrder.map(String) : [];
    normalized.songOrder = order.filter((id, index) => normalized.songs[id] && order.indexOf(id) === index);
    Object.keys(normalized.songs).forEach((id) => {
      if (!normalized.songOrder.includes(id)) normalized.songOrder.push(id);
    });

    normalized.playlists = normalized.playlists.map((playlist) => ({
      ...playlist,
      songIds: playlist.songIds.filter((id, index) => normalized.songs[id] && playlist.songIds.indexOf(id) === index),
    }));

    return normalized;
  }

  function validateImportedData(imported) {
    const errors = [];
    if (!imported || typeof imported !== "object") {
      return ["Import must be a JSON object."];
    }

    if (!imported.playlists.length && !imported.songOrder.length) {
      errors.push("Import must contain at least one playlist or song.");
    }

    const playlistIds = new Set();
    imported.playlists.forEach((playlist) => {
      if (!playlist.id) errors.push("Every playlist needs an ID.");
      if (!playlist.name.trim()) errors.push("Every playlist needs a title.");
      if (playlistIds.has(playlist.id)) errors.push("Playlist IDs must be unique.");
      playlistIds.add(playlist.id);
    });

    const songIds = new Set();
    imported.songOrder.forEach((id) => {
      const song = imported.songs[id];
      if (!song) errors.push("Song order references a missing song.");
      if (songIds.has(id)) errors.push("Song IDs must be unique.");
      songIds.add(id);
      validateSongDraft(song).forEach((error) => errors.push(validationMessage(error)));
    });

    return errors;
  }

  function validateSongDraft(song) {
    const errors = [];
    if (!song.title.trim()) {
      errors.push({ field: "title", message: "Song title is required." });
    }
    if (!song.youtubeUrl.trim()) {
      errors.push({ field: "youtubeUrl", message: "YouTube URL is required." });
    } else if (!parseYouTubeId(song.youtubeUrl)) {
      errors.push({ field: "youtubeUrl", message: "YouTube URL needs a recognizable video ID." });
    }
    if (!String(song.startTimestamp || "").trim()) {
      errors.push({ field: "startTimestamp", message: "Lyrics start timestamp is required." });
    } else if (!isValidTimestamp(song.startTimestamp)) {
      errors.push({ field: "startTimestamp", message: "Timestamp must look like MM:SS." });
    }
    if (!song.lyrics.trim()) {
      errors.push({ field: "lyrics", message: "Lyrics are required." });
    }
    return errors;
  }

  function validatePlaylistDraft(playlist) {
    const errors = [];
    if (!playlist.name.trim()) {
      errors.push({ field: "name", message: "Playlist title is required." });
    }
    playlist.songIds.forEach((songId) => {
      if (!data.songs[songId]) {
        errors.push({ field: "songIds", message: "Playlist contains a missing song." });
      }
    });
    return errors;
  }

  function exportData() {
    const exportable = normalizeImportedData(data, { allowEmpty: true });
    const blob = new Blob([JSON.stringify(exportable, null, 2)], {
      type: "application/json",
    });
    const date = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `song-typealong-backup-${date}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }

  function getPlaylist(id) {
    return data.playlists.find((playlist) => playlist.id === id) || null;
  }

  function getSong(id) {
    return data.songs[id] || null;
  }

  function getOrderedSongs() {
    return data.songOrder.map((id) => data.songs[id]).filter(Boolean);
  }

  function buildPlayQueue(params) {
    const songId = params.get("song");
    const playlistId = params.get("playlist");
    const startSongId = params.get("startSong");

    if (songId) {
      const song = getSong(songId);
      return song ? [song] : [];
    }

    if (playlistId) {
      const playlist = getPlaylist(playlistId);
      if (!playlist) return [];
      const songs = playlist.songIds.map(getSong).filter(Boolean);
      const startIndex = Math.max(0, songs.findIndex((song) => song.id === startSongId));
      return songs.slice(startIndex);
    }

    return [];
  }

  function tokenizeLyrics(lyrics) {
    const tokens = [];
    String(lyrics || "")
      .split(/\r?\n/)
      .forEach((lineText, lineIndex) => {
        const words = lineText.trim().split(/\s+/).filter(Boolean);
        words.forEach((word, wordIndex) => {
          tokens.push({
            text: word,
            lineIndex,
            wordIndex,
            globalIndex: tokens.length,
          });
        });
      });
    return tokens;
  }

  function groupTokensByLine(tokens) {
    const groups = [];
    tokens.forEach((token) => {
      let group = groups.find((candidate) => candidate.lineIndex === token.lineIndex);
      if (!group) {
        group = { lineIndex: token.lineIndex, tokens: [] };
        groups.push(group);
      }
      group.tokens.push(token);
    });
    return groups;
  }

  function isWordComplete(expected, typed, ignoreCase) {
    const comparison = getComparison(expected, typed, ignoreCase);
    return comparison.complete;
  }

  function getComparison(expected, typed, ignoreCase) {
    const expectedChars = Array.from(expected);
    const typedChars = Array.from(typed);
    const matches = expectedChars.map((char, index) =>
      charsEqual(char, typedChars[index], ignoreCase)
    );
    const validPrefix = typedChars.every((char, index) =>
      charsEqual(expectedChars[index], char, ignoreCase)
    );
    const complete = typedChars.length === expectedChars.length && validPrefix;

    return {
      typed: typedChars,
      matches,
      validPrefix,
      complete,
    };
  }

  function charsEqual(expected, typed, ignoreCase) {
    if (typed === undefined || expected === undefined) return false;
    return ignoreCase
      ? expected.toLocaleLowerCase() === typed.toLocaleLowerCase()
      : expected === typed;
  }

  function parseYouTubeId(url) {
    const value = String(url || "").trim();
    if (!value) return "";

    try {
      const parsed = new URL(value);
      if (parsed.hostname.includes("youtu.be")) {
        return parsed.pathname.replace("/", "").split("/")[0] || "";
      }
      if (parsed.hostname.includes("youtube.com")) {
        if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
        const parts = parsed.pathname.split("/").filter(Boolean);
        const embedIndex = parts.findIndex((part) => part === "embed" || part === "shorts");
        if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1];
      }
    } catch (error) {
      const match = value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
      return match ? match[1] : "";
    }

    return "";
  }

  function isValidTimestamp(value) {
    const match = String(value || "").trim().match(/^(\d+):(\d{1,2})$/);
    if (!match) return false;
    const seconds = Number(match[2]);
    return seconds >= 0 && seconds < 60;
  }

  function parseTimestamp(value) {
    if (!isValidTimestamp(value)) return 0;
    const [, minutes, seconds] = String(value).trim().match(/^(\d+):(\d{1,2})$/);
    return Number(minutes) * 60 + Number(seconds);
  }

  function formatCountdown(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function ensureYouTubeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (ytApiPromise) return ytApiPromise;

    ytApiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previous === "function") previous();
        resolve();
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.append(script);
    });
    return ytApiPromise;
  }

  function parseHash(hash) {
    const clean = normalizeHash(hash).slice(1);
    const [path, query = ""] = clean.split("?");
    return {
      segments: path.split("/").filter(Boolean),
      params: new URLSearchParams(query),
    };
  }

  function normalizeHash(hash) {
    if (!hash || hash === "#") return "#/";
    return hash.startsWith("#") ? hash : `#${hash}`;
  }

  function createId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function clonePlaylist(playlist) {
    return {
      id: playlist.id,
      name: playlist.name,
      songIds: [...playlist.songIds],
    };
  }

  function cloneSong(song) {
    return {
      id: song.id,
      title: song.title,
      youtubeUrl: song.youtubeUrl,
      startTimestamp: song.startTimestamp,
      lyrics: song.lyrics,
      createdAt: song.createdAt || "",
      updatedAt: song.updatedAt || "",
    };
  }

  function stableStringify(value) {
    return JSON.stringify(value);
  }

  function pluralize(word, count) {
    return count === 1 ? word : `${word}s`;
  }

  function fieldError(id) {
    return el("div", {
      className: "field-error",
      id,
      role: "alert",
      "aria-live": "polite",
    });
  }

  function showFieldErrors(fields, errors) {
    clearFieldErrors(fields);
    errors.forEach((error) => {
      const target = fields[error.field];
      if (!target || target.error.textContent) return;
      target.error.textContent = error.message;
      target.control.setAttribute("aria-invalid", "true");
    });
  }

  function clearFieldErrors(fields) {
    Object.values(fields).forEach(({ control, error }) => {
      clearFieldError(control, error);
    });
  }

  function clearFieldError(control, error) {
    control.removeAttribute("aria-invalid");
    error.textContent = "";
  }

  function firstValidationMessage(errors) {
    return errors.length ? validationMessage(errors[0]) : "";
  }

  function validationMessage(error) {
    return typeof error === "string" ? error : error.message;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("visible");
    }, 2600);
  }

  function linkButton(text, href, className = "") {
    return el(
      "a",
      {
        className: `button ${className}`.trim(),
        href,
        "data-nav": "",
      },
      text
    );
  }

  function button(text, className = "", onClick, disabled = false) {
    const element = el(
      "button",
      {
        className,
        type: "button",
        disabled,
      },
      text
    );
    if (onClick) element.addEventListener("click", onClick);
    return element;
  }

  function input(attrs = {}) {
    return el("input", {
      type: attrs.type || "text",
      ...attrs,
    });
  }

  function label(text, control, className = "", errorNode = null) {
    return el("label", { className: `field ${className}`.trim() }, el("span", {}, text), control, errorNode);
  }

  function el(tagName, attrs = {}, ...children) {
    const node = document.createElement(tagName);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === "className") {
        node.className = value;
      } else if (key === "textContent") {
        node.textContent = value;
      } else if (key in node) {
        node[key] = value;
      } else {
        node.setAttribute(key, value);
      }
    });

    children.flat(Infinity).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      if (child instanceof Node) {
        node.append(child);
      } else {
        node.append(document.createTextNode(String(child)));
      }
    });
    return node;
  }
})();
