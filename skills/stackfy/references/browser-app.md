---
name: browser-app
description: Browser applications, from static pages whose views render HTML templates and whose controllers talk through DOM events to browser storage, to a canvas game bundled with webpack, both handing heavy work to a Web Worker, and single-page applications whose router answers every path or that a workflow builds for a base path and publishes as static files to GitHub Pages.
---

# Browser application

## Concept

A browser application runs inside the page. A static server only delivers files, so everything else happens in the browser: the program fetches its data as JSON, renders it into HTML, reacts to the user's clicks and choices, and keeps state between interactions in browser storage. Work heavy enough to freeze the page, such as training a model, runs in a Web Worker, a separate thread that exchanges messages with the page. A game draws everything on a canvas instead, so what it shows is pixels rather than elements. Published, the page is only files: a build writes them for the path a static host serves them under, such as a project site's repository name, and a workflow builds and uploads them on every push. Such a host serves no API, so the page calls one on another origin, at an address the user sets and the page keeps in storage, and that API allows the page's origin through CORS. What the user sees and can do on the page is the program's boundary.

## How the course implements it

The e-commerce example is a static page with no build step. **browser-sync** serves the folder, the page loads **Bootstrap**, **Bootstrap Icons**, and **tfjs-vis** from **jsDelivr**, and the application starts as an ES module. The code follows MVC: views own the page's elements and fill HTML templates, fetched at runtime, by replacing placeholders, controllers connect views to services, and services fetch users and products from JSON files and keep the users in session storage. Controllers talk through custom events dispatched on the document, and a module Web Worker does the machine learning, exchanging typed messages to train, recommend, and report progress, training logs, and completion.

On load, the page lists a user without purchases (Josézin da Silva, id 99) before the five users in the data, shows the ten products with Buy Now disabled, keeps every user's purchases in a collapsible panel, and asks the worker to train with the default users. While training, Train Model is disabled and shows a spinner with Training..., and afterwards the starting point reads Train Recommendation Model while the final version reads Train Model again. Choosing a user shows their age and past purchases, enables buying, and enables Run Recommendation once training has completed. Buying adds the product to the user's purchases, clicking a past purchase removes it, and Train Model asks the worker to train again with every user's current purchases. Choosing a user and Run Recommendation both ask the worker to recommend for that user, which only the final version's last part answers, by listing the products again from most to least recommended with Buy Now enabled.

The final version comes in five parts that share the same page and differ only in the worker. The machine learning itself, from the worker's training to the charts of each training log and the recommendations, follows [neural-network-training](neural-network-training.md).

The game example is an open source Duck Hunt that **PixiJS** 8 draws on a canvas filling the window, with **GSAP** animations and **Howler** sounds. **Babel** and webpack bundle it, and **webpack-dev-server** builds it in memory and serves it beside the static files in dist. The game runs three levels of waves, each with its ducks, bullets, and seconds, shows its links, the wave, the score, and the level's outcome as canvas texts, and fires where the player clicks. A lost level, or the last one won, shows a replay text that reloads the page when clicked. The lesson's code adds a HUD, a module Web Worker that webpack bundles as a classic worker, and the loop that plays the game, which [object-detection](object-detection.md) explains. The starting point and both parts share the game and differ only in the worker.

The first Web AI example is a single page with no package and no build, whose inline script shows a placeholder, streams an answer from the model built into **Google Chrome**, and renders it as Markdown. The second is a form that **http-server** serves with no build, whose module script fills a slider and a number field from the model's parameters, shows each value beside its control as it changes, and turns the submit button into a stop button while an answer streams. The third keeps that form, splits its script into ES modules for a view, a controller, and services, and adds a hidden file input that a button opens, with a preview of the chosen image or audio and a button that removes it. [browser-built-in-ai](browser-built-in-ai.md) explains all three.

The Context7 lesson's demo is a **Next.js** application whose home and login pages render in the browser and sign the user in through **GitHub**, as [component-framework](component-framework.md) and [user-authentication](user-authentication.md) explain.

The first UI/UX lesson's Pix app is a single-page application that the **Angular CLI** builds and serves, whose router changes the address without reloading the page, as [component-framework](component-framework.md) explains.

