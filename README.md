# ShowOps Web

Public-facing ShowOps presentation layer and clickable PWA prototype.

## Open the prototype

**[Launch ShowOps](https://showops-prototype.langaz35.chatgpt.site)**

The prototype starts empty so you can learn by creating a fictional event, staffing need, shift, run-sheet check, and operational note. A single tiny synthetic example is optional. Data is stored only in the current browser; there is no account, backend, team sync, analytics, or recovery.

Use fictional details only. Product discovery, customer evidence, private business rules, identity, tenancy, security design, and authoritative service implementation remain in the private `langzonedev/ShowOps` repository.

## Local development

```powershell
pnpm install
pnpm dev
```

Build verification:

```powershell
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```
