# Assets / Recursos

Drop the real church branding here before building for the stores:

| File | Size | Used for |
|------|------|----------|
| `icon.png` | 1024×1024 px | App icon (both stores) |
| `splash.png` | 1284×2778 px | Launch/splash screen |

Until these exist, `npx expo start` will complain — either add the
files or temporarily remove the `icon`/`splash` lines from
`app.json` while testing.

También sube el video de bienvenida como `welcome.mp4` a la carpeta
`server/public/` del servidor (el app lo busca en
`https://tudominio.com/welcome.mp4`).
