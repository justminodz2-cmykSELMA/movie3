// ============================================================
// Built-in gallery addons — written in CineScript itself.
// These double as living documentation for addon creators.
// ============================================================

export const BOOKS_ADDON_SOURCE = `// 📚 Books Library — adds a whole new "Books" tab with reading rows
meta({
  id: "books-library",
  name: "Books Library",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-book-open",
  color: "#f59e0b",
  description: "A reading corner inside CineStream. Browse free classic books by category, powered by the Gutendex open library."
})

let p = page("Books", "fa-solid fa-book-open", { id: "books" })

fn addBooks(row, topic) {
  let data = http.tryGet("https://gutendex.com/books/?topic=" + topic + "&sort=popular")
  if (data == null || data.results == null) {
    log("Could not load topic: " + topic)
    return null
  }
  let count = 0
  for b in data.results {
    if (count >= 15) { break }
    let img = null
    if (b.formats["image/jpeg"]) { img = b.formats["image/jpeg"] }
    let author = "Unknown author"
    if (len(b.authors) > 0) { author = b.authors[0].name }
    let link = null
    if (b.formats["text/html"]) { link = b.formats["text/html"] }
    row.add({
      title: b.title,
      subtitle: author,
      image: img,
      badge: str(b.download_count) + " reads",
      url: link
    })
    count = count + 1
  }
}

addBooks(p.row("Fantasy Adventures"), "fantasy")
addBooks(p.row("Mystery & Detective"), "mystery")
addBooks(p.row("Science Fiction"), "science%20fiction")
addBooks(p.row("Romance Classics"), "romance")

log("Books Library loaded")
`;

export const AURORA_THEME_SOURCE = `// 🎨 Aurora Night — a cool cinematic blue/teal theme
meta({
  id: "aurora-night",
  name: "Aurora Night",
  version: "1.0.0",
  author: "CineStream Team",
  type: "theme",
  icon: "fa-solid fa-palette",
  color: "#22d3ee",
  description: "Repaints the whole app with icy aurora blues and teal glow accents."
})

theme({
  primary: "#0ea5e9",
  accent: "#22d3ee",
  background: "#020617",
  surface: "#0b1220",
  border: "#16324a",
  text: "#e2f4ff"
})
`;

export const ANIME_HUB_SOURCE = `// ⛩️ Anime Hub — a new tab full of anime rows built from TMDB
meta({
  id: "anime-hub",
  name: "Anime Hub",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-dragon",
  color: "#a855f7",
  description: "A dedicated anime universe: trending anime series, legendary movies and top-rated picks."
})

let p = page("Anime", "fa-solid fa-dragon", { id: "anime" })

fn fillRow(row, path, params, media) {
  let data = tmdb(path, params)
  for r in slice(data.results, 0, 15) {
    let it = tmdbItem(r, media)
    if (it != null) { row.add(it) }
  }
}

fillRow(p.row("Trending Anime Series"), "/discover/tv", {
  with_genres: "16", with_origin_country: "JP", sort_by: "popularity.desc"
}, "tv")

fillRow(p.row("Legendary Anime Movies"), "/discover/movie", {
  with_genres: "16", with_origin_country: "JP", sort_by: "vote_count.desc"
}, "movie")

fillRow(p.row("Top Rated This Year", "square"), "/discover/tv", {
  with_genres: "16", with_origin_country: "JP",
  sort_by: "vote_average.desc", "vote_count.gte": "200"
}, "tv")

log("Anime Hub ready")
`;

export const PROVIDER_EXAMPLE_SOURCE = `// 🔌 VidSrc Provider — example of a new streaming provider addon
meta({
  id: "vidsrc-provider",
  name: "VidSrc Provider",
  version: "1.0.0",
  author: "CineStream Team",
  type: "provider",
  icon: "fa-solid fa-server",
  color: "#34d399",
  description: "Registers a new embed provider and shows a demo page where popular movies play through it."
})

let vs = provider({
  id: "vidsrc",
  name: "VidSrc",
  movieUrl: "https://vidsrc.to/embed/movie/{id}",
  tvUrl: "https://vidsrc.to/embed/tv/{id}/{season}/{episode}"
})

let p = page("VidSrc Demo", "fa-solid fa-server", { id: "vidsrc-demo", nav: false })
let row = p.row("Popular movies via VidSrc")
let data = tmdb("/movie/popular", {})
for r in slice(data.results, 0, 12) {
  row.add({
    title: r.title,
    subtitle: "Play via VidSrc",
    image: imageUrl(r.poster_path, "w500"),
    badge: "PROVIDER",
    play: vs.watchMovie(r.id)
  })
}
`;

