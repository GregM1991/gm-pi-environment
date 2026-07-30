# File Search

Pi extension providing first-class `fd` (file discovery) and `rg` (content search) tools.

At session start it prefers system-installed binaries (`fd`/`fdfind` and `rg`). If unavailable, it uses binaries already cached in the package's `bin/` directory or downloads verified official releases for supported macOS/Linux arm64/x64 systems.

Imported from [davis7dotsh/my-pi-setup](https://github.com/davis7dotsh/my-pi-setup/tree/main/extensions/file-search).

## Verification

```bash
npm run check
npm test
```
