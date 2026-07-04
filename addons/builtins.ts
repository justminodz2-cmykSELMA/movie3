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

fillRow(p.row("Top Rated This Year"), "/discover/tv", {
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

export const BUILTIN_ADDON_SOURCES: string[] = [
  BOOKS_ADDON_SOURCE,
  ANIME_HUB_SOURCE,
  AURORA_THEME_SOURCE,
  PROVIDER_EXAMPLE_SOURCE,
];

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
  let row = p.row("Trending")                      // add a row ("poster"|"wide"|"circle")
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