// ============================================================
// New gallery addons — player features, subtitles, AI & more
// ============================================================

export const AI_SUBTITLES_SOURCE = `// ✨ AI Subtitles (Gemini) — smart subtitles inside the player
meta({
  id: "ai-subtitles-gemini",
  name: "AI Subtitles (Gemini)",
  version: "1.0.0",
  author: "CineStream Team",
  type: "player",
  icon: "fa-solid fa-wand-magic-sparkles",
  color: "#a78bfa",
  description: "Finds extra subtitles for whatever you are watching and adds Gemini-powered AI translation targets straight into the player's Subtitles menu. Pick a language and the AI translates the subtitles live."
})

// Extra subtitle tracks for the current movie/episode (OpenSubtitles, free & keyless)
subtitles({
  id: "opensubtitles-v3",
  name: "OpenSubs",
  movieUrl: "https://opensubtitles-v3.strem.io/subtitles/movie/{imdb}.json",
  tvUrl: "https://opensubtitles-v3.strem.io/subtitles/series/{imdb}:{season}:{episode}.json",
  maxTracks: 8
})

// Gemini AI translation entries shown in the player's Subtitles panel
player({
  aiTranslate: [
    { code: "ar", label: "العربية" },
    { code: "en", label: "English" },
    { code: "fr", label: "Français" },
    { code: "es", label: "Español" },
    { code: "de", label: "Deutsch" },
    { code: "tr", label: "Türkçe" }
  ]
})

log("AI Subtitles (Gemini) ready — open the Subtitles menu in the player")
`;

export const INTRO_SKIP_AI_SOURCE = `// ⏭️ Intro Skip AI — Gemini detects intros and skips them for you
meta({
  id: "intro-skip-ai",
  name: "Intro Skip AI",
  version: "1.0.0",
  author: "CineStream Team",
  type: "player",
  icon: "fa-solid fa-forward-fast",
  color: "#f97316",
  description: "Gemini analyzes the episode's subtitles to find the intro and outro, then the intro is skipped automatically — no button pressing needed. The outro still shows a Skip button so you never miss post-credit scenes."
})

player({
  autoSkipIntro: true,
  autoSkipOutro: false
})

log("Intro Skip AI enabled — intros will be skipped automatically")
`;

export const ARABIC_SUBTITLES_SOURCE = `// 🇩🇿 Arabic Subtitles+ — always find an Arabic track
meta({
  id: "arabic-subtitles-plus",
  name: "Arabic Subtitles+",
  version: "1.0.0",
  author: "CineStream Team",
  type: "player",
  icon: "fa-solid fa-closed-captioning",
  color: "#22c55e",
  description: "Dedicated Arabic subtitle finder: searches the open subtitle library for Arabic tracks for every movie and episode and lists them in the player's Subtitles menu."
})

subtitles({
  id: "opensubtitles-arabic",
  name: "Arabic",
  movieUrl: "https://opensubtitles-v3.strem.io/subtitles/movie/{imdb}.json",
  tvUrl: "https://opensubtitles-v3.strem.io/subtitles/series/{imdb}:{season}:{episode}.json",
  language: "ar",
  maxTracks: 4
})

log("Arabic Subtitles+ ready")
`;

