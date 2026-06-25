// Script to patch MinecraftGame.tsx with all missing features
// This adds: chat, bullets, dimensions, bed/door/sign, weather, creative inv, Ender Eye, etc.
const fs = require('fs');
const path = '/home/z/my-project/src/components/minecraft/MinecraftGame.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add missing state declarations after showGraphicsRef
const stateInsert = `
  // Spawn point (set by sleeping in bed)
  const spawnPointRef = useRef<{ x: number; y: number; z: number } | null>(null);
  // Sign editing state
  const [signEditing, setSignEditing] = useState<{ x: number; y: number; z: number } | null>(null);
  const [signText, setSignText] = useState<string[]>(["", "", "", ""]);
  const signEditingRef = useRef(false);
  // Bed sleep fade overlay
  const [sleepFade, setSleepFade] = useState(0);
  // Door state tracking
  const openDoorsRef = useRef<Set<string>>(new Set());
  // Overworld return position (saved before teleporting to Nether)
  const overworldReturnPos = useRef<{ x: number; y: number; z: number } | null>(null);
  // End Portal frame eyes
  const endPortalEyesRef = useRef<Set<string>>(new Set());
  // Chat system (T key)
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ text: string; type: "chat" | "system" }[]>([]);
  // Weather command ref
  const weatherCommandRef = useRef<string | null>(null);
  // Dimension command ref
  const dimensionCommandRef = useRef<string | null>(null);
  // Item name display timer
  const [itemNameVisible, setItemNameVisible] = useState(false);
  const itemNameTimerRef = useRef<number>(0);
  const prevHeldItemIdRef = useRef<number | null>(null);`;

if (!code.includes('spawnPointRef')) {
  code = code.replace(
    'const gfxNeedsRebuildRef = useRef(false);',
    `const gfxNeedsRebuildRef = useRef(false);${stateInsert}`
  );
}

// 2. Add chat command processor (useCallback) after gfxNeedsRebuildRef
const chatProcessor = `
  // === Chat command processor ===
  const processChatCommand = useCallback((cmd: string) => {
    const parts = cmd.toLowerCase().split(/\\s+/);
    const command = parts[0];
    const addMsg = (text: string) => setChatMessages(prev => [...prev, { text, type: "system" }]);
    if (command === "/help") {
      addMsg("=== Comandos ===");
      addMsg("/time set <day|night|noon|midnight>");
      addMsg("/gamemode <0|1|creative|survival>");
      addMsg("/tp <x> <y> <z>");
      addMsg("/give <item> [count]");
      addMsg("/heal /feed /weather <clear|rain|thunder>");
      addMsg("/dimension <overworld|nether|end>");
      addMsg("/clear");
    } else if (command === "/time") {
      if (parts[1] === "set" && parts[2]) {
        const t = parts[2];
        if (t === "day") { dayTimeRef.current = 0.3; addMsg("Día"); }
        else if (t === "night") { dayTimeRef.current = 0.8; addMsg("Noche"); }
        else if (t === "noon") { dayTimeRef.current = 0.5; addMsg("Mediodía"); }
        else if (t === "midnight") { dayTimeRef.current = 0.0; addMsg("Medianoche"); }
        else { const n = parseFloat(t); if (!isNaN(n)) { dayTimeRef.current = n; addMsg("Tiempo: " + n); } }
      }
    } else if (command === "/gamemode") {
      const gm = parts[1];
      if ((gm === "creative" || gm === "1" || gm === "c") && worldConfigRef.current) {
        worldConfigRef.current.mode = "creative"; setCurrentWorld({ ...worldConfigRef.current }); addMsg("Creativo");
      } else if ((gm === "survival" || gm === "0" || gm === "s") && worldConfigRef.current) {
        worldConfigRef.current.mode = "survival"; setCurrentWorld({ ...worldConfigRef.current }); addMsg("Survival");
      }
    } else if (command === "/tp" || command === "/teleport") {
      const x = parseFloat(parts[1]), y = parseFloat(parts[2]), z = parseFloat(parts[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z) && playerRef.current) { playerRef.current.position.set(x, y, z); addMsg("TP: " + x + "," + y + "," + z); }
    } else if (command === "/give") {
      const itemName = parts[1], count = parts[2] ? parseInt(parts[2]) : 64;
      if (itemName) {
        const allItems = [...Object.values(BLOCKS), ...Object.values(ITEMS)] as any[];
        const found = allItems.find(it => it && it.name && it.name.toLowerCase().replace(/\\s+/g, "_") === itemName);
        if (found) { inventoryRef.current.addItem(found.id, count); setInventoryVersion(v => v + 1); addMsg("Dado: " + found.name + " x" + count); }
        else addMsg("No encontrado: " + itemName);
      }
    } else if (command === "/heal") { if (playerRef.current) { playerRef.current.health = playerRef.current.maxHealth; addMsg("Curado"); } }
    else if (command === "/feed") { if (playerRef.current) { playerRef.current.hunger = playerRef.current.maxHunger; addMsg("Alimentado"); } }
    else if (command === "/weather") { if (parts[1] === "clear" || parts[1] === "rain" || parts[1] === "thunder") { weatherCommandRef.current = parts[1]; addMsg("Clima: " + parts[1]); } }
    else if (command === "/dimension" || command === "/dim") { if (parts[1] === "overworld" || parts[1] === "nether" || parts[1] === "end") { dimensionCommandRef.current = parts[1]; addMsg("Dimensión: " + parts[1]); } }
    else if (command === "/clear") { inventoryRef.current.clear(); setInventoryVersion(v => v + 1); addMsg("Inventario vaciado"); }
    else addMsg("Desconocido: " + command);
  }, []);`;

if (!code.includes('processChatCommand')) {
  code = code.replace(
    'const prevHeldItemIdRef = useRef<number | null>(null);',
    `const prevHeldItemIdRef = useRef<number | null>(null);${chatProcessor}`
  );
}

fs.writeFileSync(path, code);
console.log('Patched MinecraftGame.tsx with state + chat processor');
