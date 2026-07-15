# 🍞 Guía para subir el devocional

*Para la persona encargada de subir el video cada día. Todo el proceso
toma menos de un minuto.*

## Pasos

1. Abre **diariopan.com/upload** en tu navegador (computadora o teléfono).
2. La primera vez te pedirá la **contraseña de administrador**
   (te la da el administrador del sitio). Después de eso, el navegador
   la recuerda por 30 días.
3. Elige UNA de las dos formas de subir el video:
   - **Archivo:** toca el recuadro **"📹 Toca aquí o arrastra el video"**
     y elige el video del día, **o**
   - **Enlace de Facebook (más fácil):** si ya publicaste el video en
     Facebook, copia el enlace de esa publicación y pégalo en el campo
     **"Pega el enlace de Facebook"**. El servidor descarga el video
     solo — tú no tienes que descargar nada. (El video debe ser público.)
4. Revisa la **fecha**:
   - Si el video es para **hoy**, no toques nada (ya viene puesta la
     fecha de hoy).
   - Si lo estás subiendo por adelantado para **mañana**, elige la fecha
     de mañana. El video NO aparecerá en la app antes de esa fecha.
5. El **título es opcional** — si lo dejas vacío se genera solo
   ("Diario Pan – 04/07/2026").
6. Presiona **"Subir video"** y espera a que la barra llegue al final.
7. Cuando veas **"✅ ¡Listo!"**, terminaste. No hay que hacer nada más.

## ¿Qué pasa después, automáticamente?

- El video se guarda en el servidor **y** en el Google Drive de la
  iglesia (dos copias de seguridad).
- El día que corresponde, cada persona recibe su notificación **a la
  hora que ella misma eligió** en su teléfono.
- El video aparece en la lista de la app, sin anuncios.

## Si algo sale mal

| Mensaje | Qué significa | Qué hacer |
|---------|--------------|-----------|
| "Contraseña incorrecta" | Error al escribirla | Verifica con el administrador |
| "⚠️ ...la copia en Google Drive falló" | El video SÍ se subió y SÍ funciona, pero la copia de respaldo en Drive falló | Avísale al administrador, sin prisa |
| "No se pudo conectar con el servidor" | Problema de internet o el servidor está caído | Revisa tu internet; si persiste, avísale al administrador |

## ¿Olvidaste la contraseña?

No hay "recuperar contraseña" (a propósito: menos puertas que
atacar). El administrador la cambia en un minuto: editar
`ADMIN_PASSWORD` en `server/.env` del servidor y reiniciar la app
(`pm2 restart diario-pan`). La nueva contraseña vale al instante.
Nota: tras 5 intentos fallidos, la página bloquea ese dispositivo
por 15 minutos.