export const KDRAMA_WORLD_SOURCE = `// 🇰🇷 K-Drama World — a dedicated Korean drama tab
meta({
  id: "kdrama-world",
  name: "K-Drama World",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-heart",
  color: "#f43f5e",
  description: "A whole tab for Korean entertainment: trending K-dramas, all-time favorites and Korean cinema hits."
})

let p = page("K-Drama", "fa-solid fa-heart", { id: "kdrama" })

fn fillRow(row, path, params, media) {
  let data = tmdb(path, params)
  for r in slice(data.results, 0, 15) {
    let it = tmdbItem(r, media)
    if (it != null) { row.add(it) }
  }
}

fillRow(p.row("Trending K-Dramas"), "/discover/tv", {
  with_origin_country: "KR", sort_by: "popularity.desc"
}, "tv")

fillRow(p.row("All-Time Favorites"), "/discover/tv", {
  with_origin_country: "KR", sort_by: "vote_average.desc", "vote_count.gte": "200"
}, "tv")

fillRow(p.row("Korean Cinema", "wide"), "/discover/movie", {
  with_origin_country: "KR", sort_by: "vote_count.desc"
}, "movie")

log("K-Drama World ready")
`;

export const BOLLYWOOD_HUB_SOURCE = `// 🇮🇳 Bollywood Hub — Indian cinema tab
meta({
  id: "bollywood-hub",
  name: "Bollywood Hub",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-film",
  color: "#f59e0b",
  description: "Blockbusters and classics from Indian cinema: trending Hindi movies, highest rated of all time and popular Indian series."
})

let p = page("Bollywood", "fa-solid fa-film", { id: "bollywood" })

fn fillRow(row, path, params, media) {
  let data = tmdb(path, params)
  for r in slice(data.results, 0, 15) {
    let it = tmdbItem(r, media)
    if (it != null) { row.add(it) }
  }
}

fillRow(p.row("Trending in Bollywood"), "/discover/movie", {
  with_original_language: "hi", sort_by: "popularity.desc"
}, "movie")

fillRow(p.row("Highest Rated"), "/discover/movie", {
  with_original_language: "hi", sort_by: "vote_average.desc", "vote_count.gte": "300"
}, "movie")

fillRow(p.row("Indian Series", "wide"), "/discover/tv", {
  with_origin_country: "IN", sort_by: "popularity.desc"
}, "tv")

log("Bollywood Hub ready")
`;

export const HORROR_VAULT_SOURCE = `// 👻 Horror Vault — everything scary in one tab
meta({
  id: "horror-vault",
  name: "Horror Vault",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-ghost",
  color: "#7c3aed",
  description: "A tab for horror fans: trending nightmares, the scariest films ever made, vintage classics and chilling mystery series."
})

let p = page("Horror", "fa-solid fa-ghost", { id: "horror" })

fn fillRow(row, path, params, media) {
  let data = tmdb(path, params)
  for r in slice(data.results, 0, 15) {
    let it = tmdbItem(r, media)
    if (it != null) { row.add(it) }
  }
}

fillRow(p.row("Trending Nightmares"), "/discover/movie", {
  with_genres: "27", sort_by: "popularity.desc"
}, "movie")

fillRow(p.row("Scariest of All Time"), "/discover/movie", {
  with_genres: "27", sort_by: "vote_count.desc"
}, "movie")

fillRow(p.row("Vintage Horror", "wide"), "/discover/movie", {
  with_genres: "27", "primary_release_date.lte": "1990-12-31",
  sort_by: "vote_average.desc", "vote_count.gte": "150"
}, "movie")

fillRow(p.row("Chilling Series"), "/discover/tv", {
  with_genres: "9648", sort_by: "popularity.desc"
}, "tv")

log("Horror Vault opened... if you dare")
`;

export const KIDS_ZONE_SOURCE = `// 🧸 Kids Zone — safe, fun picks for the little ones
meta({
  id: "kids-zone",
  name: "Kids Zone",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-shapes",
  color: "#38bdf8",
  description: "A colorful tab for children: animated adventures, family movie night picks and beloved cartoon series — all family-friendly."
})

let p = page("Kids", "fa-solid fa-shapes", { id: "kids" })

fn fillRow(row, path, params, media) {
  let data = tmdb(path, params)
  for r in slice(data.results, 0, 15) {
    let it = tmdbItem(r, media)
    if (it != null) { row.add(it) }
  }
}

fillRow(p.row("Animated Adventures"), "/discover/movie", {
  with_genres: "16,10751", certification_country: "US", "certification.lte": "PG",
  sort_by: "popularity.desc"
}, "movie")

fillRow(p.row("Family Movie Night", "wide"), "/discover/movie", {
  with_genres: "10751", certification_country: "US", "certification.lte": "PG",
  sort_by: "vote_count.desc"
}, "movie")

fillRow(p.row("Cartoon Series", "circle"), "/discover/tv", {
  with_genres: "16,10762", sort_by: "popularity.desc"
}, "tv")

log("Kids Zone ready")
`;

