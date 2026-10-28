---
name: package-publishing
description: Shipping a program as a package that others install and run by name, with an executable declared in its manifest, the files it ships, and a version bumped before every release, published to a private registry or the public one and started through a package runner, as the publishing lesson of module 3 does with its customers MCP server, Verdaccio, and npx, and as the LangChain lesson's agent starts that server from the public registry.
---

# Package publishing

## Concept

A package bundles a program with a manifest that names it, gives its version, lists its dependencies, and says which files ship. A registry keeps every published version under the package's name and serves its metadata and archives, so anyone with access installs it by name without the source. A package that declares an executable gets a command of that name once installed, and a package runner, such as npx, uvx, or dnx, fetches the package into a cache and starts that command in one step, which is how an MCP client starts a server it does not keep in the workspace ([model-context-protocol](model-context-protocol.md)). A published version is final: the registry refuses the same version twice, so every release bumps the version first, usually its patch number. A private registry keeps an organization's packages apart from the public one. It speaks the same protocol, serves its own scopes, and usually proxies the public registry for everything else, so a client points every install at it. The registry's address belongs to the client's configuration, and the credential a publish needs, a token from a login, belongs to the user's settings, never to the package.

## How the course implements it

The publishing lesson of module 3 packages the API security lesson's MCP server and keeps its code, tools, and answers ([api-access-control](api-access-control.md)). Its package.json names the package @erickwendel/customers-mcp at version 0.0.2, while the server introduces itself as @erickwendel/ew-customers-mcp at 0.0.1. bin declares the executable customers-mcp, which points to src/index.ts, and files ships only the src folder beside package.json and the README. The entry file starts with #!/usr/bin/env tsx, and **tsx** 4 joins the dependencies, because **Node.js** refuses to strip types from a file under node_modules, so an installed package cannot run its **TypeScript** the way npm start does from the folder. The build script only makes src/index.ts executable, and engines asks for exactly **Node.js** v24.14.0.

Its compose file runs **Verdaccio** 6 on port 4873 with the image's default configuration: accounts in an htpasswd file that npm login creates, publishing only for a logged-in user, and every package also looked up on registry.npmjs.org. The scripts start and stop the registry with **Docker** Compose, log in with npm login against http://localhost:4873, and release with npm version patch followed by npm publish to that address. A second pair logs in to registry.npmjs.org and publishes with --access public, which a scoped package needs to be public. .vscode/mcp.json starts the server with npx -y @erickwendel/customers-mcp@latest and the SERVICE_TOKEN the server requires, and keeps a commented line that adds --registry http://localhost:4873 with the earlier name, @erickwendel/ew-customers-mcp. Both names exist on the public registry, @erickwendel/customers-mcp at 0.0.2 alone.

The LangChain lesson of module 3 is a consumer. Its agent starts npx -y @erickwendel/ew-customers-mcp@latest without a registry, so npx fetches the earlier name from registry.npmjs.org, where its latest version is 0.0.13, with the executable ew-customers-mcp, and keeps the line that adds --registry http://localhost:4873 commented ([model-context-protocol](model-context-protocol.md)). That version is the same server with each tool's output schema written inline and a search by name or phone that ignores case, and it still asks for exactly **Node.js** v24.14.0.

## What usually goes wrong in other languages

