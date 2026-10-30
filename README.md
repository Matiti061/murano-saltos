# Murano · Control de saltos

App web para contar los saltos de cada jugadora en los entrenamientos de voleibol, guardar el histórico y detectar picos de carga que aumentan el riesgo de lesión.

Funciona **en un solo dispositivo y sin internet** (tablet o móvil en el pabellón). Todos los datos se guardan en el propio navegador.

## Qué hace

- **Jugadoras**: nombre, dorsal, posición, estado (activa, readaptación, lesionada, baja) y un límite opcional de saltos por sesión.
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

## Datos y privacidad

- Los datos **solo existen en el dispositivo** donde se usa la app. Si se borran los datos del navegador o se pierde la tablet, se pierden.
- Haz una **copia de seguridad semanal** (Ajustes → Copia de seguridad) y guárdala en un sitio privado: contiene datos de salud.
- Para cambiar de dispositivo: exporta la copia en el viejo e impórtala en el nuevo.

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
  db/          base de datos (Dexie/IndexedDB): tipos, esquema y operaciones
  lib/         métricas, informe, PDF, CSV, copias de seguridad, datos de ejemplo
  hooks/       equipo activo, cargas del equipo, wake lock, cronómetro
  components/  piezas de interfaz (tarjeta de conteo, formularios, gráficas…)
  pages/       pantallas
  tests/       tests con Vitest
```

Stack: Vite + React + TypeScript, Tailwind CSS, Dexie, Recharts, jsPDF y vite-plugin-pwa.