export const CLASSIC_CINEMA_SOURCE = `// 🎞️ Classic Cinema — golden-age masterpieces by decade
meta({
  id: "classic-cinema",
  name: "Classic Cinema",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-clapperboard",
  color: "#eab308",
  description: "Travel back in time: the greatest films of the 60s, 70s and 80s, hand-ranked by audience score."
})

let p = page("Classics", "fa-solid fa-clapperboard", { id: "classics" })

fn decadeRow(row, fromDate, toDate) {
  let data = tmdb("/discover/movie", {
    "primary_release_date.gte": fromDate,
    "primary_release_date.lte": toDate,
    sort_by: "vote_average.desc",
    "vote_count.gte": "500"
  })
  for r in slice(data.results, 0, 15) {
    let it = tmdbItem(r, "movie")
    if (it != null) { row.add(it) }
  }
}

decadeRow(p.row("The Swinging 60s"), "1960-01-01", "1969-12-31")
decadeRow(p.row("The Golden 70s"), "1970-01-01", "1979-12-31")
decadeRow(p.row("The Electric 80s"), "1980-01-01", "1989-12-31")

log("Classic Cinema ready")
`;

export const DOCUMENTARY_PLANET_SOURCE = `// 🌍 Documentary Planet — real stories, real world
meta({
  id: "documentary-planet",
  name: "Documentary Planet",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-earth-americas",
  color: "#14b8a6",
  description: "A tab for curious minds: trending documentaries, the highest rated docs ever and acclaimed documentary series."
})

let p = page("Docs", "fa-solid fa-earth-americas", { id: "docs" })

fn fillRow(row, path, params, media) {
  let data = tmdb(path, params)
  for r in slice(data.results, 0, 15) {
    let it = tmdbItem(r, media)
    if (it != null) { row.add(it) }
  }
}

fillRow(p.row("Trending Documentaries"), "/discover/movie", {
  with_genres: "99", sort_by: "popularity.desc"
}, "movie")

fillRow(p.row("Highest Rated Ever"), "/discover/movie", {
  with_genres: "99", sort_by: "vote_average.desc", "vote_count.gte": "150"
}, "movie")

fillRow(p.row("Documentary Series", "wide"), "/discover/tv", {
  with_genres: "99", sort_by: "popularity.desc"
}, "tv")

log("Documentary Planet ready")
`;

export const TOP_RATED_250_SOURCE = `// 🏆 Top Rated 250 — the best of the best
meta({
  id: "top-rated-250",
  name: "Top Rated 250",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-trophy",
  color: "#facc15",
  description: "One tab with the highest rated movies and series of all time, pulled live from TMDB's top-rated charts."
})

let p = page("Top 250", "fa-solid fa-trophy", { id: "top-250" })

fn topRow(row, path, media, pagesToLoad) {
  let rank = 1
  for i in pagesToLoad {
    let data = tmdb(path, { page: str(i + 1) })
    for r in data.results {
      let it = tmdbItem(r, media)
      if (it != null) {
        it.badge = "#" + str(rank)
        row.add(it)
        rank = rank + 1
      }
    }
  }
}

topRow(p.row("Greatest Movies of All Time"), "/movie/top_rated", "movie", 2)
topRow(p.row("Greatest Series of All Time"), "/tv/top_rated", "tv", 2)

log("Top Rated 250 ready")
`;

