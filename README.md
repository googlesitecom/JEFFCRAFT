# 🎮 MINICRAFT

Un clon de Minecraft construido desde cero con **Next.js 16 + Three.js + TypeScript**. Mundo voxel 3D infinito con generación procedural, crafteo, supervivencia, animales y mucho más.

![Minicraft](https://img.shields.io/badge/Minicraft-voxel%20sandbox-blue) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![Three.js](https://img.shields.io/badge/Three.js-3D-green) ![TypeScript](https://img.shields.io/badge/TypeScript-typed-blue)

## ✨ Características

### 🌍 Mundo Voxel 3D
- **Mundo infinito procedural** con simplex noise (terreno, cuevas, árboles, minerales)
- **Streaming de chunks dinámico** — carga/descarga chunks según la posición del jugador
- **22 tipos de bloques** con texturas pixeladas procedurales (16×16)
- **Atlas de texturas** con padding anti-bleeding
- **3 capas de renderizado**: opaco, cutout (hojas/vidrio), translúcido (agua)

### 🎮 Modos de Juego
- **Creativo**: vuelo libre, bloques infinitos, todos los objetos disponibles, sin daño
- **Survival**: empieza sin nada, mina bloques, craftea herramientas, caza animales, cocida comida, manage salud/hambre

### ⛏️ Mecánicas de Minado
- **Tiempo de minado** basado en dureza del bloque y herramienta
- **Animación de grietas 3D** sobre el bloque (estilo Minecraft, no barra de progreso)
- **Herramientas aceleran el minado**: pico, hacha, espada, pala en 5 materiales
- **Piedra y minerales requieren pico**

### 🔨 Crafteo
- **Mesa de crafteo** (3×3) — crafteable con 4 tablones
- **Horno** — crafteable con 8 adoquines, cocina comida y funde minerales
- **Libro de recetas** con TODAS las recetas del juego
- **25+ recetas**: palos, tablones, mesa, horno, herramientas de madera/piedra/hierro/oro/diamante

### 🐮 Animales 3D
- **Vaca, cerdo, pollo** con modelos 3D de cajas (cuerpo, cabeza, patas, detalles)
- **IA mejorada**: vagan, huyen del jugador, saltan obstáculos, animación de caminado
- **Drops de comida** al matarlos (carne cruda → cocinar en horno → comida cocida)

### 🌅 Ciclo Día/Noche
- Sol y luna que atraviesan el cielo
- Estrellas que brillan de noche
- Iluminación dinámica y color del cielo que cambia
- Skybox con gradiente procedural

### 💾 Sistema de Guardado
- **Guarda/carga mundos** con localStorage
- Preserva: posición, inventario, bloques modificados, hora del día
- Múltiples mundos guardados con nombres

### 🎨 Gráficos
- Tone mapping ACES Filmic para colores cinematográficos
- Niebla atmosférica
- Iluminación: ambiental + solar direccional + hemisférica
- Skybox shader con gradiente

## 🕹️ Controles

| Tecla | Acción |
|-------|--------|
| **WASD** | Moverse |
| **Mouse** | Mirar alrededor |
| **Espacio** | Saltar / Nadar hacia arriba |
| **Shift** | Correr |
| **Click izq** | Minar bloque / Atacar animal |
| **Click der / M** | Colocar bloque / Abrir mesa-horno |
| **1-9 / Rueda** | Seleccionar slot del hotbar |
| **E** | Abrir inventario |
| **F** | Vuelo (solo creativo) |
| **Esc** | Pausa |

## 🚀 Instalación

```bash
# Clonar el repositorio
git clone https://github.com/TU_USUARIO/minicraft.git
cd minicraft

# Instalar dependencias
bun install
# o
npm install

# Iniciar servidor de desarrollo
bun run dev
# o
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Lenguaje**: TypeScript 5
- **3D**: Three.js
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Ruido procedural**: simplex-noise
- **Estado**: React hooks + Zustand

## 📁 Estructura del Proyecto

```
src/
├── lib/minecraft/
│   ├── blocks.ts        # Definiciones de bloques
│   ├── items.ts         # Items (comida, materiales, herramientas)
│   ├── world.ts         # Generación procedural del mundo
│   ├── mesher.ts        # Constructor de geometría de chunks
│   ├── player.ts        # Controlador de jugador y física
│   ├── animals.ts       # Animales 3D con IA
│   ├── recipes.ts       # Sistema de recetas
│   ├── inventory.ts     # Sistema de inventario
│   ├── save.ts          # Guardado/carga de mundos
│   ├── atlas.ts         # Atlas de texturas
│   ├── textures.ts      # Texturas procedurales de bloques
│   ├── item-textures.ts # Texturas procedurales de items
│   └── sound.ts         # Efectos de sonido WebAudio
├── components/minecraft/
│   ├── MinecraftGame.tsx # Componente principal del juego
│   ├── InventoryUI.tsx   # UI de inventario y crafteo
│   └── FurnaceUI.tsx     # UI del horno
└── app/
    └── page.tsx          # Página principal
```

## 🎯 Cómo Jugar (Survival)

1. **Punch árboles** (mantén click izq) → consigue troncos
2. Abre inventario (**E**) → craftea **tablones** → **palos** → **mesa de crafteo**
3. Coloca la mesa y ábrela (**M** mirándola) → craftea **pico de madera**
4. Pica piedra → craftea **horno** (8 adoquines)
5. Busca **animales** y atácalos → recoge carne cruda
6. Pica **mineral de carbón** → consigue carbón
7. Coloca el horno, ábrelo (**M**) → mete carne + carbón → cocina
8. ¡Come carne cocida para restaurar hambre!

## 📝 Licencia

2026- Axion Studios

## 🙏 Agradecimientos

Inspirado en Minecraft de Mojang. Este es un proyecto educativo, no afiliado con Mojang o Microsoft.
