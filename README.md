# BSKF Sistema de Exámenes

Aplicación web vanilla para gestionar exámenes BSKF con panel de profesor, enlaces por token para examinadores y registro de resultados en Supabase.

## Archivos

- `index.html`: entrada de la aplicación.
- `styles.css`: diseño responsive.
- `app.mjs`: lógica de interfaz y Supabase.
- `exam-core.mjs`: lógica testeable de syllabus, tokens, validación y cálculo.
- `exam-core.test.mjs`: tests básicos de cálculo y validación.
- `supabase_exam_system.sql`: tablas, RLS, trigger de perfil y RPCs para enlaces de examinador.
- `dev-server.cjs`: servidor local estático.

## Instalación en Supabase

1. Abre el proyecto Supabase `zipfwmmwcawfbqofhwmc`.
2. Ve a SQL Editor.
3. Ejecuta el contenido completo de `supabase_exam_system.sql`.
4. En Authentication, revisa si quieres confirmación de email activada. Si está activada, el profesor debe confirmar el email antes de entrar.

## Ejecutar local

Desde esta carpeta:

```bash
node dev-server.cjs
```

Luego abre:

```text
http://localhost:4173/
```

## Flujo

Profesor:

1. Registro o login.
2. Configura club.
3. Crea examen con técnicas, estudiantes y examinadores.
4. Copia los enlaces generados desde “Ver detalles”.
5. Consulta resultados cuando los examinadores envíen evaluación.

Examinador:

1. Abre el enlace con `?exam=TOKEN`.
2. Evalúa cada estudiante y técnica.
3. Envía una vez. Después no puede modificar.