export const ACTORS_SPOTLIGHT_SOURCE = `// ⭐ Actors Spotlight — who is hot in Hollywood right now
meta({
  id: "actors-spotlight",
  name: "Actors Spotlight",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-star",
  color: "#fb7185",
  description: "A tab of trending actors and their most famous roles. Tap a face to open their full filmography."
})

let p = page("Actors", "fa-solid fa-star", { id: "actors" })
let row = p.row("Trending This Week", "circle")
let data = tmdb("/person/popular", {})

for person in slice(data.results, 0, 20) {
  let knownFor = ""
  if (len(person.known_for) > 0) {
    let first = person.known_for[0]
    if (first.title) { knownFor = first.title }
    if (first.name) { knownFor = first.name }
  }
  row.add({
    title: person.name,
    subtitle: knownFor,
    image: imageUrl(person.profile_path, "w500"),
    badge: "★ " + str(round(person.popularity)),
    url: "https://www.themoviedb.org/person/" + str(person.id)
  })
}

// Their current hit movies
let hits = p.row("Movies Everyone Is Watching", "wide")
let trending = tmdb("/trending/movie/week", {})
for r in slice(trending.results, 0, 12) {
  let it = tmdbItem(r, "movie")
  if (it != null) { hits.add(it) }
}

log("Actors Spotlight ready")
`;

export const TRAILER_TUBE_SOURCE = `// 🎬 Trailer Tube — watch official trailers inside the app
meta({
  id: "trailer-tube",
  name: "Trailer Tube",
  version: "1.0.0",
  author: "CineStream Team",
  type: "page",
  icon: "fa-solid fa-circle-play",
  color: "#ef4444",
  description: "A tab full of official YouTube trailers: upcoming releases and movies now playing in theaters — press play and the trailer starts instantly."
})

let p = page("Trailers", "fa-solid fa-circle-play", { id: "trailers" })

fn trailerUrl(movieId) {
  let vids = tmdb("/movie/" + str(movieId) + "/videos", {})
  if (vids == null || vids.results == null) { return null }
  for v in vids.results {
    if (v.site == "YouTube" && (v.type == "Trailer" || v.type == "Teaser")) {
      return "https://www.youtube.com/embed/" + v.key + "?autoplay=1"
    }
  }
  return null
}

fn trailerRow(row, path) {
  let data = tmdb(path, { region: "US" })
  for r in slice(data.results, 0, 8) {
    let yt = trailerUrl(r.id)
    if (yt != null) {
      row.add({
        title: r.title,
        subtitle: "Official trailer",
        image: imageUrl(r.backdrop_path, "w780"),
        badge: "TRAILER",
        play: yt
      })
    }
  }
}

trailerRow(p.row("Coming Soon", "wide"), "/movie/upcoming")
trailerRow(p.row("Now In Theaters", "wide"), "/movie/now_playing")

log("Trailer Tube ready")
`;

export const CRIMSON_NOIR_THEME_SOURCE = `// 🎨 Crimson Noir — a deep blood-red cinema theme
meta({
  id: "crimson-noir",
  name: "Crimson Noir",
  version: "1.0.0",
  author: "CineStream Team",
  type: "theme",
  icon: "fa-solid fa-droplet",
  color: "#dc2626",
  description: "Repaints the app in moody blacks and deep crimson — a dark theater vibe for late-night sessions."
})

theme({
  primary: "#dc2626",
  accent: "#f87171",
  background: "#0a0505",
  surface: "#171010",
  border: "#3f1d1d",
  text: "#fdeaea"
})
`;

export const EMERALD_FOREST_THEME_SOURCE = `// 🎨 Emerald Forest — calm greens, easy on the eyes
meta({
  id: "emerald-forest",
  name: "Emerald Forest",
  version: "1.0.0",
  author: "CineStream Team",
  type: "theme",
  icon: "fa-solid fa-leaf",
  color: "#10b981",
  description: "A soothing dark-green theme with emerald glow accents — perfect for relaxed evening browsing."
})

theme({
  primary: "#10b981",
  accent: "#34d399",
  background: "#02120c",
  surface: "#0a1f16",
  border: "#14402e",
  text: "#e7fff5"
})
`;