OpsPilot's War Room, in unit 8, is a single page in **React** that **Vite** serves in development under /opspilot/, the base its configuration sets, as [component-framework](component-framework.md) explains. It calls the chat API on another origin, http://localhost:3000 unless the settings saved another address in localStorage under opspilot.warRoom.apiBaseUrl, and the API's CORS lets it ([rest-api](rest-api.md)). A stored address that is not http or https is ignored. The deploy workflow at the lesson's root publishes it to **GitHub Pages** on every push to master and on a manual run. Its first job checks out the repository, sets up **Node.js** 22 with npm's cache keyed to web/package-lock.json, runs npm ci and npm run build -- --base=/ops-pilot/ in web, since the project site lives at the repository's name, and uploads web/dist with upload-pages-artifact. The second deploys it with deploy-pages to the github-pages environment. The workflow may write Pages and mint an OIDC token, and its pages concurrency group never cancels a deploy in progress. The API is not published, so the published page works against whichever API the user points it to.

## What usually goes wrong in other languages

- Only **JavaScript** and WebAssembly run in the page, so a target outside the browser either compiles to WebAssembly, runs through an in-browser runtime such as **PyScript**, or keeps the page in **JavaScript** and explains it, as the table below says.
- The cases open the page in headless **Google Chrome**, choose and click through the original's element ids, classes, and option values (the user ids), and compare the visible text with whitespace collapsed. A transcription keeps that markup, those texts, and the product cards as direct children of the product list in the order shown, whatever renders them. Frameworks drop the whitespace between elements, which is why the cases read adjacent inline elements, such as the purchase badges, one by one. Training can end faster than the cases poll, so they record each state Train Model goes through instead of sampling it.
- Any static server works, as long as it serves the folder's root on the PORT it receives. The original's start script fixes port 3000 and opens a browser, while its README mentions port 8080.
- A file input can only be filled by the user, so the cases hand the chosen file to the input itself, with its name, type, and bytes, and fire the events a real choice fires. A transcription keeps the original's input, even when hidden behind a button, and the cases check that the button opens the file picker. The multimodal form previews an image or an audio player with controls from an object URL, followed by a button that clears the input, the preview, and the file's name.
- A single-page application's server answers every path with index.html, and the Pix app's cases open its statement directly at /extrato. ng serve and **Vite**'s dev server do it, while a plain static server needs a fallback to index.html.
- The Context7 demo's cases follow the sign-in in one browser across two origins, from the login page to a stand-in for **GitHub**'s authorize page and back, so the cookies set along the way behave as for a real user, and a transcription sets them for the address the browser opened.
- The worker is a module worker created from an absolute path, which lets it import **TensorFlow.js** by URL and requires serving the page from the server's root. A bundler such as **Vite** only bundles a worker referenced relative to the module that creates it.
- The libraries come from **jsDelivr**, so the page needs network access, and **tfjs-vis** is a global from a classic script, not a module.
- Every load stores the default users in session storage again, so purchases last until the page reloads.
- The worker controller drops recommendation requests until training has completed, so a user chosen earlier keeps the catalog's order until Run Recommendation.
- Recommended cards show the catalog's product data, while past purchases show the copy stored with the user, and the data gives two products other colors there (Camiseta Estampada and Tênis Esportivo).
- A new purchase goes to the top of the past purchases right away, but choosing the user again lists purchases in the order they were bought. Product cards show prices with a dollar sign, and past purchases show them without one.
- Clicking a past purchase removes it from storage at once and from the list after a half-second fade, and an empty list says that no past purchases were found. Clearing the selection empties the age and the list but leaves Buy Now enabled.
- The events that carry training logs and visor data use names missing from the event constants, so both share one undefined name. Only the training logs travel through it, so a transcription gives each event its own name and keeps the behavior.
- The canvas game stays in **JavaScript** in every target, because the lesson teaches the code that plays it, not the game.
- A canvas has no elements to read, so the game's cases run a script before the page's own. It catches the application through the devtools hook of **PixiJS** (`__PIXI_APP_INIT__`), records each text the stage shows in session storage, which survives the replay's reload, and keeps what the page logs. A transcription keeps **PixiJS** 8 and draws the HUD's texts in the stage.
- webpack bundles a worker created with the module type as a classic worker, which is why the worker can call importScripts. A bundler that keeps module workers, such as **Vite**, needs the worker to import **TensorFlow.js** as a module instead.
- The game's start script serves on port 8080 and opens a browser, so the cases run `npx webpack-dev-server --port $PORT --no-open`. Only the starting point's committed dist holds its own build, while the parts' hold the game without the AI, so the page is always built rather than served from dist alone.
- The War Room's base appears in vite.config.ts and again in src/base.ts, which only a test reads, and the build's --base flag overrides it. The cases open the dev server at /opspilot/ and the build at /ops-pilot/ and check that every script and stylesheet of the page's own loads from under that base, so a transcription with another build tool sets its public path the same way, such as **Angular**'s --base-href, **SvelteKit**'s paths.base, or **Next.js**'s basePath with a static export.
- The War Room sends JSON to an API on another origin, so the browser asks with a preflight first, which the cases' replay answers for any origin. A transcription keeps the JSON content type, and an API that serves it answers the preflight as [rest-api](rest-api.md) describes.
- The deploy workflow builds only web, so a transcription into another stack changes its setup, install, and build steps and the folder it uploads, keeping the trigger, the permissions, the concurrency group, and the two jobs, while a transcription that still builds with **Vite** and npm, as the tested **Vue** one does, keeps the workflow unchanged. It needs **GitHub** to run, so the cases run the same build instead and serve its folder under the project site's path.
- The War Room's cases name two programs: dev runs `npx vite --port $PORT --host 127.0.0.1 --strictPort`, and pages runs `npm run build -- --base=/ops-pilot/ && npx vite preview --base=/ops-pilot/ --port $PORT --host 127.0.0.1 --strictPort`, which serves web/dist as a static host would.

