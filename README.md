# Murano · Control de saltos

App web para contar los saltos de cada jugadora en los entrenamientos de voleibol, guardar el histórico y detectar picos de carga que aumentan el riesgo de lesión.

Los datos se **sincronizan en la nube** ([Dexie Cloud](https://dexie.org/cloud/)): los mismos datos en el PC, otro ordenador o la tablet, desde cualquier red. También **funciona sin internet** en el pabellón; los cambios se suben solos al volver la conexión.

Publicada en https://matiti061.github.io/murano-saltos/ (cada push a `main` se publica solo con GitHub Actions).

## Qué hace

- **Jugadoras**: nombre, posición, estado (activa, readaptación, lesionada, baja) y un límite opcional de saltos por sesión. No se usan dorsales: todo se organiza por posición, en este orden: Armadora, Punta receptora, Opuesta, Central y Líbero.
- **Solo entrenamientos** (técnicos o de físico); los partidos se gestionan con otra herramienta.
- **Conteo en vivo**: un toque en la tarjeta suma un salto; −1 por jugadora y «Deshacer» general. Los saltos se separan por ejercicio (calentamiento, ataque, 6x6…). Avisa con vibración al 80 % del límite y al alcanzarlo. La pantalla no se apaga mientras cuentas.
- **Wellness antes de entrenar** (sueño, fatiga, dolor muscular, estrés) y **RPE** al terminar.
- **Molestias y lesiones** con zona, lado, intensidad y notas del fisio.
- **Informe PDF** de cada entrenamiento (también CSV para Excel) y opción de compartirlo desde la tablet.
- **Alertas**: ACWR de saltos y de carga interna, límites superados, wellness bajo y molestias activas.
- **Evolución**: gráficas por jugadora y por equipo, y semáforo de carga.
- **Registro manual** para pasar entrenamientos contados en papel.
- **Copia de seguridad** (exportar/importar) y exportación de todo el histórico a CSV.

## Uso

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173 (también accesible desde la red local)
npm test           # tests de métricas, informe y PDF
npm run build      # versión final en dist/
npm run preview    # sirve dist/ para probarla
```

### Instalarla en la tablet

Para que funcione sin conexión y se pueda «añadir a la pantalla de inicio» hace falta servirla por HTTPS. La carpeta `dist/` es una web estática: se puede publicar gratis en Netlify, Vercel, Cloudflare Pages o GitHub Pages. Después, desde la tablet: abrir la dirección → menú del navegador → «Instalar app» / «Añadir a pantalla de inicio».

## Sincronización y acceso

- Base de datos: `https://zyeafs1bj.dexie.cloud` (plan gratuito: hasta 3 usuarios y 100 MB).
- **Acceso:** se entra con el correo de la cuenta del club y un código que llega por email; cada dispositivo lo pide una sola vez. Hay que usar **siempre el mismo correo**: otro correo tendría sus propios datos, separados.
- La cuenta del club es de tipo *producción* (no caduca). Un correo nuevo entra como *evaluación* (30 días de uso); se puede pasar a producción en [manager.dexie.cloud](https://manager.dexie.cloud).
- **Espacio:** mientras se cuenta se guarda cada toque (para poder deshacer); al finalizar el entrenamiento se resumen por ejercicio en la asistencia y se borran, para que la nube ocupe poco.
- **Datos anteriores a la nube:** la base local antigua (`murano-saltos`) no se borra. Al iniciar sesión, la app ofrece subir sus datos una sola vez por dispositivo (sin el equipo de ejemplo).
- Las credenciales de administración (`dexie-cloud.json`, `dexie-cloud.key`) están solo en el PC de desarrollo y **no se suben al repositorio**. Con ellas se usa la CLI: `npx dexie-cloud whitelist <origen>` para autorizar nuevas direcciones web, `npx dexie-cloud export` para una copia completa del servidor.

## Datos y privacidad

- Los datos incluyen información de salud (molestias, wellness): solo se accede con la cuenta del club. Si hay jugadoras menores de edad, conviene contar con el consentimiento de ellas o de sus familias.
- Además de la nube, conviene descargar una **copia de seguridad** de vez en cuando (Ajustes → Copia de seguridad) y guardarla en un sitio privado. Importar una copia sustituye los datos en todos los dispositivos.

## Métricas

| Métrica | Cálculo |
|---|---|
| ACWR | Carga de los últimos 7 días ÷ media semanal de los últimos 28 días. Necesita ≥ 3 semanas de datos. Umbrales por defecto: < 0,8 carga baja · 0,8–1,3 óptimo · 1,3–1,5 pico · > 1,5 pico alto (configurables en Ajustes). |
| sRPE | RPE de la sesión (0-10) × minutos entrenados. |
| Wellness | Suma de 4 ítems de 1 a 5 (20 = mejor estado). Alerta si un ítem es ≤ 2 o la suma cae 3 puntos bajo la media personal. |

Son indicadores orientativos para apoyar al cuerpo técnico y médico, no un diagnóstico.

## Estructura

```
src/
  db/          base de datos (Dexie Cloud): tipos, esquema, operaciones y lectura de la base antigua
  lib/         métricas, informe, PDF, CSV, copias de seguridad, datos de ejemplo
  hooks/       equipo activo, cargas del equipo, wake lock, cronómetro
  components/  piezas de interfaz (tarjeta de conteo, formularios, gráficas…)
  pages/       pantallas
  tests/       tests con Vitest
```

Stack: Vite + React + TypeScript, Tailwind CSS, Dexie + Dexie Cloud, Recharts, jsPDF y vite-plugin-pwa.

## Datos de versiones anteriores

Al abrir una versión nueva, la app adapta sola los datos guardados en el dispositivo sin borrar nada: en la versión 2 las posiciones «Colocadora» y «Receptora» pasaron a «Armadora» y «Punta receptora» y se quitó el dorsal. Las copias de seguridad antiguas se convierten igual al importarlas.

En la versión 3 los datos pasaron a la nube con ids nuevos (de texto); la base local antigua se conserva como respaldo y se puede subir desde el aviso del Panel. Las copias de seguridad de cualquier versión se pueden importar.