export const SUPEREMBED_PROVIDER_SOURCE = `// 🔌 SuperEmbed Provider — one more streaming source
meta({
  id: "superembed-provider",
  name: "SuperEmbed Provider",
  version: "1.0.0",
  author: "CineStream Team",
  type: "provider",
  icon: "fa-solid fa-bolt",
  color: "#60a5fa",
  description: "Registers the SuperEmbed multi-server source as a new provider and shows a demo shelf of trending titles that play through it."
})

let se = provider({
  id: "superembed",
  name: "SuperEmbed",
  movieUrl: "https://multiembed.mov/?video_id={id}&tmdb=1",
  tvUrl: "https://multiembed.mov/?video_id={id}&tmdb=1&s={season}&e={episode}"
})

let p = page("SuperEmbed Demo", "fa-solid fa-bolt", { id: "superembed-demo", nav: false })
let row = p.row("Trending via SuperEmbed")
let data = tmdb("/trending/movie/week", {})
for r in slice(data.results, 0, 12) {
  row.add({
    title: r.title,
    subtitle: "Play via SuperEmbed",
    image: imageUrl(r.poster_path, "w500"),
    badge: "PROVIDER",
    play: se.watchMovie(r.id)
  })
}

log("SuperEmbed Provider ready")
`;

export const NEW_ADDON_TEMPLATE = `// ✨ My First Addon — edit me!
meta({
  id: "my-addon",
  name: "My Addon",
  version: "1.0.0",
  author: "Me",
  type: "page",
  icon: "fa-solid fa-star",
  color: "#e50914",
  description: "Describe what your addon does here."
})

let p = page("My Page", "fa-solid fa-star")
let row = p.row("My First Row")

row.add({
  title: "Hello CineScript!",
  subtitle: "This card came from my addon",
  badge: "NEW",
  image: "https://picsum.photos/500/750"
})

// Try dynamic content from TMDB:
let data = tmdb("/trending/all/week", {})
let picks = p.row("Trending picks")
for r in slice(data.results, 0, 10) {
  picks.add(tmdbItem(r))
}
`;

/**
 * Registry of every built-in gallery addon. The id MUST match the meta.id
 * declared inside the source — it lets AddonContext detect which built-ins
 * are missing from an existing install and add them (disabled) on upgrade.
 */
export const BUILTIN_ADDONS: { id: string; source: string }[] = [
  { id: 'books-library', source: BOOKS_ADDON_SOURCE },
  { id: 'anime-hub', source: ANIME_HUB_SOURCE },
  { id: 'aurora-night', source: AURORA_THEME_SOURCE },
  { id: 'vidsrc-provider', source: PROVIDER_EXAMPLE_SOURCE },
  // ---- Player / subtitle / AI addons ----
  { id: 'ai-subtitles-gemini', source: AI_SUBTITLES_SOURCE },
  { id: 'intro-skip-ai', source: INTRO_SKIP_AI_SOURCE },
  { id: 'arabic-subtitles-plus', source: ARABIC_SUBTITLES_SOURCE },
  // ---- Page / tab addons ----
  { id: 'kdrama-world', source: KDRAMA_WORLD_SOURCE },
  { id: 'bollywood-hub', source: BOLLYWOOD_HUB_SOURCE },
  { id: 'horror-vault', source: HORROR_VAULT_SOURCE },
  { id: 'kids-zone', source: KIDS_ZONE_SOURCE },
  { id: 'classic-cinema', source: CLASSIC_CINEMA_SOURCE },
  { id: 'documentary-planet', source: DOCUMENTARY_PLANET_SOURCE },
  { id: 'top-rated-250', source: TOP_RATED_250_SOURCE },
  { id: 'actors-spotlight', source: ACTORS_SPOTLIGHT_SOURCE },
  { id: 'trailer-tube', source: TRAILER_TUBE_SOURCE },
  // ---- Themes ----
  { id: 'crimson-noir', source: CRIMSON_NOIR_THEME_SOURCE },
  { id: 'emerald-forest', source: EMERALD_FOREST_THEME_SOURCE },
  // ---- Providers ----
  { id: 'superembed-provider', source: SUPEREMBED_PROVIDER_SOURCE },
];