- **Node.js** answers ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING for a **TypeScript** file under node_modules, so a package that ships .ts needs **tsx** or a build to JavaScript. Compiled targets ship a binary, and **Python** ships its modules with an entry point.
- The shebang finds tsx only on the PATH that npx and npm scripts extend with the package's node_modules/.bin. After npm install -g, customers-mcp answers env: tsx: No such file or directory unless **tsx** is installed globally too. A **Python** console script avoids this, since its installer writes a launcher bound to the package's own environment.
- engines names one exact version, so npm warns EBADENGINE on any other **Node.js** and installs anyway, unless engine-strict is set.
- The default **Verdaccio** configuration proxies every scope, so a version that already exists on the public registry, such as 0.0.2, cannot be published to it, and npm answers You cannot publish over the previously published versions. The next patch publishes, and the registry then serves the local and the public versions under one name. The cases' registry serves the @erickwendel scope alone and proxies everything else.
- The cases name three programs: start runs the server from its source as npm start does, release publishes the package as it stands, without npm version patch, so running the cases leaves the folder unchanged, and published runs npx -y --registry http://localhost:4873 @erickwendel/customers-mcp@latest, as an MCP client would. The registry keeps port 4873, the address the scripts and the commented line of .vscode/mcp.json use, which must be free.
- npm publish requires a credential for the registry even when the registry lets anyone publish, and answers ENEEDAUTH without one, so the cases' command passes a placeholder token for //localhost:4873/ instead of logging in.
- npm version patch rewrites package.json and package-lock.json, and commits and tags only when the package sits at the root of a **Git** repository with a clean tree. **uv**'s uv version --bump patch, cargo set-version from **cargo-edit**, and **Maven**'s versions plugin only rewrite the manifest.
- npx keeps what it installed in the _npx folder of npm's cache and reuses it while the registry's latest version is the one it has, so code published again under the same version on a fresh registry runs stale until the cache is cleared. uvx caches the same way, and its --refresh fetches again.
- npx writes its warnings and notices to standard error, so the server's standard output stays the MCP session. A launcher that prints to standard output, such as an install progress message, breaks the session before initialize.
- A consumer that asks for @latest, as the LangChain lesson's agent does, runs whatever the author published last, so a transcription keeps the same package and tag rather than a pinned version or a server of its own.
- **PyPI** has no scopes, so the package is customers-mcp or a prefixed name, and the executable keeps the name customers-mcp. **Go** names a module by its repository path and reaches a private one through GOPRIVATE or a GOPROXY of its own, and **Rust** names an alternative registry in .cargo/config.toml.

## How close common targets get

| Target                            | Fit               | Library                                                                                                                             |
| --------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **JavaScript** and **TypeScript** | Direct equivalent | npm's bin, files, version, and publish, **Verdaccio** as the private registry, and npx                                              |
| **Python**                        | Direct equivalent | A console script in pyproject.toml's [project.scripts], built and published with **uv** to **pypiserver**, and run with uvx --index |
| **Rust**                          | Direct equivalent | cargo publish to an alternative registry such as **Kellnr**, and cargo install --registry                                           |
| **C#**                            | Direct equivalent | A .NET tool packed with PackAsTool, pushed to a private NuGet feed such as **BaGetter**, and run with dnx                           |
| **Go**                            | Substitute        | go run or go install of the module's version through a private module proxy such as **Athens**, which serves source, not binaries   |
| **Java**                          | Substitute        | A jar deployed with **Maven** to **Reposilite**, run by its coordinates with **JBang**                                              |
| **C++**                           | Substitute        | A **Conan** package on a private remote, installed and then run, since nothing fetches and starts it in one step                    |

The cases' registry speaks npm's protocol, so their release and published programs pass only for a transcription published as an npm package, as one in **TypeScript** or **JavaScript** is. A transcription that ships through another registry from the table runs that registry from its own compose file, so only its start cases verify it, and its release and runner commands are explained instead. No tested transcription exists yet, because the server is the one the tested **Go** and **Python** customers-mcp transcriptions already cover.

## Tolerance

Publishing is deterministic. The release case reads the package back from the registry's metadata and compares its name, its latest tag, 0.0.2, and the name of its executable, and leaves the path the executable points to and the archive's contents free. The published cases compare the MCP answers exactly as the start cases do, so the packaged server must behave like its source. npx installs the dependencies through the registry's proxy, so the cases need registry.npmjs.org to be reachable. The LangChain lesson's cases let npx fetch the package from registry.npmjs.org at @latest and compare only the calls it makes to the replayed API, so a later version passes as long as it calls the API the same way.

## Where it appears

- modulo03-mcp-na-pratica/08-publishing-mcps-private-npm/customers-mcp-z (published to **Verdaccio** and to npm, and started through npx)
- modulo03-mcp-na-pratica/09-using-mcp-with-langchain/01-multiple-mcp-tools-z (started through npx from the public registry)