## How close common targets get

| Target                                          | Fit                | Library                                                                                                   |
| ----------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| **JavaScript** and **TypeScript**               | Direct equivalent  | The browser's DOM, ES modules, and Web Workers, served by any static server                               |
| **React**, **Vue**, **Angular**, and **Svelte** | Direct equivalent  | The framework's components and state for the views, keeping the original's markup and the same Web Worker |
| **Python**                                      | Substitute         | **PyScript**, whose workers need a server that sends cross-origin isolation headers                       |
| **Rust**                                        | Substitute         | **Leptos** compiled to WebAssembly                                                                        |
| **C#**                                          | Substitute         | **Blazor** WebAssembly                                                                                    |
| **Go**                                          | Substitute         | **Go** compiled to WebAssembly with its syscall/js package                                                |
| **Java**                                        | Nothing comparable | The page stays in **JavaScript** and is explained instead of transcribed                                  |
| **C++**                                         | Nothing comparable | The page stays in **JavaScript** and is explained instead of transcribed                                  |

The tested **React** transcription of the Pix app and the **Vue** one of the War Room, which passes the cases in development and as built for **GitHub Pages**, are kept with the component-framework examples, and the **Python** one of the Better Auth demo with the user-authentication examples.

## Tolerance

The page is deterministic apart from the order of recommended products, so the cases compare its texts and states exactly and leave that order to the tolerance in [neural-network-training](neural-network-training.md). Timing varies, since data, templates, and the worker load asynchronously and training takes seconds, so the cases wait for each state instead of timing it. The game's ducks fly at random, so its cases compare the sequence of levels, waves, and outcomes the canvas shows, never the score, and leave the shots to the tolerance in [object-detection](object-detection.md). The War Room shows only what the replayed API answers, so its cases compare it exactly, in development and as built for **GitHub Pages**.

## Where it appears

- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-template (starting point)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte01-ecommerce-recomendations-with-tensorflow (final version, part 1)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte02-ecommerce-recomendations-with-tensorflow (final version, part 2)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte03-ecommerce-recomendations-with-tensorflow (final version, part 3)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte04-ecommerce-recomendations-with-tensorflow (final version, part 4)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte05-ecommerce-recomendations-with-tensorflow (final version, part 5)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-02-vencendo-qualquer-jogo/_template (starting point, the game)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-02-vencendo-qualquer-jogo/DuckHunt-JS-parte01 (part 1, the game)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-02-vencendo-qualquer-jogo/DuckHunt-JS-parte02 (part 2, the game)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-03-webai01 (the page around the built-in model)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-04-webai02-temperature-and-topK (the form around the built-in model)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-05-webai03-multimodal (the form with a file preview around the built-in models)
- modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-08-context7/nextjs-better-auth-demo (the pages that sign in through **GitHub**)
- modulo04-criacao-de-agentes-autonomos-novo/08-projeto-pratico-opspilot-publicado/web (the War Room, served under a base path and published to **GitHub Pages**)
- modulo04-criacao-de-agentes-autonomos-novo/09-multi-agent-systems/web (the War Room, served under a base path and published to **GitHub Pages**)
- modulo05-ferramentas-de-IA-para-UI-UX/modulo-02/pix-app (the single-page application)