export const BUILTIN_ADDON_SOURCES: string[] = BUILTIN_ADDONS.map(a => a.source);

export const CINESCRIPT_DOCS = `CINESCRIPT — QUICK REFERENCE
============================

Every addon MUST start by describing itself:
  meta({ id: "my-addon", name: "My Addon", type: "page",
         icon: "fa-solid fa-star", color: "#e50914",
         author: "Me", version: "1.0.0", description: "..." })
  type: "theme" | "page" | "provider" | "mixed"

LANGUAGE BASICS
  let x = 5                      // variables
  x = x + 1                      // + - * / %  == != < <= > >=  && || !
  let s = "hello" + " world"     // strings ("..." or '...')
  let arr = [1, 2, 3]            // arrays  -> arr[0], arr.length
  let obj = { a: 1, "b": 2 }     // objects -> obj.a, obj["b"]
  if (x > 3) { ... } else { ... }
  while (x < 10) { x = x + 1 }
  for item in arr { log(item) }  // also works on objects (keys) and numbers (0..n-1)
  break / continue / return
  fn add(a, b) { return a + b }  // functions
  // comments start with // or #

BUILD PAGES & TABS
  let p = page("Books", "fa-solid fa-book")        // new tab + page
  let row = p.row("Trending")                      // add a row ("poster"|"wide"|"circle"|"square")
  row.add({ title, subtitle, image, badge, url, play })
  row.addAll(listOfItems)
  Item actions: tmdb item -> opens details • play: url -> opens player • url -> opens browser

THEMES
  theme({ primary: "#0ea5e9", background: "#020617", surface: "#0b1220",
          border: "#16324a", text: "#e2f4ff", accent: "#22d3ee" })

PROVIDERS
  let pr = provider({ id: "vidsrc", name: "VidSrc",
    movieUrl: "https://host/embed/movie/{id}",
    tvUrl: "https://host/embed/tv/{id}/{season}/{episode}" })
  pr.watchMovie(603)                       // -> filled URL to use as item "play"
  pr.watchTv(1399, 1, 1)

PLAYER ADDONS (type: "player")
  // Extra subtitle tracks in the player's Subtitles menu.
  // The endpoint must return a JSON array of { url, language, display?, format? }
  // Templates: {id} = TMDB id, {imdb} = IMDB id (resolved for you), {season}, {episode}
  subtitles({ id: "my-subs", name: "MySubs",
    movieUrl: "https://host/subtitles/movie/{imdb}.json",
    tvUrl: "https://host/subtitles/series/{imdb}:{season}:{episode}.json",
    language: "ar",     // optional: keep only this language
    maxTracks: 6 })      // optional: cap tracks from this source
  // Player behaviour flags:
  player({
    autoSkipIntro: true,          // auto-jump the Gemini-detected intro
    autoSkipOutro: false,         // outro keeps its Skip button
    aiTranslate: [                 // Gemini translate targets in the Subtitles menu
      { code: "ar", label: "العربية" },
      { code: "fr", label: "Français" }
    ]
  })

NETWORK & DATA
  let data = tmdb("/movie/popular", { page: "1" })  // TMDB API (key handled for you)
  let it = tmdbItem(data.results[0])                // TMDB result -> ready-made card
  let json = http.get("https://api.example.com")    // any JSON API (max 20 calls)
  let text = http.getText("https://example.com")    // plain text
  let safe = http.tryGet("https://api.example.com") // returns null on failure instead of stopping
  imageUrl("/poster.jpg", "w500")                    // TMDB image helper

HELPERS
  log(x) len(x) str(x) num(x) push(arr, v) keys(obj) range(n)
  join(a, ",") split(s, ",") upper(s) lower(s) trim(s) replace(s, a, b)
  contains(s, sub) slice(v, 0, 5) sort(arr, "key") reverse(arr)
  random() floor(x) round(x) min(...) max(...) now()

SAFETY (you cannot break the app)
  • Sandboxed: no eval, no DOM, no cookies, no app internals
  • Limits: 500k operations, 20 network calls, 30s runtime, 2MB responses
  • Every string/URL is sanitized before rendering
`;
