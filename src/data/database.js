// database.js

// --- Local role icons (icons/ folder) ---
// Inline style on every img guarantees size regardless of parent CSS overrides
window.roleIcons = {
    TOP:   `<img src="icons/Top_icon.png"        style="width:16px;height:16px;display:inline-block;vertical-align:middle;flex-shrink:0" alt="TOP">`,
    JNG:   `<img src="icons/Jungle_icon.png"     style="width:16px;height:16px;display:inline-block;vertical-align:middle;flex-shrink:0" alt="JNG">`,
    MID:   `<img src="icons/Middle_icon.png"     style="width:16px;height:16px;display:inline-block;vertical-align:middle;flex-shrink:0" alt="MID">`,
    ADC:   `<img src="icons/Bottom_icon.png"     style="width:16px;height:16px;display:inline-block;vertical-align:middle;flex-shrink:0" alt="ADC">`,
    SUP:   `<img src="icons/Support_icon.png"    style="width:16px;height:16px;display:inline-block;vertical-align:middle;flex-shrink:0" alt="SUP">`,
    COACH: `<img src="icons/Specialist_icon.png" style="width:16px;height:16px;display:inline-block;vertical-align:middle;flex-shrink:0" alt="COACH">`,
    SUB1: `↕`, SUB2: `↕`, SUB3: `↕`
};
window.roleIconsLg = {
    TOP:   `<img src="icons/Top_icon.png"        style="width:48px;height:48px;opacity:0.65" alt="TOP">`,
    JNG:   `<img src="icons/Jungle_icon.png"     style="width:48px;height:48px;opacity:0.65" alt="JNG">`,
    MID:   `<img src="icons/Middle_icon.png"     style="width:48px;height:48px;opacity:0.65" alt="MID">`,
    ADC:   `<img src="icons/Bottom_icon.png"     style="width:48px;height:48px;opacity:0.65" alt="ADC">`,
    SUP:   `<img src="icons/Support_icon.png"    style="width:48px;height:48px;opacity:0.65" alt="SUP">`,
    COACH: `<img src="icons/Specialist_icon.png" style="width:48px;height:48px;opacity:0.65" alt="COACH">`,
    SUB1:  `<span style="font-size:2.5rem;opacity:0.4">↕</span>`,
    SUB2:  `<span style="font-size:2.5rem;opacity:0.4">↕</span>`,
    SUB3:  `<span style="font-size:2.5rem;opacity:0.4">↕</span>`
};

// --- Player nationality flags ---
window.regionDefaultFlags = { LCK: "🇰🇷", LPL: "🇨🇳", LEC: "🇪🇺", LCS: "🇺🇸", LCP: "🌏", Legacy: "🏆" };
window.playerNationalityOverrides = {
    // LPL — Korean imports
    "Rookie": "🇰🇷", "Tarzan": "🇰🇷", "MISSING": "🇰🇷", "Scout": "🇰🇷",
    "Viper": "🇰🇷", "ON": "🇰🇷", "Ruler": "🇰🇷",
    // LEC — Danish
    "Caps": "🇩🇰", "Humanoid": "🇨🇿", "BrokenBlade": "🇩🇪", "Upset": "🇩🇪",
    "Jankos": "🇵🇱", "Inspired": "🇵🇱", "Flakked": "🇪🇸", "Malrang": "🇰🇷",
    "Hans sama": "🇫🇷", "Rekkles": "🇸🇪", "Perkz": "🇭🇷", "Mikyx": "🇸🇮",
    "Wunder": "🇩🇰", "Jactroll": "🇫🇷", "xMatty": "🇫🇷",
    "Nemesis": "🇸🇮", "Alphari": "🇬🇧", "Odoamne": "🇷🇴", "Hylissang": "🇧🇬",
    "Razork": "🇪🇸", "Alvaro": "🇪🇸", "Jun": "🇰🇷", "Yike": "🇸🇪",
    "Caliste": "🇫🇷", "Sertuss": "🇱🇹", "Patrik": "🇨🇿", "Cinkrof": "🇵🇱",
    "Doss": "🇩🇰", "Jackies": "🇰🇷", "Canna": "🇰🇷",
    // LEC 2025 — new players & corrected flags
    "Oscarinin": "🇪🇸", "Poby": "🇰🇷", "Upset": "🇩🇪",
    "SkewMond": "🇫🇷", "Hans Sama": "🇫🇷", "Labrov": "🇬🇷",
    "Lot": "🇹🇷", "Isma": "🇫🇷", "Noah": "🇰🇷",
    "Vladi": "🇬🇷", "Targamas": "🇧🇪",
    "Myrwn": "🇪🇸", "Elyoya": "🇪🇸", "Jojopyun": "🇺🇸", "Supa": "🇪🇸",
    "Adam": "🇫🇷", "Thayger": "🇧🇷", "Larssen": "🇩🇰", "Hans SamD": "🇰🇷", "Malrang": "🇰🇷",
    "DnDn": "🇰🇷", "Skeanz": "🇫🇷", "Abbedagge": "🇩🇪", "Keduii": "🇩🇪", "Loopy": "🇰🇷",
    "Rooster": "🇰🇷", "Boukada": "🇫🇷", "Nuc": "🇫🇷", "Ice": "🇰🇷", "Parus": "🇹🇷",
    "Carlsen": "🇩🇰", "Sheo": "🇫🇷", "Kamiloo": "🇫🇷", "Stend": "🇫🇷",
    "Naak Nako": "🇹🇷", "Lyncas": "🇻🇪", "Czajek": "🇵🇱", "Carzzy": "🇨🇿", "Fleshy": "🇹🇷",
    // LEC 2025 head coaches
    "GrabbZ": "🇩🇪", "Dylan Falco": "🇬🇧", "Guilhoto": "🇧🇷", "fredy122": "🇩🇪",
    "Own3r": "🇸🇪", "Machuki": "🇪🇸",
    // LEC 2026 FNC new players
    "Empyros": "🇬🇷", "Lospa": "🇰🇷",
    // LPL 2025 — Korean imports & non-Chinese players
    "Tarzan": "🇰🇷", "Kael": "🇰🇷", "TheShy": "🇰🇷", "Doinb": "🇰🇷",
    "Moham": "🇰🇷", "Hoya": "🇰🇷", "SeTab": "🇰🇷", "Karis": "🇰🇷",
    "Taeyoon": "🇰🇷", "Kanavi": "🇰🇷", "Peyz": "🇰🇷",
    "Shad0w": "🇮🇹", "1Jiang": "🇹🇼", "Wako": "🇹🇼",
    // LPL 2025 coaches (Korean)
    "Homme": "🇰🇷", "Heart": "🇰🇷", "NoFe": "🇰🇷", "Daeny": "🇰🇷",
    "ppgod": "🇺🇸", "Tabe": "🇹🇼",
    // LCS — notable nationalities
    "Jensen": "🇩🇰", "Bjergsen": "🇩🇰", "Bjerge": "🇩🇰",
    "Doublelift": "🇺🇸", "CoreJJ": "🇰🇷", "Faker": "🇰🇷",
    "Licorice": "🇺🇸", "Blaber": "🇺🇸", "Zven": "🇩🇰",
    // Other regions
    "LazyFeel": "🇻🇳", "SofM": "🇻🇳",
    // LCP — Korean imports
    "Pungyeon": "🇰🇷", "Citrus": "🇰🇷", "Keine": "🇰🇷", "Gaeng": "🇰🇷",
    "Van1": "🇰🇷", "Aria": "🇰🇷", "Vsta": "🇰🇷",
    // LCP — Japanese players
    "RayFarky": "🇯🇵", "Momo": "🇯🇵", "Kakkun": "🇯🇵", "Evi": "🇯🇵", "Marble": "🇯🇵",
    // LCS 2026 imports & non-US natives
    "Photon": "🇰🇷", "IgNar": "🇰🇷", "FBI": "🇦🇺",
    "Morgan": "🇰🇷", "Josedeodo": "🇨🇴",
    "Saint": "🇰🇷", "Berseker": "🇰🇷",
    "Impact": "🇰🇷", "HamBak": "🇰🇷", "Rahel": "🇰🇷", "huhi": "🇰🇷",
    "Fudge": "🇦🇺", "Bvoy": "🇰🇷", "Ceos": "🇧🇷",
    "Gakgos": "🇹🇷", "Quad": "🇰🇷",
    "Castle": "🇰🇷", "Callme": "🇰🇷",
    "Reignover": "🇰🇷", "Reven": "🇰🇷", "Zinie": "🇰🇷",
    // Legacy/Champion region wildcards
    // Fnatic 2011
    "xPeke": "🇪🇸", "Cyanide": "🇫🇮", "Shushei": "🇵🇱", "LamiaZealot": "🇧🇪", "Mellisan": "🇸🇪",
    // TPA 2012
    "Stanley": "🇹🇼", "lilballz": "🇹🇼", "Toyz": "🇹🇼", "Bebe": "🇹🇼", "MiSTakE": "🇹🇼",
    // SKT 2013
    "Piglet": "🇰🇷", "PoohManDu": "🇰🇷",
};

window.regionLogos = { LCK: "🇰🇷 LCK", LPL: "🇨🇳 LPL", LEC: "🇪🇺 LEC", LCS: "🇺🇸 LCS", LCP: "🌏 LCP", Champion: "👑 ICON" };
window.teamLineageBridges = { 
    "SKT": "T1", "SKT T1": "T1", "SSG": "Gen.G", "SSW": "Gen.G", "Samsung Galaxy": "Gen.G", 
    "FNC": "Fnatic", "ROX": "HLE", "DK": "Dplus KIA", "IG": "Invictus Gaming", "FPX": "FunPlus Phoenix", 
    "DRX": "DragonX", "EDG": "EDward Gaming", "RNG": "Royal Never Give Up", "KC": "Karmine Corp", 
    "MKOI": "Movistar KOI", "GX": "GIANTX", "VIT": "Team Vitality", "TH": "Team Heretics", 
    "SK": "SK Gaming", "NAVI": "Natus Vincere", "KCB": "Karmine Corp Blue", "LR": "Los Ratones",
    "BDS": "Shifters",
    "NS": "Nongshim RedForce", "DNS": "DN SOOPers", "BRO": "BRION", "BFX": "BNK FEARX",
    "AL": "Anyone's Legend", "BLG": "Bilibili Gaming", "JDG": "JD Gaming", "TES": "Top Esports", 
    "WBG": "Weibo Gaming", "WE": "Team WE", "TT": "ThunderTalk Gaming", "LGD": "LGD Gaming", "OMG": "Oh My God", "UP": "Ultra Prime",
    "CJ": "CJ Entus", "GET": "GE Tigers", "IM": "Incredible Miracle", "JAG": "Jin Air Green Wings", "NJ": "NaJin e-mFire",
    "EP": "Energy Pacemaker", "GT": "Gamtee", "King": "Team King", "M3": "Masters 3", "Snake": "Snake Esports",
    "SHRC": "Star Horn Royal Club", "VG": "Vici Gaming",
    "CW": "Copenhagen Wolves", "EL": "Elements", "GMB": "Gambit Gaming", "GIA": "Giants Gaming",
    "H2K": "H2k-Gaming", "OG": "Origen", "ROC": "Team ROCCAT", "UOL": "Unicorns of Love",
    "AF": "Afreeca Freecs", "ESC": "ESC Ever", "LZ": "Longzhu Gaming", "MVP2016": "MVP",
    "GT": "Game Talents", "IM2016": "I May", "NB": "Newbee", "SAT": "Saint Gaming",
    "S04": "FC Schalke 04", "SPY": "Splyce", "VIT": "Team Vitality", "G2": "G2 Esports",
    "KOO": "GE Tigers",
    "CFO": "CTBC Flying Oyster", "MGN": "MGN Vikings",
     "DCG": "Deep Cross Gaming", "FE": "Frank Esports",
    "HP": "HELL PIGS", "JT": "J Team", "PSG": "PSG Talon", "WPE": "West Point Esports",
    "C9": "Cloud9", "CLG": "Counter Logic Gaming", "NME": "Enemy", "GV": "Gravity",
    "T8": "Team 8", "DIG": "Dignitas", "TDK": "Team Dragon Knights", "TIP": "Team Impulse"
};

function genStats(rating) {
    const v = () => Math.floor(Math.random() * 8) - 4; 
    return { mec: Math.min(99, rating + v()), frm: Math.min(99, rating + v()), map: Math.min(99, rating + v()), tmf: Math.min(99, rating + v()), cmp: Math.min(99, rating + v()), ldr: Math.min(99, rating + v()) };
}

const baseDatabase = [
    // ==========================================
    // --- 1. 2026 SEASON ROSTERS (PLAYERS & COACHES) ---
    // ==========================================
    
    // --- 2026 COACHES ---
    { id: 8001, name: "kkOma", role: "COACH", team: "T1", year: 2026, rating: 97, quality: "Master", region: "LCK", stats: { mec: 22, tmf: 94, frm: 97, cmp: 97, map: 98, ldr: 99 } },
    { id: 8002, name: "Ryu", role: "COACH", team: "Gen.G", year: 2026, rating: 94, quality: "Diamond", region: "LCK", stats: { mec: 30, tmf: 92, frm: 92, cmp: 90, map: 94, ldr: 92 } },
    { id: 8003, name: "Homme", role: "COACH", team: "HLE", year: 2026, rating: 97, quality: "Master", region: "LCK", stats: { mec: 25, tmf: 97, frm: 97, cmp: 96, map: 97, ldr: 96 } },
    { id: 8004, name: "cvMax", role: "COACH", team: "DK", year: 2026, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 35, tmf: 89, frm: 90, cmp: 88, map: 90, ldr: 91 } },
    { id: 8005, name: "Score", role: "COACH", team: "KT", year: 2026, rating: 93, quality: "Diamond", region: "LCK", stats: { mec: 25, tmf: 93, frm: 95, cmp: 95, map: 96, ldr: 94 } },
    { id: 8006, name: "Edo", role: "COACH", team: "BFX", year: 2026, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 20, tmf: 85, frm: 85, cmp: 84, map: 86, ldr: 85 } },
    { id: 8007, name: "DanDy", role: "COACH", team: "NS", year: 2026, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 40, tmf: 90, frm: 90, cmp: 88, map: 94, ldr: 89 } },
    { id: 8008, name: "Joker", role: "COACH", team: "DRX", year: 2026, rating: 84, quality: "Gold", region: "LCK", stats: { mec: 22, tmf: 84, frm: 84, cmp: 83, map: 85, ldr: 84 } },
    { id: 8009, name: "SSONG", role: "COACH", team: "BRO", year: 2026, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 28, tmf: 83, frm: 84, cmp: 82, map: 84, ldr: 85 } },
    { id: 8010, name: "oDin", role: "COACH", team: "DNS", year: 2026, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 24, tmf: 86, frm: 87, cmp: 85, map: 88, ldr: 87 } },
    { id: 8011, name: "Helper", role: "COACH", team: "AL", year: 2026, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 24, tmf: 86, frm: 87, cmp: 85, map: 88, ldr: 89 } },
    { id: 8012, name: "Daeny", role: "COACH", team: "BLG", year: 2026, rating: 97, quality: "Grandmaster", region: "LPL", stats: { mec: 32, tmf: 97, frm: 98, cmp: 96, map: 99, ldr: 98 } },
    { id: 8013, name: "Mafa", role: "COACH", team: "IG", year: 2026, rating: 90, quality: "Platinum", region: "LPL", stats: { mec: 24, tmf: 89, frm: 91, cmp: 91, map: 92, ldr: 92 } },
    { id: 8014, name: "Tabe", role: "COACH", team: "JDG", year: 2026, rating: 92, quality: "Diamond", region: "LPL", stats: { mec: 22, tmf: 91, frm: 93, cmp: 93, map: 94, ldr: 94 } },
    { id: 8015, name: "Poppy", role: "COACH", team: "TES", year: 2026, rating: 88, quality: "Gold", region: "LPL", stats: { mec: 23, tmf: 86, frm: 88, cmp: 87, map: 89, ldr: 89 } },
    { id: 8016, name: "Shine", role: "COACH", team: "WBG", year: 2026, rating: 89, quality: "Diamond", region: "LPL", stats: { mec: 24, tmf: 88, frm: 90, cmp: 89, map: 90, ldr: 91 } },
    { id: 8017, name: "Mni", role: "COACH", team: "EDG", year: 2026, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 22, tmf: 82, frm: 84, cmp: 82, map: 85, ldr: 85 } },
    { id: 8018, name: "Maizijian", role: "COACH", team: "NIP", year: 2026, rating: 86, quality: "Gold", region: "LPL", stats: { mec: 25, tmf: 84, frm: 86, cmp: 85, map: 86, ldr: 87 } },
    { id: 8019, name: "JinJin", role: "COACH", team: "WE", year: 2026, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 20, tmf: 81, frm: 82, cmp: 81, map: 83, ldr: 84 } },
    { id: 8020, name: "NONAME", role: "COACH", team: "TT", year: 2026, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 21, tmf: 80, frm: 81, cmp: 80, map: 82, ldr: 83 } },
    { id: 8021, name: "1874", role: "COACH", team: "LGD", year: 2026, rating: 80, quality: "Gold", region: "LPL", stats: { mec: 19, tmf: 79, frm: 80, cmp: 78, map: 81, ldr: 82 } },
    { id: 8022, name: "Edgar", role: "COACH", team: "LNG", year: 2026, rating: 94, quality: "Master", region: "LPL", stats: { mec: 21, tmf: 93, frm: 94, cmp: 93, map: 95, ldr: 96 } },
    { id: 8023, name: "chengz", role: "COACH", team: "OMG", year: 2026, rating: 79, quality: "Silver", region: "LPL", stats: { mec: 18, tmf: 78, frm: 79, cmp: 77, map: 80, ldr: 80 } },
    { id: 8024, name: "Yuzhang", role: "COACH", team: "UP", year: 2026, rating: 78, quality: "Silver", region: "LPL", stats: { mec: 17, tmf: 77, frm: 78, cmp: 76, map: 79, ldr: 78 } },
    { id: 8025, name: "Dylan Falco", role: "COACH", team: "G2", year: 2026, rating: 93, quality: "Diamond", region: "LEC", stats: { mec: 18, tmf: 93, frm: 94, cmp: 92, map: 96, ldr: 95 } },
    { id: 8026, name: "Melzhet", role: "COACH", team: "MKOI", year: 2026, rating: 88, quality: "Gold", region: "LEC", stats: { mec: 20, tmf: 86, frm: 89, cmp: 89, map: 91, ldr: 91 } },
    { id: 8027, name: "GrabbZ", role: "COACH", team: "FNC", year: 2026, rating: 90, quality: "Platinum", region: "LEC", stats: { mec: 24, tmf: 88, frm: 91, cmp: 91, map: 92, ldr: 93 } },
    { id: 8028, name: "Reapered", role: "COACH", team: "KC", year: 2026, rating: 92, quality: "Diamond", region: "LEC", stats: { mec: 28, tmf: 91, frm: 93, cmp: 94, map: 93, ldr: 95 } },
    { id: 8029, name: "Guilhoto", role: "COACH", team: "GX", year: 2026, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 22, tmf: 84, frm: 86, cmp: 85, map: 88, ldr: 88 } },
    { id: 8030, name: "Pad", role: "COACH", team: "VIT", year: 2026, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 20, tmf: 84, frm: 85, cmp: 83, map: 87, ldr: 87 } },
    { id: 8031, name: "Striker", role: "COACH", team: "Shifters", year: 2026, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 23, tmf: 82, frm: 84, cmp: 82, map: 85, ldr: 86 } },
    { id: 8032, name: "Hidon", role: "COACH", team: "TH", year: 2026, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 21, tmf: 81, frm: 83, cmp: 83, map: 84, ldr: 84 } },
    { id: 8033, name: "OWN3R", role: "COACH", team: "SK", year: 2026, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 25, tmf: 83, frm: 84, cmp: 82, map: 85, ldr: 85 } },
    { id: 8034, name: "TheRock", role: "COACH", team: "NAVI", year: 2026, rating: 80, quality: "Silver", region: "LEC", stats: { mec: 20, tmf: 78, frm: 81, cmp: 79, map: 82, ldr: 83 } },
    { id: 8035, name: "Blidzy", role: "COACH", team: "KCB", year: 2026, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 22, tmf: 80, frm: 82, cmp: 81, map: 82, ldr: 83 } },
    { id: 8036, name: "YamatoCannon", role: "COACH", team: "LR", year: 2026, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 20, tmf: 86, frm: 89, cmp: 88, map: 90, ldr: 93 } },
    { id: 8037, name: "Inero",      role: "COACH", team: "C9",  year: 2026, rating: 89, quality: "Diamond",  region: "LCS", stats: { mec: 28, tmf: 88, frm: 90, cmp: 89, map: 91, ldr: 90 } },
    { id: 8038, name: "Spawn",      role: "COACH", team: "TL",  year: 2026, rating: 84, quality: "Gold",     region: "LCS", stats: { mec: 22, tmf: 84, frm: 85, cmp: 84, map: 86, ldr: 86 } },
    { id: 8039, name: "Swiffer",    role: "COACH", team: "DIG", year: 2026, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 20, tmf: 82, frm: 83, cmp: 82, map: 83, ldr: 84 } },
    { id: 8040, name: "Thinkcard",  role: "COACH", team: "FLY", year: 2026, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 22, tmf: 85, frm: 86, cmp: 85, map: 87, ldr: 87 } },
    { id: 8041, name: "Reignover",  role: "COACH", team: "LYON",year: 2026, rating: 87, quality: "Diamond",  region: "LCS", stats: { mec: 26, tmf: 87, frm: 88, cmp: 88, map: 89, ldr: 88 } },
    { id: 8042, name: "Goldenglue", role: "COACH", team: "SEN", year: 2026, rating: 80, quality: "Gold",     region: "LCS", stats: { mec: 20, tmf: 80, frm: 81, cmp: 80, map: 82, ldr: 82 } },
    { id: 8043, name: "Reven",      role: "COACH", team: "SR",  year: 2026, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 20, tmf: 82, frm: 83, cmp: 82, map: 83, ldr: 84 } },
    { id: 8044, name: "ido",        role: "COACH", team: "DSG",  year: 2026, rating: 81, quality: "Gold",     region: "LCS", stats: { mec: 20, tmf: 81, frm: 82, cmp: 81, map: 82, ldr: 83 } },
    // --- 2025 LCK COACHES ---
    { id: 8045, name: "Edgar",      role: "COACH", team: "BRO",  year: 2025, rating: 82, quality: "Gold",     region: "LCK", stats: { mec: 20, tmf: 82, frm: 83, cmp: 81, map: 83, ldr: 84 } },
    { id: 8046, name: "PoohManDu",  role: "COACH", team: "DK",   year: 2025, rating: 89, quality: "Diamond",  region: "LCK", stats: { mec: 28, tmf: 88, frm: 90, cmp: 89, map: 91, ldr: 93 } },
    { id: 8047, name: "SSONG",      role: "COACH", team: "DRX",  year: 2025, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 24, tmf: 85, frm: 86, cmp: 84, map: 86, ldr: 87 } },
    { id: 8048, name: "Ryu",        role: "COACH", team: "BFX",  year: 2025, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 28, tmf: 85, frm: 87, cmp: 85, map: 88, ldr: 88 } },
    { id: 8049, name: "RapidStar",  role: "COACH", team: "DNS",  year: 2025, rating: 87, quality: "Diamond",  region: "LCK", stats: { mec: 35, tmf: 86, frm: 88, cmp: 86, map: 89, ldr: 90 } },
    { id: 8050, name: "Kim",        role: "COACH", team: "Gen.G",year: 2025, rating: 88, quality: "Diamond",  region: "LCK", stats: { mec: 22, tmf: 87, frm: 89, cmp: 88, map: 90, ldr: 92 } },
    { id: 8051, name: "DanDy",      role: "COACH", team: "HLE",  year: 2025, rating: 91, quality: "Diamond",  region: "LCK", stats: { mec: 38, tmf: 90, frm: 90, cmp: 88, map: 92, ldr: 90 } },
    { id: 8052, name: "Score",      role: "COACH", team: "KT",   year: 2025, rating: 92, quality: "Diamond",  region: "LCK", stats: { mec: 30, tmf: 91, frm: 93, cmp: 92, map: 93, ldr: 95 } },
    { id: 8053, name: "Chelly",     role: "COACH", team: "NS",   year: 2025, rating: 83, quality: "Gold",     region: "LCK", stats: { mec: 20, tmf: 82, frm: 83, cmp: 83, map: 84, ldr: 84 } },
    { id: 8054, name: "kkOma",      role: "COACH", team: "T1",   year: 2025, rating: 97, quality: "Master",   region: "LCK", stats: { mec: 22, tmf: 94, frm: 97, cmp: 97, map: 98, ldr: 99 } },

    // --- 2025 LEC COACHES ---
    { id: 8065, name: "GrabbZ",     role: "COACH", team: "FNC",  year: 2025, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 22, tmf: 86, frm: 88, cmp: 88, map: 89, ldr: 90 } },
    { id: 8066, name: "Dylan Falco",role: "COACH", team: "G2",   year: 2025, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 16, tmf: 87, frm: 90, cmp: 89, map: 91, ldr: 92 } },
    { id: 8067, name: "Guilhoto",   role: "COACH", team: "GX",   year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 20, tmf: 82, frm: 84, cmp: 82, map: 85, ldr: 86 } },
    { id: 8068, name: "Reha",       role: "COACH", team: "KC",   year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 20, tmf: 81, frm: 82, cmp: 81, map: 83, ldr: 84 } },
    { id: 8069, name: "Melzhet",    role: "COACH", team: "MKOI", year: 2025, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 20, tmf: 83, frm: 86, cmp: 86, map: 87, ldr: 88 } },
    { id: 8070, name: "fredy122",   role: "COACH", team: "NAVI", year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 24, tmf: 82, frm: 83, cmp: 82, map: 84, ldr: 84 } },
    { id: 8071, name: "Own3r",      role: "COACH", team: "SK",   year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 23, tmf: 81, frm: 82, cmp: 80, map: 83, ldr: 84 } },
    { id: 8072, name: "Striker",    role: "COACH", team: "BDS",  year: 2025, rating: 81, quality: "Gold",     region: "LEC", stats: { mec: 21, tmf: 80, frm: 81, cmp: 80, map: 82, ldr: 83 } },
    { id: 8073, name: "Machuki",    role: "COACH", team: "TH",   year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 20, tmf: 81, frm: 82, cmp: 81, map: 83, ldr: 84 } },
    { id: 8074, name: "Mac",        role: "COACH", team: "VIT",  year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 20, tmf: 81, frm: 82, cmp: 80, map: 83, ldr: 84 } },

    // ==========================================
    // --- 2.6. 2025 LPL ROSTERS ---
    // ==========================================

    // AL — Anyone's Legend (3rd place, Group A winners, strong playoffs)
    { id: 5001, name: "Flandre",    role: "TOP", team: "AL",  year: 2025, rating: 90, quality: "Diamond",  region: "LPL", stats: { mec: 88, tmf: 91, frm: 90, cmp: 91, map: 86, ldr: 88 } },
    { id: 5002, name: "Tarzan",     role: "JNG", team: "AL",  year: 2025, rating: 91, quality: "Diamond",  region: "LPL", stats: { mec: 90, tmf: 92, frm: 89, cmp: 90, map: 93, ldr: 89 } },
    { id: 5003, name: "Shanks",     role: "MID", team: "AL",  year: 2025, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 90, tmf: 87, frm: 88, cmp: 85, map: 84, ldr: 83 } },
    { id: 5004, name: "Hope",       role: "ADC", team: "AL",  year: 2025, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 85, frm: 87, cmp: 83, map: 82, ldr: 80 } },
    { id: 5005, name: "Kael",       role: "SUP", team: "AL",  year: 2025, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 80, tmf: 86, frm: 88, cmp: 88, map: 90, ldr: 88 } },

    // BLG — Bilibili Gaming (Champions, top individual performers)
    { id: 5011, name: "Bin",        role: "TOP", team: "BLG", year: 2025, rating: 92, quality: "Diamond",  region: "LPL", stats: { mec: 94, tmf: 91, frm: 92, cmp: 89, map: 87, ldr: 86 } },
    { id: 5012, name: "Wei",        role: "JNG", team: "BLG", year: 2025, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 87, frm: 86, cmp: 86, map: 88, ldr: 84 } },
    { id: 5013, name: "knight",     role: "MID", team: "BLG", year: 2025, rating: 93, quality: "Master",   region: "LPL", stats: { mec: 95, tmf: 92, frm: 93, cmp: 90, map: 88, ldr: 89 } },
    { id: 5014, name: "Elk",        role: "ADC", team: "BLG", year: 2025, rating: 89, quality: "Diamond",  region: "LPL", stats: { mec: 91, tmf: 88, frm: 90, cmp: 86, map: 84, ldr: 82 } },
    { id: 5015, name: "ON",         role: "SUP", team: "BLG", year: 2025, rating: 90, quality: "Diamond",  region: "LPL", stats: { mec: 83, tmf: 88, frm: 91, cmp: 91, map: 92, ldr: 91 } },

    // EDG — EDward Gaming (8-2 Nirvana Rumble, solid mid-tier)
    { id: 5021, name: "Zdz",        role: "TOP", team: "EDG", year: 2025, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 84, frm: 86, cmp: 82, map: 80, ldr: 79 } },
    { id: 5022, name: "Xiaohao",    role: "JNG", team: "EDG", year: 2025, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 84, tmf: 86, frm: 83, cmp: 84, map: 86, ldr: 83 } },
    { id: 5023, name: "Angel",      role: "MID", team: "EDG", year: 2025, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 84, frm: 86, cmp: 85, map: 84, ldr: 83 } },
    { id: 5024, name: "Assum",      role: "ADC", team: "EDG", year: 2025, rating: 84, quality: "Gold",     region: "LPL", stats: { mec: 86, tmf: 83, frm: 85, cmp: 81, map: 79, ldr: 77 } },
    { id: 5025, name: "Wink",       role: "SUP", team: "EDG", year: 2025, rating: 84, quality: "Gold",     region: "LPL", stats: { mec: 77, tmf: 84, frm: 84, cmp: 82, map: 85, ldr: 84 } },

    // FPX — FunPlus Phoenix (1-13 Rumble, worst record)
    { id: 5031, name: "sheer",      role: "TOP", team: "FPX", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 77, ldr: 76 } },
    { id: 5032, name: "sorrow",     role: "JNG", team: "FPX", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 82, tmf: 82, frm: 80, cmp: 80, map: 82, ldr: 79 } },
    { id: 5033, name: "Care",       role: "MID", team: "FPX", year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 79, ldr: 78 } },
    { id: 5034, name: "bat",        role: "ADC", team: "FPX", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 77, ldr: 75 } },
    { id: 5035, name: "Jwei",       role: "SUP", team: "FPX", year: 2025, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 79, tmf: 86, frm: 87, cmp: 87, map: 88, ldr: 87 } },
    { id: 5036, name: "Shad0w",     role: "JNG", team: "BLG", year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 82, frm: 82, cmp: 80, map: 83, ldr: 78 } },

    // IG — Invictus Gaming (11-3 Rumble Ascend, 2nd, strong individual talent)
    { id: 5041, name: "TheShy",     role: "TOP", team: "IG",  year: 2025, rating: 91, quality: "Diamond",  region: "LPL", stats: { mec: 93, tmf: 90, frm: 92, cmp: 88, map: 86, ldr: 85 } },
    { id: 5042, name: "Jiejie",     role: "JNG", team: "IG",  year: 2025, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 89, frm: 86, cmp: 88, map: 90, ldr: 87 } },
    { id: 5043, name: "Rookie",     role: "MID", team: "IG",  year: 2025, rating: 94, quality: "Master",   region: "LPL", stats: { mec: 96, tmf: 93, frm: 94, cmp: 91, map: 89, ldr: 90 } },
    { id: 5044, name: "GALA",       role: "ADC", team: "IG",  year: 2025, rating: 89, quality: "Diamond",  region: "LPL", stats: { mec: 91, tmf: 88, frm: 90, cmp: 85, map: 83, ldr: 81 } },
    { id: 5045, name: "Meiko",      role: "SUP", team: "IG",  year: 2025, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 80, tmf: 87, frm: 88, cmp: 87, map: 89, ldr: 89 } },

    // JDG — JD Gaming (5-9 Rumble, strong individual MVPs despite team results)
    { id: 5051, name: "Ale",        role: "TOP", team: "JDG", year: 2025, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 86, frm: 88, cmp: 84, map: 82, ldr: 81 } },
    { id: 5052, name: "Xun",        role: "JNG", team: "JDG", year: 2025, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 89, frm: 86, cmp: 88, map: 90, ldr: 87 } },
    { id: 5053, name: "Scout",      role: "MID", team: "JDG", year: 2025, rating: 89, quality: "Diamond",  region: "LPL", stats: { mec: 91, tmf: 88, frm: 90, cmp: 87, map: 85, ldr: 84 } },
    { id: 5054, name: "Peyz",       role: "ADC", team: "JDG", year: 2025, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 90, tmf: 87, frm: 89, cmp: 84, map: 83, ldr: 81 } },
    { id: 5055, name: "MISSING",    role: "SUP", team: "JDG", year: 2025, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 81, tmf: 88, frm: 90, cmp: 89, map: 91, ldr: 90 } },

    // LGD — LGD Gaming (6-4 Nirvana Rumble)
    { id: 5061, name: "sasi",       role: "TOP", team: "LGD", year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 79, ldr: 77 } },
    { id: 5062, name: "climber",    role: "JNG", team: "LGD", year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 83, frm: 81, cmp: 81, map: 83, ldr: 80 } },
    { id: 5063, name: "xqw",        role: "MID", team: "LGD", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 81, frm: 82, cmp: 79, map: 78, ldr: 76 } },
    { id: 5064, name: "Shaoye",     role: "ADC", team: "LGD", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 77, ldr: 75 } },
    { id: 5065, name: "Ycx",        role: "SUP", team: "LGD", year: 2025, rating: 81, quality: "Gold",     region: "LPL", stats: { mec: 74, tmf: 82, frm: 82, cmp: 80, map: 83, ldr: 81 } },
    { id: 5066, name: "Meteor",     role: "JNG", team: "LGD", year: 2025, rating: 80, quality: "Gold",     region: "LPL", stats: { mec: 81, tmf: 79, frm: 79, cmp: 77, map: 80, ldr: 77 } },

    // LNG — LNG Esports (2-8 Nirvana Rumble, eliminated early)
    { id: 5071, name: "Zika",       role: "TOP", team: "LNG", year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 79, ldr: 78 } },
    { id: 5072, name: "Weiwei",     role: "JNG", team: "LNG", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 82, tmf: 82, frm: 80, cmp: 80, map: 82, ldr: 79 } },
    { id: 5073, name: "haichao",    role: "MID", team: "LNG", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 81, frm: 82, cmp: 79, map: 78, ldr: 76 } },
    { id: 5074, name: "Photic",     role: "ADC", team: "LNG", year: 2025, rating: 84, quality: "Gold",     region: "LPL", stats: { mec: 85, tmf: 83, frm: 85, cmp: 81, map: 80, ldr: 78 } },
    { id: 5075, name: "Zhuo",       role: "SUP", team: "LNG", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 75, tmf: 82, frm: 82, cmp: 81, map: 84, ldr: 82 } },
    { id: 5076, name: "Alley",      role: "MID", team: "LNG", year: 2025, rating: 79, quality: "Silver",   region: "LPL", stats: { mec: 80, tmf: 78, frm: 79, cmp: 76, map: 75, ldr: 73 } },

    // NIP — Ninjas in Pyjamas (9-1 Nirvana Rumble, #1 in their stage)
    { id: 5081, name: "Shanji",     role: "TOP", team: "NIP", year: 2025, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 85, frm: 87, cmp: 83, map: 82, ldr: 81 } },
    { id: 5082, name: "AKi",        role: "JNG", team: "NIP", year: 2025, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 85, tmf: 85, frm: 83, cmp: 84, map: 86, ldr: 83 } },
    { id: 5083, name: "Doinb",      role: "MID", team: "NIP", year: 2025, rating: 89, quality: "Diamond",  region: "LPL", stats: { mec: 88, tmf: 89, frm: 89, cmp: 92, map: 90, ldr: 94 } },
    { id: 5084, name: "Leave",      role: "ADC", team: "NIP", year: 2025, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 86, frm: 88, cmp: 84, map: 83, ldr: 81 } },
    { id: 5085, name: "ppgod",      role: "SUP", team: "NIP", year: 2025, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 78, tmf: 85, frm: 87, cmp: 86, map: 88, ldr: 87 } },
    { id: 5086, name: "neny",       role: "ADC", team: "NIP", year: 2025, rating: 78, quality: "Silver",   region: "LPL", stats: { mec: 79, tmf: 77, frm: 79, cmp: 75, map: 74, ldr: 72 } },

    // OMG — Oh My God (mid-low, poor Nirvana stage)
    { id: 5091, name: "Hery",       role: "TOP", team: "OMG", year: 2025, rating: 81, quality: "Gold",     region: "LPL", stats: { mec: 82, tmf: 80, frm: 82, cmp: 78, map: 77, ldr: 75 } },
    { id: 5092, name: "Heng",       role: "JNG", team: "OMG", year: 2025, rating: 81, quality: "Gold",     region: "LPL", stats: { mec: 81, tmf: 81, frm: 80, cmp: 79, map: 82, ldr: 79 } },
    { id: 5093, name: "Linfeng",    role: "MID", team: "OMG", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 81, frm: 82, cmp: 80, map: 78, ldr: 77 } },
    { id: 5094, name: "Starry",     role: "ADC", team: "OMG", year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 82, frm: 83, cmp: 80, map: 77, ldr: 76 } },
    { id: 5095, name: "Moham",      role: "SUP", team: "OMG", year: 2025, rating: 81, quality: "Gold",     region: "LPL", stats: { mec: 74, tmf: 81, frm: 81, cmp: 80, map: 82, ldr: 80 } },

    // RNG — Royal Never Give Up (eliminated in Nirvana Rumble)
    { id: 5101, name: "Xiaoxu",     role: "TOP", team: "RNG", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 78, ldr: 77 } },
    { id: 5102, name: "Milkyway",   role: "JNG", team: "RNG", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 82, tmf: 82, frm: 80, cmp: 80, map: 83, ldr: 80 } },
    { id: 5103, name: "Tangyuan",   role: "MID", team: "RNG", year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 82, frm: 83, cmp: 80, map: 78, ldr: 77 } },
    { id: 5104, name: "JiaQi",      role: "ADC", team: "RNG", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 77, ldr: 75 } },
    { id: 5105, name: "Lele",       role: "SUP", team: "RNG", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 75, tmf: 82, frm: 83, cmp: 81, map: 84, ldr: 83 } },
    { id: 5106, name: "Niket",      role: "TOP", team: "RNG", year: 2025, rating: 79, quality: "Silver",   region: "LPL", stats: { mec: 80, tmf: 78, frm: 80, cmp: 76, map: 75, ldr: 73 } },

    // TES — Top Esports (Runner-up, Kanavi 16 RS MVPs, Creme/JackeyLove 4 Playoffs MVPs each)
    { id: 5111, name: "369",        role: "TOP", team: "TES", year: 2025, rating: 91, quality: "Diamond",  region: "LPL", stats: { mec: 89, tmf: 92, frm: 91, cmp: 90, map: 93, ldr: 88 } },
    { id: 5112, name: "Kanavi",     role: "JNG", team: "TES", year: 2025, rating: 96, quality: "Grandmaster", region: "LPL", stats: { mec: 96, tmf: 95, frm: 97, cmp: 93, map: 97, ldr: 92 } },
    { id: 5113, name: "Creme",      role: "MID", team: "TES", year: 2025, rating: 91, quality: "Diamond",  region: "LPL", stats: { mec: 93, tmf: 90, frm: 92, cmp: 88, map: 86, ldr: 85 } },
    { id: 5114, name: "JackeyLove", role: "ADC", team: "TES", year: 2025, rating: 92, quality: "Diamond",  region: "LPL", stats: { mec: 94, tmf: 91, frm: 93, cmp: 89, map: 86, ldr: 90 } },
    { id: 5115, name: "Crisp",      role: "SUP", team: "TES", year: 2025, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 80, tmf: 87, frm: 88, cmp: 88, map: 89, ldr: 88 } },

    // TT — ThunderTalk Gaming (Group C winners but poor Rumble record overall)
    { id: 5121, name: "Hoya",       role: "TOP", team: "TT",  year: 2025, rating: 84, quality: "Gold",     region: "LPL", stats: { mec: 85, tmf: 83, frm: 85, cmp: 81, map: 80, ldr: 79 } },
    { id: 5122, name: "Beichuan",   role: "JNG", team: "TT",  year: 2025, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 86, frm: 84, cmp: 85, map: 87, ldr: 84 } },
    { id: 5123, name: "SeTab",      role: "MID", team: "TT",  year: 2025, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 84, frm: 86, cmp: 83, map: 81, ldr: 80 } },
    { id: 5124, name: "1xn",        role: "ADC", team: "TT",  year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 78, ldr: 76 } },
    { id: 5125, name: "Feather",    role: "SUP", team: "TT",  year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 76, tmf: 83, frm: 83, cmp: 82, map: 84, ldr: 83 } },

    // UP — Ultra Prime (3-7 Nirvana Rumble, eliminated)
    { id: 5131, name: "1Jiang",     role: "TOP", team: "UP",  year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 78, ldr: 76 } },
    { id: 5132, name: "Junhao",     role: "JNG", team: "UP",  year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 82, tmf: 82, frm: 80, cmp: 80, map: 82, ldr: 79 } },
    { id: 5133, name: "Saber",      role: "MID", team: "UP",  year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 82, frm: 83, cmp: 80, map: 79, ldr: 78 } },
    { id: 5134, name: "Wako",       role: "ADC", team: "UP",  year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 77, ldr: 75 } },
    { id: 5135, name: "Rosielove",  role: "SUP", team: "UP",  year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 76, tmf: 83, frm: 83, cmp: 82, map: 84, ldr: 83 } },

    // WBG — Weibo Gaming (6-8 Rumble Ascend; xiaohu 13 RS MVPs, Tian 3 Playoffs MVPs)
    { id: 5141, name: "Breathe",    role: "TOP", team: "WBG", year: 2025, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 85, frm: 87, cmp: 83, map: 81, ldr: 80 } },
    { id: 5142, name: "Tian",       role: "JNG", team: "WBG", year: 2025, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 88, frm: 86, cmp: 87, map: 89, ldr: 86 } },
    { id: 5143, name: "xiaohu",     role: "MID", team: "WBG", year: 2025, rating: 90, quality: "Diamond",  region: "LPL", stats: { mec: 88, tmf: 91, frm: 90, cmp: 91, map: 90, ldr: 93 } },
    { id: 5144, name: "Light",      role: "ADC", team: "WBG", year: 2025, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 85, frm: 87, cmp: 83, map: 81, ldr: 80 } },
    { id: 5145, name: "Hang",       role: "SUP", team: "WBG", year: 2025, rating: 84, quality: "Gold",     region: "LPL", stats: { mec: 77, tmf: 84, frm: 85, cmp: 84, map: 86, ldr: 85 } },
    { id: 5146, name: "Monki",      role: "SUP", team: "WBG", year: 2025, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 79, tmf: 86, frm: 88, cmp: 87, map: 89, ldr: 88 } },

    // WE — Team WE (3-11 Rumble Ascend, poor team; Karis 🇰🇷, Taeyoon 🇰🇷)
    { id: 5151, name: "Cube",       role: "TOP", team: "WE",  year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 78, ldr: 77 } },
    { id: 5152, name: "Tianzhen",   role: "JNG", team: "WE",  year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 83, frm: 81, cmp: 81, map: 84, ldr: 81 } },
    { id: 5153, name: "Karis",      role: "MID", team: "WE",  year: 2025, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 84, frm: 85, cmp: 83, map: 82, ldr: 80 } },
    { id: 5154, name: "Taeyoon",    role: "ADC", team: "WE",  year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 79, ldr: 76 } },
    { id: 5155, name: "Vampire",    role: "SUP", team: "WE",  year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 76, tmf: 83, frm: 83, cmp: 82, map: 84, ldr: 83 } },

    // --- 2025 LPL COACHES (Head Coaches only) ---
    { id: 8075, name: "Tabe",      role: "COACH", team: "AL",  year: 2025, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 25, tmf: 90, frm: 91, cmp: 90, map: 92, ldr: 93 } },
    { id: 8076, name: "Maokai",    role: "COACH", team: "BLG", year: 2025, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 22, tmf: 86, frm: 87, cmp: 86, map: 88, ldr: 89 } },
    { id: 8077, name: "Mni",       role: "COACH", team: "EDG", year: 2025, rating: 84, quality: "Gold",     region: "LPL", stats: { mec: 20, tmf: 83, frm: 84, cmp: 83, map: 85, ldr: 84 } },
    { id: 8078, name: "QingSi",    role: "COACH", team: "FPX", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 18, tmf: 81, frm: 82, cmp: 81, map: 83, ldr: 82 } },
    { id: 8079, name: "Daeny",     role: "COACH", team: "IG",  year: 2025, rating: 90, quality: "Diamond",  region: "LPL", stats: { mec: 30, tmf: 89, frm: 91, cmp: 90, map: 92, ldr: 91 } },
    { id: 8080, name: "cvmax",     role: "COACH", team: "JDG", year: 2025, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 26, tmf: 85, frm: 86, cmp: 85, map: 87, ldr: 87 } },
    { id: 8081, name: "1874",      role: "COACH", team: "LGD", year: 2025, rating: 81, quality: "Gold",     region: "LPL", stats: { mec: 18, tmf: 80, frm: 81, cmp: 80, map: 82, ldr: 82 } },
    { id: 8082, name: "U",         role: "COACH", team: "LNG", year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 19, tmf: 82, frm: 83, cmp: 82, map: 84, ldr: 83 } },
    { id: 8083, name: "Rashomon",  role: "COACH", team: "NIP", year: 2025, rating: 84, quality: "Gold",     region: "LPL", stats: { mec: 20, tmf: 83, frm: 84, cmp: 83, map: 85, ldr: 85 } },
    { id: 8084, name: "NoName",    role: "COACH", team: "OMG", year: 2025, rating: 82, quality: "Gold",     region: "LPL", stats: { mec: 19, tmf: 81, frm: 82, cmp: 81, map: 83, ldr: 82 } },
    { id: 8085, name: "Heart",     role: "COACH", team: "RNG", year: 2025, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 24, tmf: 84, frm: 85, cmp: 84, map: 86, ldr: 86 } },
    { id: 8086, name: "Homme",     role: "COACH", team: "TES", year: 2025, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 26, tmf: 87, frm: 88, cmp: 87, map: 89, ldr: 90 } },
    { id: 8087, name: "AFei",      role: "COACH", team: "TT",  year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 19, tmf: 82, frm: 83, cmp: 82, map: 84, ldr: 83 } },
    { id: 8088, name: "Benny",     role: "COACH", team: "UP",  year: 2025, rating: 83, quality: "Gold",     region: "LPL", stats: { mec: 19, tmf: 82, frm: 83, cmp: 82, map: 84, ldr: 83 } },
    { id: 8089, name: "NoFe",      role: "COACH", team: "WBG", year: 2025, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 24, tmf: 84, frm: 86, cmp: 84, map: 86, ldr: 87 } },
    { id: 8090, name: "Teacherma", role: "COACH", team: "WE",  year: 2025, rating: 84, quality: "Gold",     region: "LPL", stats: { mec: 20, tmf: 83, frm: 84, cmp: 83, map: 85, ldr: 84 } },

    // --- 2026 LCK ROSTERS ---
    { id: 1101, name: "Doran", role: "TOP", team: "T1", year: 2026, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 92, tmf: 89, frm: 91, cmp: 86, map: 85, ldr: 88 } },
    { id: 1102, name: "Oner", role: "JNG", team: "T1", year: 2026, rating: 91, quality: "Master", region: "LCK", stats: { mec: 93, tmf: 90, frm: 88, cmp: 89, map: 90, ldr: 87 } },
    { id: 1103, name: "Faker", role: "MID", team: "T1", year: 2026, rating: 93, quality: "Diamond", region: "LCK", stats: { mec: 85, tmf: 93, frm: 84, cmp: 96, map: 95, ldr: 99 } },
    { id: 1104, name: "Peyz", role: "ADC", team: "T1", year: 2026, rating: 93, quality: "Grandmaster", region: "LCK", stats: { mec: 95, tmf: 93, frm: 93, cmp: 91, map: 87, ldr: 86 } },
    { id: 1105, name: "Keria", role: "SUP", team: "T1", year: 2026, rating: 97, quality: "Master", region: "LCK", stats: { mec: 87, tmf: 97, frm: 98, cmp: 99, map: 100, ldr: 95 } },

    { id: 1111, name: "Kiin", role: "TOP", team: "Gen.G", year: 2026, rating: 96, quality: "Grandmaster", region: "LCK", stats: { mec: 94, tmf: 97, frm: 97, cmp: 95, map: 90, ldr: 92 } },
    { id: 1112, name: "Canyon", role: "JNG", team: "Gen.G", year: 2026, rating: 96, quality: "Challenger", region: "LCK", stats: { mec: 96, tmf: 95, frm: 97, cmp: 94, map: 97, ldr: 91 } },
    { id: 1113, name: "Chovy", role: "MID", team: "Gen.G", year: 2026, rating: 98, quality: "Challenger", region: "LCK", stats: { mec: 98, tmf: 97, frm: 98, cmp: 96, map: 94, ldr: 89 } },
    { id: 1114, name: "Ruler", role: "ADC", team: "Gen.G", year: 2026, rating: 96, quality: "Grandmaster", region: "LCK", stats: { mec: 97, tmf: 98, frm: 96, cmp: 95, map: 88, ldr: 91 } },
    { id: 1115, name: "Duro", role: "SUP", team: "Gen.G", year: 2026, rating: 91, quality: "Platinum", region: "LCK", stats: { mec: 81, tmf: 92, frm: 91, cmp: 88, map: 93, ldr: 89 } },

    { id: 1221, name: "Zeus", role: "TOP", team: "HLE", year: 2026, rating: 95, quality: "Grandmaster", region: "LCK", stats: { mec: 98, tmf: 94, frm: 96, cmp: 92, map: 87, ldr: 85 } },
    { id: 1222, name: "Kanavi", role: "JNG", team: "HLE", year: 2026, rating: 94, quality: "Master", region: "LCK", stats: { mec: 94, tmf: 93, frm: 95, cmp: 91, map: 92, ldr: 89 } },
    { id: 1223, name: "Zeka", role: "MID", team: "HLE", year: 2026, rating: 94, quality: "Master", region: "LCK", stats: { mec: 98, tmf: 93, frm: 94, cmp: 90, map: 88, ldr: 85 } },
    { id: 1224, name: "Gumayusi", role: "ADC", team: "HLE", year: 2026, rating: 91, quality: "Master", region: "LCK", stats: { mec: 93, tmf: 93, frm: 94, cmp: 97, map: 83, ldr: 86 } },
    { id: 1225, name: "Delight", role: "SUP", team: "HLE", year: 2026, rating: 92, quality: "Master", region: "LCK", stats: { mec: 84, tmf: 94, frm: 92, cmp: 90, map: 93, ldr: 89 } },

    { id: 1331, name: "Siwoo", role: "TOP", team: "DK", year: 2026, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 86, tmf: 84, frm: 85, cmp: 80, map: 81, ldr: 78 } },
    { id: 1332, name: "Lucid", role: "JNG", team: "DK", year: 2026, rating: 87, quality: "Diamond", region: "LCK", stats: { mec: 89, tmf: 86, frm: 87, cmp: 84, map: 86, ldr: 83 } },
    { id: 1333, name: "ShowMaker", role: "MID", team: "DK", year: 2026, rating: 90, quality: "Master", region: "LCK", stats: { mec: 92, tmf: 90, frm: 90, cmp: 92, map: 90, ldr: 91 } },
    { id: 1334, name: "Smash", role: "ADC", team: "DK", year: 2026, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 85, frm: 87, cmp: 82, map: 80, ldr: 79 } },
    { id: 1335, name: "Career", role: "SUP", team: "DK", year: 2026, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 78, tmf: 84, frm: 82, cmp: 81, map: 83, ldr: 80 } },

    { id: 1551, name: "PerfecT", role: "TOP", team: "KT", year: 2026, rating: 89, quality: "Platinum", region: "LCK", stats: { mec: 91, tmf: 88, frm: 90, cmp: 86, map: 87, ldr: 84 } },
    { id: 1552, name: "Cuzz", role: "JNG", team: "KT", year: 2026, rating: 91, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 92, frm: 89, cmp: 90, map: 93, ldr: 91 } },
    { id: 1553, name: "Bdd", role: "MID", team: "KT", year: 2026, rating: 92, quality: "Diamond", region: "LCK", stats: { mec: 91, tmf: 93, frm: 94, cmp: 92, map: 91, ldr: 90 } },
    { id: 1554, name: "Aiming", role: "ADC", team: "KT", year: 2026, rating: 93, quality: "Diamond", region: "LCK", stats: { mec: 95, tmf: 91, frm: 94, cmp: 90, map: 87, ldr: 86 } },
    { id: 1555, name: "Ghost", role: "SUP", team: "KT", year: 2026, rating: 90, quality: "Platinum", region: "LCK", stats: { mec: 83, tmf: 91, frm: 95, cmp: 96, map: 95, ldr: 97 } },

    { id: 1441, name: "Clear", role: "TOP", team: "BFX", year: 2026, rating: 81, quality: "Gold", region: "LCK", stats: { mec: 83, tmf: 80, frm: 82, cmp: 79, map: 76, ldr: 75 } },
    { id: 1442, name: "Raptor", role: "JNG", team: "BFX", year: 2026, rating: 81, quality: "Gold", region: "LCK", stats: { mec: 82, tmf: 81, frm: 80, cmp: 78, map: 83, ldr: 78 } },
    { id: 1443, name: "VicLa", role: "MID", team: "BFX", year: 2026, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 85, tmf: 82, frm: 83, cmp: 80, map: 79, ldr: 78 } },
    { id: 1444, name: "Diable", role: "ADC", team: "BFX", year: 2026, rating: 82, quality: "Gold", region: "LCK", stats: { mec: 84, tmf: 81, frm: 83, cmp: 80, map: 77, ldr: 76 } },
    { id: 1445, name: "Kellin", role: "SUP", team: "BFX", year: 2026, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 78, tmf: 85, frm: 85, cmp: 84, map: 87, ldr: 84 } },

    { id: 3051, name: "Kingen", role: "TOP", team: "NS", year: 2026, rating: 89, quality: "Diamond", region: "LCK", stats: { mec: 90, tmf: 91, frm: 89, cmp: 88, map: 84, ldr: 87 } },
    { id: 3052, name: "Sponge", role: "JNG", team: "NS", year: 2026, rating: 86, quality: "Gold", region: "LCK", stats: { mec: 87, tmf: 85, frm: 86, cmp: 84, map: 88, ldr: 84 } },
    { id: 3053, name: "Scout", role: "MID", team: "NS", year: 2026, rating: 94, quality: "Master", region: "LCK", stats: { mec: 95, tmf: 94, frm: 93, cmp: 96, map: 92, ldr: 94 } },
    { id: 3054, name: "Taeyoon", role: "ADC", team: "NS", year: 2026, rating: 85, quality: "Gold", region: "LCK", stats: { mec: 87, tmf: 84, frm: 86, cmp: 81, map: 79, ldr: 78 } },
    { id: 3055, name: "Lehends", role: "SUP", team: "NS", year: 2026, rating: 94, quality: "Master", region: "LCK", stats: { mec: 83, tmf: 95, frm: 96, cmp: 96, map: 97, ldr: 97 } },

    { id: 3056, name: "DuDu", role: "TOP", team: "DNS", year: 2026, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 87, tmf: 84, frm: 86, cmp: 82, map: 83, ldr: 80 } },
    { id: 3057, name: "Pyosik", role: "JNG", team: "DNS", year: 2026, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 86, frm: 87, cmp: 85, map: 86, ldr: 84 } },
    { id: 3058, name: "Clozer", role: "MID", team: "DNS", year: 2026, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 90, tmf: 84, frm: 86, cmp: 83, map: 81, ldr: 80 } },
    { id: 3059, name: "deokdam", role: "ADC", team: "DNS", year: 2026, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 87, tmf: 87, frm: 88, cmp: 84, map: 81, ldr: 83 } },
    { id: 3060, name: "Peter", role: "SUP", team: "DNS", year: 2026, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 76, tmf: 84, frm: 83, cmp: 80, map: 85, ldr: 82 } },

    { id: 3061, name: "Casting", role: "TOP", team: "BRO", year: 2026, rating: 79, quality: "Silver", region: "LCK", stats: { mec: 80, tmf: 77, frm: 81, cmp: 75, map: 73, ldr: 72 } },
    { id: 3062, name: "GIDEON", role: "JNG", team: "BRO", year: 2026, rating: 87, quality: "Gold", region: "LCK", stats: { mec: 88, tmf: 86, frm: 87, cmp: 84, map: 88, ldr: 83 } },
    { id: 3063, name: "Fisher", role: "MID", team: "BRO", year: 2026, rating: 81, quality: "Gold", region: "LCK", stats: { mec: 84, tmf: 80, frm: 82, cmp: 78, map: 76, ldr: 75 } },
    { id: 3064, name: "Teddy", role: "ADC", team: "BRO", year: 2026, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 86, frm: 89, cmp: 91, map: 80, ldr: 84 } },
    { id: 3065, name: "Namgung", role: "SUP", team: "BRO", year: 2026, rating: 78, quality: "Silver", region: "LCK", stats: { mec: 70, tmf: 79, frm: 77, cmp: 74, map: 80, ldr: 76 } },

    { id: 4441, name: "Rich", role: "TOP", team: "DRX", year: 2026, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 84, tmf: 82, frm: 85, cmp: 81, map: 78, ldr: 79 } },
    { id: 4442, name: "Vincenzo", role: "JNG", team: "DRX", year: 2026, rating: 79, quality: "Silver", region: "LCK", stats: { mec: 81, tmf: 77, frm: 79, cmp: 75, map: 81, ldr: 74 } },
    { id: 4443, name: "ucal", role: "MID", team: "DRX", year: 2026, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 87, tmf: 85, frm: 86, cmp: 84, map: 81, ldr: 82 } },
    { id: 4444, name: "Jiwoo", role: "ADC", team: "DRX", year: 2026, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 89, tmf: 85, frm: 87, cmp: 83, map: 80, ldr: 78 } },
    { id: 4445, name: "Andil",    role: "SUP", team: "DRX", year: 2026, rating: 80, quality: "Gold", region: "LCK", stats: { mec: 73, tmf: 81, frm: 81, cmp: 78, map: 82, ldr: 81 } },
    { id: 4446, name: "LazyFeel", role: "ADC", team: "DRX", year: 2026, rating: 81, quality: "Gold", region: "LCK", stats: { mec: 83, tmf: 80, frm: 82, cmp: 78, map: 79, ldr: 75 } },

    // --- 2026 LPL ROSTERS ---
    { id: 1201, name: "Bin", role: "TOP", team: "BLG", year: 2026, rating: 98, quality: "Challenger", region: "LPL", stats: { mec: 99, tmf: 97, frm: 97, cmp: 96, map: 91, ldr: 90 } },
    { id: 1202, name: "Xun", role: "JNG", team: "BLG", year: 2026, rating: 93, quality: "Diamond", region: "LPL", stats: { mec: 93, tmf: 92, frm: 94, cmp: 91, map: 92, ldr: 90 } },
    { id: 1203, name: "Knight", role: "MID", team: "BLG", year: 2026, rating: 99, quality: "Challenger", region: "LPL", stats: { mec: 100, tmf: 99, frm: 98, cmp: 97, map: 96, ldr: 93 } },
    { id: 1204, name: "Viper", role: "ADC", team: "BLG", year: 2026, rating: 98, quality: "Challenger", region: "LPL", stats: { mec: 100, tmf: 98, frm: 99, cmp: 97, map: 92, ldr: 90 } },
    { id: 1205, name: "ON", role: "SUP", team: "BLG", year: 2026, rating: 97, quality: "Challenger", region: "LPL", stats: { mec: 92, tmf: 96, frm: 97, cmp: 97, map: 98, ldr: 96 } },

    { id: 3086, name: "Xiaoxu", role: "TOP", team: "JDG", year: 2026, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 89, tmf: 85, frm: 87, cmp: 82, map: 83, ldr: 81 } },
    { id: 3087, name: "JunJia", role: "JNG", team: "JDG", year: 2026, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 88, frm: 85, cmp: 87, map: 89, ldr: 85 } },
    { id: 3088, name: "HongQ", role: "MID", team: "JDG", year: 2026, rating: 91, quality: "Gold", region: "LPL", stats: { mec: 92, tmf: 90, frm: 92, cmp: 87, map: 88, ldr: 86 } },
    { id: 3089, name: "GALA", role: "ADC", team: "JDG", year: 2026, rating: 93, quality: "Master", region: "LPL", stats: { mec: 95, tmf: 94, frm: 94, cmp: 93, map: 88, ldr: 89 } },
    { id: 3090, name: "Vampire", role: "SUP", team: "JDG", year: 2026, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 75, tmf: 83, frm: 82, cmp: 80, map: 84, ldr: 82 } },

    { id: 3091, name: "369", role: "TOP", team: "TES", year: 2026, rating: 92, quality: "Master", region: "LPL", stats: { mec: 90, tmf: 94, frm: 92, cmp: 91, map: 93, ldr: 89 } },
    { id: 3092, name: "naiyou", role: "JNG", team: "TES", year: 2026, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 84, tmf: 82, frm: 81, cmp: 80, map: 83, ldr: 81 } },
    { id: 3093, name: "Creme", role: "MID", team: "TES", year: 2026, rating: 89, quality: "Diamond", region: "LPL", stats: { mec: 92, tmf: 88, frm: 90, cmp: 86, map: 85, ldr: 84 } },
    { id: 3094, name: "JackeyLove", role: "ADC", team: "TES", year: 2026, rating: 93, quality: "Master", region: "LPL", stats: { mec: 95, tmf: 93, frm: 94, cmp: 91, map: 89, ldr: 92 } },
    { id: 3095, name: "fengyue", role: "SUP", team: "TES", year: 2026, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 74, tmf: 82, frm: 81, cmp: 78, map: 82, ldr: 80 } },

    { id: 3076, name: "Flandre", role: "TOP", team: "AL", year: 2026, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 85, tmf: 88, frm: 87, cmp: 89, map: 83, ldr: 86 } },
    { id: 3077, name: "Tarzan", role: "JNG", team: "AL", year: 2026, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 90, tmf: 92, frm: 89, cmp: 91, map: 93, ldr: 89 } },
    { id: 3078, name: "Shanks", role: "MID", team: "AL", year: 2026, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 85, frm: 86, cmp: 84, map: 83, ldr: 81 } },
    { id: 3079, name: "Hope", role: "ADC", team: "AL", year: 2026, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 86, frm: 88, cmp: 83, map: 81, ldr: 80 } },
    { id: 3080, name: "Kael", role: "SUP", team: "AL", year: 2026, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 78, tmf: 85, frm: 85, cmp: 83, map: 87, ldr: 85 } },

    { id: 3081, name: "Zika", role: "TOP", team: "WBG", year: 2026, rating: 89, quality: "Diamond", region: "LPL", stats: { mec: 91, tmf: 88, frm: 90, cmp: 87, map: 84, ldr: 83 } },
    { id: 3082, name: "Jiejie", role: "JNG", team: "WBG", year: 2026, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 88, tmf: 92, frm: 88, cmp: 90, map: 92, ldr: 91 } },
    { id: 3083, name: "Xiaohu", role: "MID", team: "WBG", year: 2026, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 88, tmf: 91, frm: 90, cmp: 91, map: 90, ldr: 93 } },
    { id: 3084, name: "Elk", role: "ADC", team: "WBG", year: 2026, rating: 91, quality: "Master", region: "LPL", stats: { mec: 92, tmf: 91, frm: 92, cmp: 88, map: 86, ldr: 84 } },
    { id: 3085, name: "Erha", role: "SUP", team: "WBG", year: 2026, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 75, tmf: 83, frm: 82, cmp: 80, map: 84, ldr: 81 } },

    { id: 3096, name: "Soboro", role: "TOP", team: "IG", year: 2026, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 84, tmf: 79, frm: 83, cmp: 78, map: 76, ldr: 74 } },
    { id: 3097, name: "Wei", role: "JNG", team: "IG", year: 2026, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 88, tmf: 92, frm: 85, cmp: 91, map: 93, ldr: 94 } },
    { id: 3098, name: "Rookie", role: "MID", team: "IG", year: 2026, rating: 92, quality: "Master", region: "LPL", stats: { mec: 94, tmf: 91, frm: 92, cmp: 93, map: 90, ldr: 91 } },
    { id: 3099, name: "Photic", role: "ADC", team: "IG", year: 2026, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 85, frm: 87, cmp: 84, map: 82, ldr: 81 } },
    { id: 3100, name: "Jwei", role: "SUP", team: "IG", year: 2026, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 76, tmf: 83, frm: 82, cmp: 80, map: 84, ldr: 82 } },

    { id: 3101, name: "HOYA", role: "TOP", team: "NIP", year: 2026, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 85, tmf: 81, frm: 84, cmp: 80, map: 79, ldr: 77 } },
    { id: 3102, name: "Guwon", role: "JNG", team: "NIP", year: 2026, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 83, tmf: 81, frm: 80, cmp: 80, map: 83, ldr: 79 } },
    { id: 3103, name: "Care", role: "MID", team: "NIP", year: 2026, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 83, frm: 85, cmp: 82, map: 81, ldr: 80 } },
    { id: 3104, name: "Assum", role: "ADC", team: "NIP", year: 2026, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 86, tmf: 83, frm: 85, cmp: 81, map: 78, ldr: 79 } },
    { id: 3105, name: "Zhuo", role: "SUP", team: "NIP", year: 2026, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 76, tmf: 84, frm: 83, cmp: 81, map: 85, ldr: 83 } },

    { id: 3106, name: "Cube", role: "TOP", team: "WE", year: 2026, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 83, tmf: 80, frm: 84, cmp: 79, map: 77, ldr: 76 } },
    { id: 3107, name: "Monki", role: "JNG", team: "WE", year: 2026, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 81, tmf: 82, frm: 79, cmp: 78, map: 81, ldr: 79 } },
    { id: 3108, name: "Karis", role: "MID", team: "WE", year: 2026, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 84, tmf: 81, frm: 83, cmp: 79, map: 78, ldr: 76 } },
    { id: 3109, name: "About", role: "ADC", team: "WE", year: 2026, rating: 79, quality: "Silver", region: "LPL", stats: { mec: 81, tmf: 77, frm: 80, cmp: 75, map: 74, ldr: 72 } },
    { id: 3110, name: "yaoyao", role: "SUP", team: "WE", year: 2026, rating: 80, quality: "Gold", region: "LPL", stats: { mec: 73, tmf: 81, frm: 81, cmp: 78, map: 82, ldr: 81 } },

    { id: 3111, name: "Zdz", role: "TOP", team: "EDG", year: 2026, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 78, ldr: 77 } },
    { id: 3112, name: "Xiaohao", role: "JNG", team: "EDG", year: 2026, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 85, tmf: 83, frm: 82, cmp: 81, map: 84, ldr: 82 } },
    { id: 3113, name: "Angel", role: "MID", team: "EDG", year: 2026, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 84, frm: 86, cmp: 85, map: 84, ldr: 83 } },
    { id: 3114, name: "Leave", role: "ADC", team: "EDG", year: 2026, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 87, tmf: 83, frm: 85, cmp: 80, map: 79, ldr: 77 } },
    { id: 3115, name: "Parukia", role: "SUP", team: "EDG", year: 2026, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 73, tmf: 81, frm: 80, cmp: 78, map: 82, ldr: 80 } },

    { id: 3116, name: "Keshi", role: "TOP", team: "TT", year: 2026, rating: 77, quality: "Silver", region: "LPL", stats: { mec: 78, tmf: 75, frm: 79, cmp: 73, map: 71, ldr: 70 } },
    { id: 3117, name: "Junhao", role: "JNG", team: "TT", year: 2026, rating: 78, quality: "Silver", region: "LPL", stats: { mec: 79, tmf: 76, frm: 78, cmp: 74, map: 79, ldr: 75 } },
    { id: 3118, name: "Heru", role: "MID", team: "TT", year: 2026, rating: 79, quality: "Silver", region: "LPL", stats: { mec: 81, tmf: 77, frm: 80, cmp: 75, map: 75, ldr: 72 } },
    { id: 3119, name: "Ryan3", role: "ADC", team: "TT", year: 2026, rating: 78, quality: "Silver", region: "LPL", stats: { mec: 80, tmf: 76, frm: 79, cmp: 75, map: 73, ldr: 71 } },
    { id: 3120, name: "Feather", role: "SUP", team: "TT", year: 2026, rating: 79, quality: "Silver", region: "LPL", stats: { mec: 72, tmf: 79, frm: 79, cmp: 76, map: 81, ldr: 80 } },

    { id: 3121, name: "sheer", role: "TOP", team: "LNG", year: 2026, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 84, frm: 86, cmp: 83, map: 80, ldr: 79 } },
    { id: 3122, name: "Croco", role: "JNG", team: "LNG", year: 2026, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 86, frm: 84, cmp: 84, map: 87, ldr: 85 } },
    { id: 3123, name: "BuLLDoG", role: "MID", team: "LNG", year: 2026, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 85, tmf: 82, frm: 84, cmp: 80, map: 79, ldr: 77 } },
    { id: 3124, name: "1xn", role: "ADC", team: "LNG", year: 2026, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 85, tmf: 81, frm: 84, cmp: 79, map: 76, ldr: 75 } },
    { id: 3125, name: "MISSING", role: "SUP", team: "LNG", year: 2026, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 83, tmf: 92, frm: 92, cmp: 91, map: 93, ldr: 91 } },

    { id: 3126, name: "Hery", role: "TOP", team: "OMG", year: 2026, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 82, tmf: 79, frm: 83, cmp: 78, map: 76, ldr: 75 } },
    { id: 3127, name: "Juhan", role: "JNG", team: "OMG", year: 2026, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 83, tmf: 81, frm: 82, cmp: 80, map: 83, ldr: 80 } },
    { id: 3128, name: "haichao", role: "MID", team: "OMG", year: 2026, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 84, tmf: 81, frm: 82, cmp: 79, map: 78, ldr: 77 } },
    { id: 3129, name: "Starry", role: "ADC", team: "OMG", year: 2026, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 84, tmf: 81, frm: 83, cmp: 80, map: 77, ldr: 76 } },
    { id: 3130, name: "Moham", role: "SUP", team: "OMG", year: 2026, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 74, tmf: 82, frm: 81, cmp: 79, map: 83, ldr: 81 } },

    { id: 3131, name: "sasi", role: "TOP", team: "LGD", year: 2026, rating: 79, quality: "Silver", region: "LPL", stats: { mec: 80, tmf: 77, frm: 81, cmp: 76, map: 73, ldr: 72 } },
    { id: 3132, name: "Heng", role: "JNG", team: "LGD", year: 2026, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 82, tmf: 81, frm: 82, cmp: 79, map: 83, ldr: 81 } },
    { id: 3133, name: "Tangyuan", role: "MID", team: "LGD", year: 2026, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 83, tmf: 80, frm: 82, cmp: 78, map: 77, ldr: 75 } },
    { id: 3134, name: "Shaoye", role: "ADC", team: "LGD", year: 2026, rating: 80, quality: "Gold", region: "LPL", stats: { mec: 82, tmf: 78, frm: 81, cmp: 77, map: 76, ldr: 74 } },
    { id: 3135, name: "Ycx", role: "SUP", team: "LGD", year: 2026, rating: 78, quality: "Silver", region: "LPL", stats: { mec: 71, tmf: 78, frm: 78, cmp: 75, map: 80, ldr: 78 } },

    { id: 3136, name: "Liangchen", role: "TOP", team: "UP", year: 2026, rating: 76, quality: "Silver", region: "LPL", stats: { mec: 77, tmf: 74, frm: 78, cmp: 73, map: 71, ldr: 70 } },
    { id: 3137, name: "Grizzly", role: "JNG", team: "UP", year: 2026, rating: 80, quality: "Gold", region: "LPL", stats: { mec: 81, tmf: 79, frm: 78, cmp: 78, map: 81, ldr: 77 } },
    { id: 3138, name: "Saber", role: "MID", team: "UP", year: 2026, rating: 78, quality: "Silver", region: "LPL", stats: { mec: 80, tmf: 76, frm: 79, cmp: 75, map: 74, ldr: 72 } },
    { id: 3139, name: "Hena", role: "ADC", team: "UP", year: 2026, rating: 80, quality: "Gold", region: "LPL", stats: { mec: 82, tmf: 79, frm: 81, cmp: 77, map: 75, ldr: 74 } },
    { id: 3140, name: "Xiaoxia", role: "SUP", team: "UP", year: 2026, rating: 77, quality: "Silver", region: "LPL", stats: { mec: 68, tmf: 77, frm: 77, cmp: 75, map: 79, ldr: 76 } },

    // --- 2026 LEC ROSTERS ---
    { id: 1301, name: "BrokenBlade", role: "TOP", team: "G2", year: 2026, rating: 89, quality: "Diamond", region: "LEC", stats: { mec: 87, tmf: 91, frm: 88, cmp: 90, map: 86, ldr: 90 } },
    { id: 1302, name: "SkewMond", role: "JNG", team: "G2", year: 2026, rating: 91, quality: "Diamond", region: "LEC", stats: { mec: 93, tmf: 87, frm: 85, cmp: 84, map: 93, ldr: 82 } },
    { id: 1303, name: "Caps", role: "MID", team: "G2", year: 2026, rating: 95, quality: "Grandmaster", region: "LEC", stats: { mec: 95, tmf: 96, frm: 94, cmp: 97, map: 95, ldr: 96 } },
    { id: 1304, name: "Hans Sama", role: "ADC", team: "G2", year: 2026, rating: 92, quality: "Diamond", region: "LEC", stats: { mec: 93, tmf: 91, frm: 93, cmp: 90, map: 87, ldr: 86 } },
    { id: 1305, name: "Labrov", role: "SUP", team: "G2", year: 2026, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 82, tmf: 89, frm: 88, cmp: 88, map: 90, ldr: 86 } },

    { id: 3001, name: "Canna", role: "TOP", team: "KC", year: 2026, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 85, tmf: 80, frm: 84, cmp: 78, map: 79, ldr: 76 } },
    { id: 3002, name: "Yike", role: "JNG", team: "KC", year: 2026, rating: 91, quality: "Platinum", region: "LEC", stats: { mec: 92, tmf: 90, frm: 87, cmp: 89, map: 89, ldr: 87 } },
    { id: 3003, name: "Kyeahoo", role: "MID", team: "KC", year: 2026, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 86, tmf: 81, frm: 82, cmp: 80, map: 79, ldr: 77 } },
    { id: 3004, name: "Caliste", role: "ADC", team: "KC", year: 2026, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 91, tmf: 87, frm: 89, cmp: 84, map: 80, ldr: 79 } },
    { id: 3005, name: "Busio", role: "SUP", team: "KC", year: 2026, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 75, tmf: 83, frm: 84, cmp: 81, map: 86, ldr: 84 } },

    { id: 3006, name: "Sparda", role: "TOP", team: "NAVI", year: 2026, rating: 78, quality: "Silver", region: "LEC", stats: { mec: 76, tmf: 75, frm: 78, cmp: 74, map: 73, ldr: 71 } },
    { id: 3007, name: "Rabble", role: "JNG", team: "NAVI", year: 2026, rating: 79, quality: "Silver", region: "LEC", stats: { mec: 77, tmf: 76, frm: 77, cmp: 75, map: 74, ldr: 73 } },
    { id: 3008, name: "Poby", role: "MID", team: "NAVI", year: 2026, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 83, frm: 85, cmp: 82, map: 82, ldr: 79 } },
    { id: 3009, name: "Hans SamD", role: "ADC", team: "NAVI", year: 2026, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 81, frm: 84, cmp: 79, map: 78, ldr: 76 } },
    { id: 3010, name: "Parus", role: "SUP", team: "NAVI", year: 2026, rating: 79, quality: "Silver", region: "LEC", stats: { mec: 74, tmf: 78, frm: 78, cmp: 75, map: 80, ldr: 77 } },

    { id: 3011, name: "Naak Nako", role: "TOP", team: "VIT", year: 2026, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 80, frm: 82, cmp: 78, map: 76, ldr: 74 } },
    { id: 3012, name: "Lyncas", role: "JNG", team: "VIT", year: 2026, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 84, tmf: 82, frm: 80, cmp: 81, map: 84, ldr: 81 } },
    { id: 3013, name: "Humanoid", role: "MID", team: "VIT", year: 2026, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 87, frm: 88, cmp: 86, map: 84, ldr: 86 } },
    { id: 3014, name: "Carzzy", role: "ADC", team: "VIT", year: 2026, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 86, frm: 86, cmp: 88, map: 82, ldr: 84 } },
    { id: 3015, name: "Fleshy", role: "SUP", team: "VIT", year: 2026, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 74, tmf: 81, frm: 81, cmp: 79, map: 83, ldr: 82 } },

    { id: 3016, name: "Tracyn", role: "TOP", team: "TH", year: 2026, rating: 77, quality: "Silver", region: "LEC", stats: { mec: 79, tmf: 75, frm: 78, cmp: 74, map: 71, ldr: 70 } },
    { id: 3017, name: "Sheo", role: "JNG", team: "TH", year: 2026, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 85, frm: 82, cmp: 82, map: 84, ldr: 81 } },
    { id: 3018, name: "Serin", role: "MID", team: "TH", year: 2026, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 84, tmf: 80, frm: 82, cmp: 78, map: 77, ldr: 76 } },
    { id: 3019, name: "Ice", role: "ADC", team: "TH", year: 2026, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 84, frm: 86, cmp: 81, map: 79, ldr: 78 } },
    { id: 3020, name: "Stend", role: "SUP", team: "TH", year: 2026, rating: 80, quality: "Gold", region: "LEC", stats: { mec: 72, tmf: 79, frm: 80, cmp: 78, map: 81, ldr: 80 } },

    { id: 3021, name: "Lot", role: "TOP", team: "GX", year: 2026, rating: 80, quality: "Gold", region: "LEC", stats: { mec: 81, tmf: 79, frm: 82, cmp: 77, map: 75, ldr: 74 } },
    { id: 3022, name: "ISMA", role: "JNG", team: "GX", year: 2026, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 84, tmf: 82, frm: 81, cmp: 80, map: 83, ldr: 81 } },
    { id: 3023, name: "Jackies", role: "MID", team: "GX", year: 2026, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 86, tmf: 83, frm: 84, cmp: 82, map: 79, ldr: 78 } },
    { id: 3024, name: "Noah", role: "ADC", team: "GX", year: 2026, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 85, frm: 87, cmp: 83, map: 81, ldr: 80 } },
    { id: 3025, name: "Jun", role: "SUP", team: "GX", year: 2026, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 76, tmf: 86, frm: 87, cmp: 85, map: 89, ldr: 86 } },

    { id: 3026, name: "Myrwn", role: "TOP", team: "MKOI", year: 2026, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 84, frm: 83, cmp: 82, map: 80, ldr: 79 } },
    { id: 3027, name: "Elyoya", role: "JNG", team: "MKOI", year: 2026, rating: 91, quality: "Diamond", region: "LEC", stats: { mec: 88, tmf: 91, frm: 82, cmp: 93, map: 92, ldr: 95 } },
    { id: 3028, name: "Jojopyun", role: "MID", team: "MKOI", year: 2026, rating: 89, quality: "Diamond", region: "LEC", stats: { mec: 91, tmf: 87, frm: 89, cmp: 84, map: 85, ldr: 86 } },
    { id: 3029, name: "Supa", role: "ADC", team: "MKOI", year: 2026, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 86, tmf: 85, frm: 85, cmp: 81, map: 76, ldr: 78 } },
    { id: 3030, name: "Alvaro", role: "SUP", team: "MKOI", year: 2026, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 74, tmf: 85, frm: 87, cmp: 86, map: 88, ldr: 87 } },

    { id: 3036, name: "Baus", role: "TOP", team: "LR", year: 2026, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 86, tmf: 74, frm: 92, cmp: 78, map: 70, ldr: 83 } },
    { id: 3037, name: "Velja", role: "JNG", team: "LR", year: 2026, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 80, frm: 81, cmp: 78, map: 82, ldr: 79 } },
    { id: 3038, name: "Nemesis", role: "MID", team: "LR", year: 2026, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 85, frm: 89, cmp: 87, map: 83, ldr: 84 } },
    { id: 3039, name: "Crownie", role: "ADC", team: "LR", year: 2026, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 85, tmf: 84, frm: 86, cmp: 82, map: 79, ldr: 81 } },
    { id: 3040, name: "Rekkles", role: "SUP", team: "LR", year: 2026, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 78, tmf: 85, frm: 88, cmp: 89, map: 88, ldr: 90 } },

    { id: 3041, name: "Rooster", role: "TOP", team: "Shifters", year: 2026, rating: 80, quality: "Gold", region: "LEC", stats: { mec: 81, tmf: 79, frm: 83, cmp: 76, map: 74, ldr: 72 } },
    { id: 3042, name: "Boukada", role: "JNG", team: "Shifters", year: 2026, rating: 79, quality: "Silver", region: "LEC", stats: { mec: 80, tmf: 78, frm: 77, cmp: 76, map: 80, ldr: 77 } },
    { id: 3043, name: "nuc", role: "MID", team: "Shifters", year: 2026, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 85, tmf: 82, frm: 84, cmp: 80, map: 79, ldr: 78 } },
    { id: 3044, name: "Paduck", role: "ADC", team: "Shifters", year: 2026, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 80, frm: 82, cmp: 78, map: 76, ldr: 75 } },
    { id: 3045, name: "Trymbi", role: "SUP", team: "Shifters", year: 2026, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 75, tmf: 84, frm: 87, cmp: 85, map: 88, ldr: 89 } },

    { id: 3046, name: "Wunder", role: "TOP", team: "SK", year: 2026, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 82, tmf: 86, frm: 85, cmp: 89, map: 84, ldr: 88 } },
    { id: 3047, name: "Skeanz", role: "JNG", team: "SK", year: 2026, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 80, frm: 81, cmp: 79, map: 82, ldr: 79 } },
    { id: 3048, name: "LIDER", role: "MID", team: "SK", year: 2026, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 88, tmf: 82, frm: 80, cmp: 81, map: 75, ldr: 77 } },
    { id: 3049, name: "Jopa", role: "ADC", team: "SK", year: 2026, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 84, tmf: 81, frm: 83, cmp: 79, map: 76, ldr: 75 } },
    { id: 3050, name: "Mikyx", role: "SUP", team: "SK", year: 2026, rating: 92, quality: "Diamond", region: "LEC", stats: { mec: 86, tmf: 93, frm: 94, cmp: 92, map: 94, ldr: 95 } },

    // Fnatic 2026
    { id: 3146, name: "Empyros", role: "TOP", team: "FNC", year: 2026, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 84, tmf: 81, frm: 83, cmp: 80, map: 79, ldr: 77 } },
    { id: 3147, name: "Razork",  role: "JNG", team: "FNC", year: 2026, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 86, frm: 85, cmp: 85, map: 87, ldr: 83 } },
    { id: 3148, name: "Vladi",   role: "MID", team: "FNC", year: 2026, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 82, frm: 84, cmp: 81, map: 81, ldr: 79 } },
    { id: 3149, name: "Upset",   role: "ADC", team: "FNC", year: 2026, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 86, frm: 89, cmp: 85, map: 83, ldr: 81 } },
    { id: 3150, name: "Lospa",   role: "SUP", team: "FNC", year: 2026, rating: 84, quality: "Gold",     region: "LEC", stats: { mec: 78, tmf: 84, frm: 84, cmp: 82, map: 86, ldr: 83 } },

    { id: 3141, name: "Tao", role: "TOP", team: "KCB", year: 2026, rating: 78, quality: "Silver", region: "LEC", stats: { mec: 80, tmf: 76, frm: 79, cmp: 74, map: 73, ldr: 71 } },
    { id: 3142, name: "Yukino", role: "JNG", team: "KCB", year: 2026, rating: 79, quality: "Silver", region: "LEC", stats: { mec: 81, tmf: 78, frm: 77, cmp: 75, map: 80, ldr: 76 } },
    { id: 3143, name: "Kamiloo", role: "MID", team: "KCB", year: 2026, rating: 79, quality: "Silver", region: "LEC", stats: { mec: 82, tmf: 77, frm: 80, cmp: 76, map: 75, ldr: 73 } },
    { id: 3144, name: "Hazel", role: "ADC", team: "KCB", year: 2026, rating: 77, quality: "Silver", region: "LEC", stats: { mec: 79, tmf: 76, frm: 78, cmp: 74, map: 73, ldr: 71 } },
    { id: 3145, name: "Prime", role: "SUP", team: "KCB", year: 2026, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 74, tmf: 82, frm: 82, cmp: 79, map: 83, ldr: 82 } },

    // --- 2026 LCS ROSTERS ---
    { id: 1431, name: "Thanatos", role: "TOP", team: "C9", year: 2026, rating: 86, quality: "Platinum", region: "LCS", stats: { mec: 88, tmf: 85, frm: 87, cmp: 83, map: 82, ldr: 80 } },
    { id: 1432, name: "Blaber", role: "JNG", team: "C9", year: 2026, rating: 90, quality: "Platinum", region: "LCS", stats: { mec: 91, tmf: 89, frm: 90, cmp: 88, map: 91, ldr: 92 } },
    { id: 1433, name: "APA", role: "MID", team: "C9", year: 2026, rating: 88, quality: "Gold", region: "LCS", stats: { mec: 89, tmf: 87, frm: 90, cmp: 85, map: 86, ldr: 87 } },
    { id: 1434, name: "Zven", role: "ADC", team: "C9", year: 2026, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 84, tmf: 86, frm: 87, cmp: 88, map: 83, ldr: 85 } },
    { id: 1435, name: "Vulcan", role: "SUP", team: "C9", year: 2026, rating: 84, quality: "Gold", region: "LCS", stats: { mec: 80, tmf: 85, frm: 85, cmp: 83, map: 86, ldr: 86 } },

    { id: 1401, name: "Morgan", role: "TOP", team: "TL", year: 2026, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 83, tmf: 88, frm: 86, cmp: 85, map: 84, ldr: 83 } },
    { id: 1402, name: "Josedeodo", role: "JNG", team: "TL", year: 2026, rating: 84, quality: "Gold", region: "LCS", stats: { mec: 85, tmf: 84, frm: 83, cmp: 82, map: 85, ldr: 84 } },
    { id: 1403, name: "Quid", role: "MID", team: "TL", year: 2026, rating: 86, quality: "Platinum", region: "LCS", stats: { mec: 87, tmf: 85, frm: 88, cmp: 83, map: 84, ldr: 82 } },
    { id: 1404, name: "Yeon", role: "ADC", team: "TL", year: 2026, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 86, tmf: 84, frm: 87, cmp: 82, map: 80, ldr: 78 } },
    { id: 1405, name: "CoreJJ", role: "SUP", team: "TL", year: 2026, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 78, tmf: 89, frm: 93, cmp: 92, map: 94, ldr: 96 } },

    { id: 1436, name: "Photon",     role: "TOP", team: "DIG", year: 2026, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 84, tmf: 81, frm: 82, cmp: 79, map: 80, ldr: 76 } },
    { id: 1437, name: "eXyu",       role: "JNG", team: "DIG", year: 2026, rating: 77, quality: "Silver",   region: "LCS", stats: { mec: 78, tmf: 76, frm: 77, cmp: 74, map: 78, ldr: 73 } },
    { id: 1438, name: "Palafox",    role: "MID", team: "DIG", year: 2026, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 84, tmf: 81, frm: 83, cmp: 79, map: 80, ldr: 77 } },
    { id: 1439, name: "FBI",        role: "ADC", team: "DIG", year: 2026, rating: 79, quality: "Gold",     region: "LCS", stats: { mec: 81, tmf: 78, frm: 80, cmp: 76, map: 75, ldr: 74 } },
    { id: 1440, name: "IgNar",      role: "SUP", team: "DIG", year: 2026, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 79, tmf: 83, frm: 83, cmp: 82, map: 84, ldr: 82 } },

    { id: 1441, name: "Gakgos",     role: "TOP", team: "FLY", year: 2026, rating: 83, quality: "Gold",     region: "LCS", stats: { mec: 85, tmf: 82, frm: 84, cmp: 80, map: 80, ldr: 77 } },
    { id: 1442, name: "Gryffinn",   role: "JNG", team: "FLY", year: 2026, rating: 78, quality: "Silver",   region: "LCS", stats: { mec: 79, tmf: 77, frm: 78, cmp: 75, map: 79, ldr: 74 } },
    { id: 1443, name: "Quad",       role: "MID", team: "FLY", year: 2026, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 87, tmf: 84, frm: 86, cmp: 82, map: 83, ldr: 81 } },
    { id: 1444, name: "Massu",      role: "ADC", team: "FLY", year: 2026, rating: 83, quality: "Gold",     region: "LCS", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 78, ldr: 76 } },
    { id: 1445, name: "Cryogen",    role: "SUP", team: "FLY", year: 2026, rating: 79, quality: "Silver",   region: "LCS", stats: { mec: 77, tmf: 80, frm: 80, cmp: 79, map: 81, ldr: 78 } },

    { id: 1446, name: "Zamudo",     role: "TOP", team: "LYON", year: 2026, rating: 83, quality: "Gold",     region: "LCS", stats: { mec: 85, tmf: 82, frm: 84, cmp: 79, map: 80, ldr: 78 } },
    { id: 1447, name: "Inspired",   role: "JNG", team: "LYON", year: 2026, rating: 92, quality: "Platinum", region: "LCS", stats: { mec: 94, tmf: 91, frm: 92, cmp: 90, map: 94, ldr: 89 } },
    { id: 1448, name: "Saint",      role: "MID", team: "LYON", year: 2026, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 87, tmf: 84, frm: 86, cmp: 82, map: 83, ldr: 81 } },
    { id: 1449, name: "Berseker",   role: "ADC", team: "LYON", year: 2026, rating: 93, quality: "Gold",     region: "LCS", stats: { mec: 95, tmf: 92, frm: 94, cmp: 90, map: 88, ldr: 87 } },
    { id: 1450, name: "Isles",      role: "SUP", team: "LYON", year: 2026, rating: 81, quality: "Gold",     region: "LCS", stats: { mec: 78, tmf: 82, frm: 82, cmp: 81, map: 83, ldr: 80 } },

    { id: 1451, name: "Impact",     role: "TOP", team: "SEN", year: 2026, rating: 86, quality: "Platinum", region: "LCS", stats: { mec: 84, tmf: 87, frm: 87, cmp: 86, map: 84, ldr: 90 } },
    { id: 1452, name: "HamBak",     role: "JNG", team: "SEN", year: 2026, rating: 80, quality: "Gold",     region: "LCS", stats: { mec: 81, tmf: 79, frm: 80, cmp: 77, map: 82, ldr: 76 } },
    { id: 1453, name: "DARKWINGS",  role: "MID", team: "SEN", year: 2026, rating: 77, quality: "Silver",   region: "LCS", stats: { mec: 79, tmf: 76, frm: 78, cmp: 74, map: 75, ldr: 73 } },
    { id: 1454, name: "Rahel",      role: "ADC", team: "SEN", year: 2026, rating: 79, quality: "Silver",   region: "LCS", stats: { mec: 80, tmf: 78, frm: 80, cmp: 76, map: 75, ldr: 72 } },
    { id: 1455, name: "huhi",       role: "SUP", team: "SEN", year: 2026, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 79, tmf: 83, frm: 83, cmp: 82, map: 84, ldr: 83 } },

    { id: 1456, name: "Fudge",      role: "TOP", team: "SR",  year: 2026, rating: 84, quality: "Gold",     region: "LCS", stats: { mec: 85, tmf: 83, frm: 85, cmp: 81, map: 81, ldr: 80 } },
    { id: 1457, name: "Contractz",  role: "JNG", team: "SR",  year: 2026, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 83, tmf: 81, frm: 82, cmp: 79, map: 82, ldr: 80 } },
    { id: 1458, name: "Zinie",      role: "MID", team: "SR",  year: 2026, rating: 80, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 79, frm: 81, cmp: 77, map: 77, ldr: 75 } },
    { id: 1459, name: "Bvoy",       role: "ADC", team: "SR",  year: 2026, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 78, ldr: 77 } },
    { id: 1460, name: "Ceos",       role: "SUP", team: "SR",  year: 2026, rating: 81, quality: "Gold",     region: "LCS", stats: { mec: 77, tmf: 82, frm: 81, cmp: 80, map: 82, ldr: 79 } },

    { id: 1461, name: "Castle",     role: "TOP", team: "DSG", year: 2026, rating: 79, quality: "Silver",   region: "LCS", stats: { mec: 80, tmf: 78, frm: 80, cmp: 76, map: 77, ldr: 74 } },
    { id: 1462, name: "KryRa",      role: "JNG", team: "DSG", year: 2026, rating: 77, quality: "Silver",   region: "LCS", stats: { mec: 78, tmf: 76, frm: 77, cmp: 74, map: 78, ldr: 72 } },
    { id: 1463, name: "Callme",     role: "MID", team: "DSG", year: 2026, rating: 80, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 79, frm: 81, cmp: 77, map: 78, ldr: 76 } },
    { id: 1464, name: "sajed",      role: "ADC", team: "DSG", year: 2026, rating: 78, quality: "Silver",   region: "LCS", stats: { mec: 79, tmf: 77, frm: 79, cmp: 75, map: 74, ldr: 72 } },
    { id: 1465, name: "Lyonz",      role: "SUP", team: "DSG", year: 2026, rating: 76, quality: "Silver",   region: "LCS", stats: { mec: 73, tmf: 77, frm: 77, cmp: 76, map: 78, ldr: 75 } },

    // ==========================================
    // --- 2026 LCP ROSTERS ---
    // ==========================================

    // CTBC Flying Oyster (42.86% WR — 5th)
    { id: 6001, name: "Rest",      role: "TOP", team: "CFO", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 82, frm: 83, cmp: 79, map: 80, ldr: 78 } },
    { id: 6002, name: "Shad0w",    role: "JNG", team: "CFO", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 82, tmf: 83, frm: 82, cmp: 79, map: 83, ldr: 79 } },
    { id: 6003, name: "Pungyeon",  role: "MID", team: "CFO", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 82, frm: 83, cmp: 80, map: 80, ldr: 79 } },
    { id: 6004, name: "Doggo",     role: "ADC", team: "CFO", year: 2026, rating: 83, quality: "Gold",     region: "LCP", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 79, ldr: 77 } },
    { id: 6005, name: "2274",      role: "SUP", team: "CFO", year: 2026, rating: 80, quality: "Gold",     region: "LCP", stats: { mec: 75, tmf: 81, frm: 80, cmp: 79, map: 82, ldr: 80 } },

    // Deep Cross Gaming (58.33% WR — 2nd seed)
    { id: 6011, name: "Flauren",   role: "TOP", team: "DCG", year: 2026, rating: 84, quality: "Gold",     region: "LCP", stats: { mec: 85, tmf: 83, frm: 85, cmp: 81, map: 82, ldr: 79 } },
    { id: 6012, name: "POP9",      role: "JNG", team: "DCG", year: 2026, rating: 83, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 83, frm: 83, cmp: 80, map: 84, ldr: 80 } },
    { id: 6013, name: "HongSuo",   role: "MID", team: "DCG", year: 2026, rating: 86, quality: "Platinum", region: "LCP", stats: { mec: 87, tmf: 85, frm: 87, cmp: 83, map: 83, ldr: 81 } },
    { id: 6014, name: "Feng",      role: "ADC", team: "DCG", year: 2026, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 86, tmf: 84, frm: 86, cmp: 82, map: 81, ldr: 79 } },
    { id: 6015, name: "ShiauC",    role: "SUP", team: "DCG", year: 2026, rating: 83, quality: "Gold",     region: "LCP", stats: { mec: 78, tmf: 84, frm: 83, cmp: 82, map: 85, ldr: 82 } },

    // DetonatioN FocusMe (6.67% WR — 8th, last place)
    { id: 6021, name: "RayFarky",  role: "TOP", team: "DFM", year: 2026, rating: 76, quality: "Silver",   region: "LCP", stats: { mec: 77, tmf: 75, frm: 77, cmp: 73, map: 74, ldr: 71 } },
    { id: 6022, name: "Momo",      role: "TOP", team: "DFM", year: 2026, rating: 73, quality: "Silver",   region: "LCP", stats: { mec: 74, tmf: 72, frm: 74, cmp: 70, map: 71, ldr: 68 } },
    { id: 6023, name: "Citrus",    role: "JNG", team: "DFM", year: 2026, rating: 72, quality: "Silver",   region: "LCP", stats: { mec: 73, tmf: 72, frm: 73, cmp: 70, map: 72, ldr: 68 } },
    { id: 6024, name: "Keine",     role: "MID", team: "DFM", year: 2026, rating: 77, quality: "Silver",   region: "LCP", stats: { mec: 79, tmf: 76, frm: 80, cmp: 74, map: 74, ldr: 71 } },
    { id: 6025, name: "Kakkun",    role: "ADC", team: "DFM", year: 2026, rating: 74, quality: "Silver",   region: "LCP", stats: { mec: 75, tmf: 73, frm: 75, cmp: 71, map: 72, ldr: 68 } },
    { id: 6026, name: "Gaeng",     role: "SUP", team: "DFM", year: 2026, rating: 72, quality: "Silver",   region: "LCP", stats: { mec: 68, tmf: 73, frm: 72, cmp: 71, map: 74, ldr: 70 } },

    // Fukuoka SoftBank HAWKS gaming (45.16% WR — 4th)
    { id: 6031, name: "Evi",       role: "TOP", team: "SBH", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 82, frm: 82, cmp: 81, map: 79, ldr: 80 } },
    { id: 6032, name: "Van1",      role: "JNG", team: "SBH", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 82, tmf: 83, frm: 82, cmp: 79, map: 83, ldr: 79 } },
    { id: 6033, name: "Aria",      role: "MID", team: "SBH", year: 2026, rating: 83, quality: "Gold",     region: "LCP", stats: { mec: 84, tmf: 82, frm: 84, cmp: 81, map: 81, ldr: 79 } },
    { id: 6034, name: "Marble",    role: "ADC", team: "SBH", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 79, ldr: 76 } },
    { id: 6035, name: "Vsta",      role: "SUP", team: "SBH", year: 2026, rating: 83, quality: "Gold",     region: "LCP", stats: { mec: 78, tmf: 84, frm: 83, cmp: 82, map: 85, ldr: 83 } },

    // GAM Esports (50% WR — 3rd seed)
    { id: 6041, name: "Kiaya",     role: "TOP", team: "GAM", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 80, ldr: 77 } },
    { id: 6042, name: "Draktharr", role: "JNG", team: "GAM", year: 2026, rating: 80, quality: "Gold",     region: "LCP", stats: { mec: 80, tmf: 80, frm: 80, cmp: 77, map: 81, ldr: 77 } },
    { id: 6043, name: "Aress",     role: "MID", team: "GAM", year: 2026, rating: 83, quality: "Gold",     region: "LCP", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 81, ldr: 79 } },
    { id: 6044, name: "Artemis",   role: "ADC", team: "GAM", year: 2026, rating: 84, quality: "Gold",     region: "LCP", stats: { mec: 85, tmf: 83, frm: 85, cmp: 81, map: 80, ldr: 78 } },
    { id: 6045, name: "Taki",      role: "SUP", team: "GAM", year: 2026, rating: 83, quality: "Gold",     region: "LCP", stats: { mec: 78, tmf: 84, frm: 83, cmp: 82, map: 85, ldr: 82 } },

    // Ground Zero Gaming (48.48% WR — 6th)
    { id: 6051, name: "1Jiang",    role: "TOP", team: "GZG", year: 2026, rating: 81, quality: "Gold",     region: "LCP", stats: { mec: 82, tmf: 81, frm: 83, cmp: 78, map: 80, ldr: 77 } },
    { id: 6052, name: "Husha",     role: "JNG", team: "GZG", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 82, tmf: 82, frm: 82, cmp: 79, map: 83, ldr: 79 } },
    { id: 6053, name: "JimieN",    role: "MID", team: "GZG", year: 2026, rating: 81, quality: "Gold",     region: "LCP", stats: { mec: 82, tmf: 81, frm: 82, cmp: 79, map: 80, ldr: 78 } },
    { id: 6054, name: "Shunn",     role: "ADC", team: "GZG", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 79, ldr: 76 } },
    { id: 6055, name: "Orca",      role: "SUP", team: "GZG", year: 2026, rating: 81, quality: "Gold",     region: "LCP", stats: { mec: 76, tmf: 82, frm: 81, cmp: 80, map: 83, ldr: 80 } },

    // MVK Esports (44.44% WR — 7th)
    { id: 6061, name: "Kratos",    role: "TOP", team: "MVK", year: 2026, rating: 79, quality: "Silver",   region: "LCP", stats: { mec: 80, tmf: 79, frm: 80, cmp: 76, map: 78, ldr: 74 } },
    { id: 6062, name: "SofM",      role: "JNG", team: "MVK", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 83, frm: 82, cmp: 80, map: 84, ldr: 82 } },
    { id: 6063, name: "Gury",      role: "JNG", team: "MVK", year: 2026, rating: 80, quality: "Gold",     region: "LCP", stats: { mec: 80, tmf: 80, frm: 80, cmp: 77, map: 81, ldr: 77 } },
    { id: 6064, name: "Kati",      role: "MID", team: "MVK", year: 2026, rating: 81, quality: "Gold",     region: "LCP", stats: { mec: 82, tmf: 80, frm: 82, cmp: 78, map: 79, ldr: 76 } },
    { id: 6065, name: "Seany",     role: "MID", team: "MVK", year: 2026, rating: 78, quality: "Silver",   region: "LCP", stats: { mec: 79, tmf: 77, frm: 79, cmp: 75, map: 76, ldr: 74 } },
    { id: 6066, name: "Shogun",    role: "ADC", team: "MVK", year: 2026, rating: 82, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 81, frm: 83, cmp: 79, map: 78, ldr: 75 } },
    { id: 6067, name: "Elio",      role: "SUP", team: "MVK", year: 2026, rating: 78, quality: "Silver",   region: "LCP", stats: { mec: 73, tmf: 79, frm: 78, cmp: 77, map: 80, ldr: 77 } },

    // Team Secret Whales (78.57% WR — Champions)
    { id: 6071, name: "Pun",       role: "TOP", team: "TSW", year: 2026, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 86, tmf: 84, frm: 86, cmp: 82, map: 83, ldr: 82 } },
    { id: 6072, name: "Hiro02",    role: "TOP", team: "TSW", year: 2026, rating: 77, quality: "Silver",   region: "LCP", stats: { mec: 78, tmf: 76, frm: 78, cmp: 74, map: 75, ldr: 72 } },
    { id: 6073, name: "Hizto",     role: "JNG", team: "TSW", year: 2026, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 87, tmf: 88, frm: 86, cmp: 87, map: 91, ldr: 85 } },
    { id: 6074, name: "Dire",      role: "MID", team: "TSW", year: 2026, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 89, tmf: 87, frm: 89, cmp: 86, map: 86, ldr: 84 } },
    { id: 6075, name: "Eddie",     role: "ADC", team: "TSW", year: 2026, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 89, tmf: 87, frm: 89, cmp: 85, map: 82, ldr: 79 } },
    { id: 6076, name: "Bie",       role: "SUP", team: "TSW", year: 2026, rating: 87, quality: "Platinum", region: "LCP", stats: { mec: 81, tmf: 88, frm: 88, cmp: 86, map: 90, ldr: 86 } },

    // ==========================================
    // --- 2.5. 2025 LCK ROSTERS ---
    // ==========================================
    { id: 501, name: "Morgan",    role: "TOP", team: "BRO",   year: 2025, rating: 84, quality: "Gold",        region: "LCK", stats: { mec: 83, tmf: 88, frm: 85, cmp: 85, map: 84, ldr: 83 } },
    { id: 502, name: "HamBak",    role: "JNG", team: "BRO",   year: 2025, rating: 81, quality: "Gold",        region: "LCK", stats: { mec: 82, tmf: 80, frm: 81, cmp: 78, map: 82, ldr: 77 } },
    { id: 503, name: "Clozer",    role: "MID", team: "BRO",   year: 2025, rating: 84, quality: "Gold",        region: "LCK", stats: { mec: 87, tmf: 82, frm: 84, cmp: 80, map: 78, ldr: 76 } },
    { id: 504, name: "Hype",      role: "ADC", team: "BRO",   year: 2025, rating: 78, quality: "Silver",      region: "LCK", stats: { mec: 79, tmf: 78, frm: 79, cmp: 75, map: 75, ldr: 73 } },
    { id: 505, name: "Pollu",     role: "SUP", team: "BRO",   year: 2025, rating: 77, quality: "Silver",      region: "LCK", stats: { mec: 75, tmf: 78, frm: 78, cmp: 77, map: 79, ldr: 76 } },

    { id: 511, name: "Siwoo",     role: "TOP", team: "DK",    year: 2025, rating: 83, quality: "Gold",        region: "LCK", stats: { mec: 85, tmf: 82, frm: 84, cmp: 80, map: 80, ldr: 77 } },
    { id: 512, name: "Lucid",     role: "JNG", team: "DK",    year: 2025, rating: 88, quality: "Platinum",    region: "LCK", stats: { mec: 89, tmf: 87, frm: 88, cmp: 85, map: 87, ldr: 83 } },
    { id: 513, name: "ShowMaker", role: "MID", team: "DK",    year: 2025, rating: 93, quality: "Master",      region: "LCK", stats: { mec: 94, tmf: 91, frm: 92, cmp: 92, map: 90, ldr: 92 } },
    { id: 514, name: "Aiming",    role: "ADC", team: "DK",    year: 2025, rating: 90, quality: "Diamond",     region: "LCK", stats: { mec: 91, tmf: 89, frm: 91, cmp: 87, map: 83, ldr: 82 } },
    { id: 515, name: "BeryL",     role: "SUP", team: "DK",    year: 2025, rating: 89, quality: "Platinum",    region: "LCK", stats: { mec: 81, tmf: 89, frm: 92, cmp: 91, map: 93, ldr: 94 } },

    { id: 521, name: "Rich",      role: "TOP", team: "DRX",   year: 2025, rating: 84, quality: "Gold",        region: "LCK", stats: { mec: 85, tmf: 83, frm: 85, cmp: 81, map: 79, ldr: 79 } },
    { id: 522, name: "Sponge",    role: "JNG", team: "DRX",   year: 2025, rating: 82, quality: "Gold",        region: "LCK", stats: { mec: 83, tmf: 81, frm: 82, cmp: 79, map: 82, ldr: 77 } },
    { id: 523, name: "ucal",      role: "MID", team: "DRX",   year: 2025, rating: 85, quality: "Platinum",    region: "LCK", stats: { mec: 87, tmf: 84, frm: 86, cmp: 83, map: 81, ldr: 82 } },
    { id: 524, name: "Teddy",     role: "ADC", team: "DRX",   year: 2025, rating: 83, quality: "Gold",        region: "LCK", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 80, ldr: 80 } },
    { id: 525, name: "Andil",     role: "SUP", team: "DRX",   year: 2025, rating: 81, quality: "Gold",        region: "LCK", stats: { mec: 79, tmf: 82, frm: 81, cmp: 79, map: 83, ldr: 80 } },
    { id: 526, name: "LazyFeel",  role: "ADC", team: "DRX",   year: 2025, rating: 79, quality: "Silver",      region: "LCK", stats: { mec: 80, tmf: 78, frm: 79, cmp: 76, map: 77, ldr: 73 } },

    { id: 531, name: "Clear",     role: "TOP", team: "BFX",   year: 2025, rating: 79, quality: "Silver",      region: "LCK", stats: { mec: 81, tmf: 78, frm: 80, cmp: 76, map: 77, ldr: 74 } },
    { id: 532, name: "Raptor",    role: "JNG", team: "BFX",   year: 2025, rating: 76, quality: "Silver",      region: "LCK", stats: { mec: 77, tmf: 75, frm: 76, cmp: 73, map: 77, ldr: 72 } },
    { id: 533, name: "VicLa",     role: "MID", team: "BFX",   year: 2025, rating: 82, quality: "Gold",        region: "LCK", stats: { mec: 84, tmf: 81, frm: 83, cmp: 79, map: 79, ldr: 78 } },
    { id: 534, name: "Diable",    role: "ADC", team: "BFX",   year: 2025, rating: 80, quality: "Gold",        region: "LCK", stats: { mec: 82, tmf: 79, frm: 81, cmp: 77, map: 77, ldr: 75 } },
    { id: 535, name: "Kellin",    role: "SUP", team: "BFX",   year: 2025, rating: 86, quality: "Platinum",    region: "LCK", stats: { mec: 82, tmf: 87, frm: 86, cmp: 85, map: 88, ldr: 84 } },

    { id: 541, name: "DuDu",      role: "TOP", team: "DNS",   year: 2025, rating: 84, quality: "Gold",        region: "LCK", stats: { mec: 86, tmf: 82, frm: 85, cmp: 81, map: 81, ldr: 79 } },
    { id: 542, name: "Pyosik",    role: "JNG", team: "DNS",   year: 2025, rating: 87, quality: "Platinum",    region: "LCK", stats: { mec: 88, tmf: 86, frm: 87, cmp: 84, map: 87, ldr: 84 } },
    { id: 543, name: "BuLLDoG",   role: "MID", team: "DNS",   year: 2025, rating: 81, quality: "Gold",        region: "LCK", stats: { mec: 83, tmf: 80, frm: 82, cmp: 78, map: 79, ldr: 77 } },
    { id: 544, name: "Berserker", role: "ADC", team: "DNS",   year: 2025, rating: 90, quality: "Diamond",     region: "LCK", stats: { mec: 92, tmf: 89, frm: 91, cmp: 86, map: 85, ldr: 83 } },
    { id: 545, name: "Life",      role: "SUP", team: "DNS",   year: 2025, rating: 82, quality: "Gold",        region: "LCK", stats: { mec: 79, tmf: 83, frm: 83, cmp: 81, map: 84, ldr: 82 } },

    { id: 551, name: "Kiin",      role: "TOP", team: "Gen.G", year: 2025, rating: 94, quality: "Master",      region: "LCK", stats: { mec: 94, tmf: 94, frm: 95, cmp: 93, map: 88, ldr: 89 } },
    { id: 552, name: "Canyon",    role: "JNG", team: "Gen.G", year: 2025, rating: 96, quality: "Grandmaster", region: "LCK", stats: { mec: 96, tmf: 95, frm: 98, cmp: 94, map: 97, ldr: 91 } },
    { id: 553, name: "Chovy",     role: "MID", team: "Gen.G", year: 2025, rating: 97, quality: "Challenger",  region: "LCK", stats: { mec: 99, tmf: 96, frm: 99, cmp: 96, map: 92, ldr: 89 } },
    { id: 554, name: "Ruler",     role: "ADC", team: "Gen.G", year: 2025, rating: 94, quality: "Master",      region: "LCK", stats: { mec: 95, tmf: 95, frm: 95, cmp: 92, map: 87, ldr: 88 } },
    { id: 555, name: "Duro",      role: "SUP", team: "Gen.G", year: 2025, rating: 85, quality: "Platinum",    region: "LCK", stats: { mec: 82, tmf: 85, frm: 85, cmp: 84, map: 87, ldr: 84 } },

    { id: 561, name: "Zeus",      role: "TOP", team: "HLE",   year: 2025, rating: 93, quality: "Master",      region: "LCK", stats: { mec: 96, tmf: 92, frm: 94, cmp: 89, map: 87, ldr: 85 } },
    { id: 562, name: "Peanut",    role: "JNG", team: "HLE",   year: 2025, rating: 92, quality: "Master",      region: "LCK", stats: { mec: 87, tmf: 94, frm: 89, cmp: 92, map: 95, ldr: 94 } },
    { id: 563, name: "Zeka",      role: "MID", team: "HLE",   year: 2025, rating: 92, quality: "Master",      region: "LCK", stats: { mec: 97, tmf: 91, frm: 93, cmp: 88, map: 87, ldr: 84 } },
    { id: 564, name: "Viper",     role: "ADC", team: "HLE",   year: 2025, rating: 93, quality: "Master",      region: "LCK", stats: { mec: 96, tmf: 94, frm: 94, cmp: 91, map: 88, ldr: 86 } },
    { id: 565, name: "Delight",   role: "SUP", team: "HLE",   year: 2025, rating: 90, quality: "Diamond",     region: "LCK", stats: { mec: 82, tmf: 92, frm: 89, cmp: 88, map: 91, ldr: 86 } },

    { id: 571, name: "PerfecT",   role: "TOP", team: "KT",    year: 2025, rating: 87, quality: "Platinum",    region: "LCK", stats: { mec: 86, tmf: 89, frm: 88, cmp: 85, map: 84, ldr: 82 } },
    { id: 572, name: "Cuzz",      role: "JNG", team: "KT",    year: 2025, rating: 89, quality: "Diamond",     region: "LCK", stats: { mec: 88, tmf: 89, frm: 89, cmp: 86, map: 89, ldr: 86 } },
    { id: 573, name: "Bdd",       role: "MID", team: "KT",    year: 2025, rating: 93, quality: "Master",      region: "LCK", stats: { mec: 89, tmf: 92, frm: 92, cmp: 93, map: 94, ldr: 96 } },
    { id: 574, name: "deokdam",   role: "ADC", team: "KT",    year: 2025, rating: 86, quality: "Platinum",    region: "LCK", stats: { mec: 88, tmf: 85, frm: 88, cmp: 83, map: 81, ldr: 80 } },
    { id: 575, name: "Peter",     role: "SUP", team: "KT",    year: 2025, rating: 88, quality: "Platinum",    region: "LCK", stats: { mec: 81, tmf: 89, frm: 89, cmp: 88, map: 90, ldr: 90 } },

    { id: 581, name: "Kingen",    role: "TOP", team: "NS",    year: 2025, rating: 87, quality: "Platinum",    region: "LCK", stats: { mec: 87, tmf: 89, frm: 88, cmp: 85, map: 81, ldr: 84 } },
    { id: 582, name: "GIDEON",    role: "JNG", team: "NS",    year: 2025, rating: 83, quality: "Gold",        region: "LCK", stats: { mec: 85, tmf: 82, frm: 83, cmp: 80, map: 83, ldr: 79 } },
    { id: 583, name: "Fisher",    role: "MID", team: "NS",    year: 2025, rating: 82, quality: "Gold",        region: "LCK", stats: { mec: 84, tmf: 81, frm: 83, cmp: 79, map: 80, ldr: 78 } },
    { id: 584, name: "Jiwoo",     role: "ADC", team: "NS",    year: 2025, rating: 85, quality: "Platinum",    region: "LCK", stats: { mec: 88, tmf: 83, frm: 86, cmp: 82, map: 80, ldr: 78 } },
    { id: 585, name: "Lehends",   role: "SUP", team: "NS",    year: 2025, rating: 92, quality: "Diamond",     region: "LCK", stats: { mec: 82, tmf: 93, frm: 92, cmp: 91, map: 93, ldr: 94 } },

    { id: 591, name: "Doran",     role: "TOP", team: "T1",    year: 2025, rating: 91, quality: "Diamond",     region: "LCK", stats: { mec: 92, tmf: 89, frm: 91, cmp: 87, map: 86, ldr: 88 } },
    { id: 592, name: "Oner",      role: "JNG", team: "T1",    year: 2025, rating: 92, quality: "Master",      region: "LCK", stats: { mec: 93, tmf: 91, frm: 89, cmp: 89, map: 93, ldr: 88 } },
    { id: 593, name: "Faker",     role: "MID", team: "T1",    year: 2025, rating: 95, quality: "Master",  region: "LCK", stats: { mec: 90, tmf: 95, frm: 89, cmp: 97, map: 96, ldr: 99 } },
    { id: 594, name: "Gumayusi", role: "ADC", team: "T1",    year: 2025, rating: 91, quality: "Diamond",     region: "LCK", stats: { mec: 94, tmf: 92, frm: 93, cmp: 90, map: 83, ldr: 85 } },
    { id: 595, name: "Keria",     role: "SUP", team: "T1",    year: 2025, rating: 94, quality: "Master",      region: "LCK", stats: { mec: 85, tmf: 94, frm: 95, cmp: 96, map: 97, ldr: 92 } },
    { id: 596, name: "Smash",     role: "ADC", team: "T1",    year: 2025, rating: 89, quality: "Diamond",     region: "LCK", stats: { mec: 92, tmf: 88, frm: 90, cmp: 85, map: 84, ldr: 80 } },

    // ==========================================
    // --- 1b. 2025 LEC ROSTERS ---
    // ==========================================

    // Fnatic
    { id: 2201, name: "Oscarinin", role: "TOP", team: "FNC", year: 2025, rating: 88, quality: "Platinum",  region: "LEC", stats: { mec: 90, tmf: 87, frm: 88, cmp: 87, map: 86, ldr: 84 } },
    { id: 2202, name: "Razork",    role: "JNG", team: "FNC", year: 2025, rating: 85, quality: "Platinum",  region: "LEC", stats: { mec: 86, tmf: 85, frm: 84, cmp: 84, map: 86, ldr: 82 } },
    { id: 2203, name: "Poby",      role: "MID", team: "FNC", year: 2025, rating: 80, quality: "Gold",      region: "LEC", stats: { mec: 82, tmf: 79, frm: 81, cmp: 78, map: 78, ldr: 75 } },
    { id: 2204, name: "Upset",     role: "ADC", team: "FNC", year: 2025, rating: 88, quality: "Platinum",  region: "LEC", stats: { mec: 90, tmf: 87, frm: 90, cmp: 86, map: 84, ldr: 82 } },
    { id: 2205, name: "Mikyx",     role: "SUP", team: "FNC", year: 2025, rating: 91, quality: "Diamond",   region: "LEC", stats: { mec: 86, tmf: 91, frm: 92, cmp: 90, map: 94, ldr: 93 } },

    // G2 Esports
    { id: 2206, name: "BrokenBlade", role: "TOP", team: "G2", year: 2025, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 89, frm: 88, cmp: 88, map: 85, ldr: 88 } },
    { id: 2207, name: "SkewMond",    role: "JNG", team: "G2", year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 83, frm: 81, cmp: 80, map: 83, ldr: 78 } },
    { id: 2208, name: "Caps",        role: "MID", team: "G2", year: 2025, rating: 94, quality: "Master",   region: "LEC", stats: { mec: 94, tmf: 95, frm: 93, cmp: 96, map: 94, ldr: 95 } },
    { id: 2209, name: "Hans Sama",   role: "ADC", team: "G2", year: 2025, rating: 89, quality: "Diamond",  region: "LEC", stats: { mec: 91, tmf: 88, frm: 91, cmp: 87, map: 85, ldr: 84 } },
    { id: 2210, name: "Labrov",      role: "SUP", team: "G2", year: 2025, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 80, tmf: 87, frm: 87, cmp: 86, map: 88, ldr: 85 } },

    // GIANTX
    { id: 2211, name: "Lot",     role: "TOP", team: "GX", year: 2025, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 81, tmf: 80, frm: 82, cmp: 78, map: 76, ldr: 75 } },
    { id: 2212, name: "Isma",    role: "JNG", team: "GX", year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 82, frm: 81, cmp: 80, map: 83, ldr: 80 } },
    { id: 2213, name: "Jackies", role: "MID", team: "GX", year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 82, frm: 83, cmp: 81, map: 80, ldr: 79 } },
    { id: 2214, name: "Noah",    role: "ADC", team: "GX", year: 2025, rating: 84, quality: "Gold",     region: "LEC", stats: { mec: 86, tmf: 83, frm: 85, cmp: 82, map: 80, ldr: 79 } },
    { id: 2215, name: "Jun",     role: "SUP", team: "GX", year: 2025, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 75, tmf: 85, frm: 85, cmp: 84, map: 88, ldr: 84 } },

    // Karmine Corp
    { id: 2216, name: "Canna",    role: "TOP", team: "KC", year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 81, frm: 84, cmp: 80, map: 80, ldr: 77 } },
    { id: 2217, name: "Yike",     role: "JNG", team: "KC", year: 2025, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 87, frm: 84, cmp: 85, map: 87, ldr: 84 } },
    { id: 2218, name: "Vladi",    role: "MID", team: "KC", year: 2025, rating: 81, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 80, frm: 82, cmp: 79, map: 79, ldr: 77 } },
    { id: 2219, name: "Caliste",  role: "ADC", team: "KC", year: 2025, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 85, frm: 88, cmp: 83, map: 81, ldr: 79 } },
    { id: 2220, name: "Targamas", role: "SUP", team: "KC", year: 2025, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 78, tmf: 85, frm: 85, cmp: 83, map: 87, ldr: 86 } },

    // Movistar KOI
    { id: 2221, name: "Myrwn",    role: "TOP", team: "MKOI", year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 86, tmf: 82, frm: 83, cmp: 81, map: 80, ldr: 78 } },
    { id: 2222, name: "Elyoya",   role: "JNG", team: "MKOI", year: 2025, rating: 90, quality: "Diamond",  region: "LEC", stats: { mec: 87, tmf: 90, frm: 82, cmp: 91, map: 91, ldr: 93 } },
    { id: 2223, name: "Jojopyun", role: "MID", team: "MKOI", year: 2025, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 86, frm: 88, cmp: 83, map: 85, ldr: 86 } },
    { id: 2224, name: "Supa",     role: "ADC", team: "MKOI", year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 84, tmf: 82, frm: 84, cmp: 80, map: 77, ldr: 78 } },
    { id: 2225, name: "Alvaro",   role: "SUP", team: "MKOI", year: 2025, rating: 84, quality: "Gold",     region: "LEC", stats: { mec: 74, tmf: 83, frm: 85, cmp: 84, map: 87, ldr: 85 } },

    // Natus Vincere
    { id: 2226, name: "Adam",      role: "TOP", team: "NAVI", year: 2025, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 84, tmf: 85, frm: 87, cmp: 83, map: 84, ldr: 86 } },
    { id: 2227, name: "Thayger",   role: "JNG", team: "NAVI", year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 81, frm: 81, cmp: 80, map: 83, ldr: 79 } },
    { id: 2228, name: "Larssen",   role: "MID", team: "NAVI", year: 2025, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 87, frm: 89, cmp: 86, map: 85, ldr: 84 } },
    { id: 2229, name: "Hans SamD", role: "ADC", team: "NAVI", year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 82, frm: 85, cmp: 80, map: 79, ldr: 77 } },
    { id: 2230, name: "Malrang",   role: "SUP", team: "NAVI", year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 84, tmf: 83, frm: 80, cmp: 83, map: 84, ldr: 82 } },

    // SK Gaming
    { id: 2231, name: "DnDn",      role: "TOP", team: "SK", year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 84, tmf: 81, frm: 83, cmp: 80, map: 80, ldr: 78 } },
    { id: 2232, name: "Skeanz",    role: "JNG", team: "SK", year: 2025, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 82, tmf: 79, frm: 80, cmp: 78, map: 81, ldr: 77 } },
    { id: 2233, name: "Abbedagge", role: "MID", team: "SK", year: 2025, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 85, frm: 87, cmp: 85, map: 83, ldr: 82 } },
    { id: 2234, name: "Keduii",    role: "ADC", team: "SK", year: 2025, rating: 81, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 80, frm: 82, cmp: 79, map: 78, ldr: 76 } },
    { id: 2235, name: "Loopy",     role: "SUP", team: "SK", year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 77, tmf: 83, frm: 84, cmp: 82, map: 85, ldr: 84 } },

    // Team BDS
    { id: 2236, name: "Rooster", role: "TOP", team: "BDS", year: 2025, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 81, tmf: 79, frm: 82, cmp: 77, map: 76, ldr: 74 } },
    { id: 2237, name: "Boukada", role: "JNG", team: "BDS", year: 2025, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 81, tmf: 80, frm: 78, cmp: 79, map: 81, ldr: 78 } },
    { id: 2238, name: "Nuc",     role: "MID", team: "BDS", year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 82, frm: 84, cmp: 81, map: 80, ldr: 79 } },
    { id: 2239, name: "Ice",     role: "ADC", team: "BDS", year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 82, frm: 84, cmp: 81, map: 80, ldr: 78 } },
    { id: 2240, name: "Parus",   role: "SUP", team: "BDS", year: 2025, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 74, tmf: 80, frm: 80, cmp: 78, map: 82, ldr: 81 } },

    // Team Heretics
    { id: 2241, name: "Carlsen", role: "TOP", team: "TH", year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 81, frm: 83, cmp: 80, map: 79, ldr: 79 } },
    { id: 2242, name: "Sheo",    role: "JNG", team: "TH", year: 2025, rating: 83, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 84, frm: 82, cmp: 81, map: 83, ldr: 80 } },
    { id: 2243, name: "Kamiloo", role: "MID", team: "TH", year: 2025, rating: 79, quality: "Silver",   region: "LEC", stats: { mec: 81, tmf: 78, frm: 80, cmp: 76, map: 76, ldr: 74 } },
    { id: 2244, name: "Flakked", role: "ADC", team: "TH", year: 2025, rating: 84, quality: "Gold",     region: "LEC", stats: { mec: 86, tmf: 83, frm: 85, cmp: 82, map: 80, ldr: 79 } },
    { id: 2245, name: "Stend",   role: "SUP", team: "TH", year: 2025, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 72, tmf: 80, frm: 81, cmp: 78, map: 83, ldr: 81 } },

    // Team Vitality
    { id: 2246, name: "Naak Nako", role: "TOP", team: "VIT", year: 2025, rating: 81, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 80, frm: 82, cmp: 79, map: 77, ldr: 75 } },
    { id: 2247, name: "Lyncas",    role: "JNG", team: "VIT", year: 2025, rating: 82, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 81, frm: 80, cmp: 81, map: 84, ldr: 81 } },
    { id: 2248, name: "Czajek",    role: "MID", team: "VIT", year: 2025, rating: 79, quality: "Silver",   region: "LEC", stats: { mec: 81, tmf: 78, frm: 80, cmp: 77, map: 76, ldr: 74 } },
    { id: 2249, name: "Carzzy",    role: "ADC", team: "VIT", year: 2025, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 86, frm: 87, cmp: 88, map: 82, ldr: 84 } },
    { id: 2250, name: "Fleshy",    role: "SUP", team: "VIT", year: 2025, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 74, tmf: 80, frm: 81, cmp: 78, map: 83, ldr: 82 } },

    // ==========================================
    // --- 2025 LCS ROSTERS (LTA North Split 3) ---
    // ==========================================

    // 100 Thieves (53.8% WR — 3rd seed)
    { id: 4501, name: "Sniper",    role: "TOP", team: "100T", year: 2025, rating: 77, quality: "Silver",   region: "LCS", stats: { mec: 79, tmf: 76, frm: 78, cmp: 73, map: 74, ldr: 71 } },
    { id: 4502, name: "Dhokla",    role: "TOP", team: "100T", year: 2025, rating: 83, quality: "Gold",     region: "LCS", stats: { mec: 83, tmf: 83, frm: 83, cmp: 80, map: 82, ldr: 79 } },
    { id: 4503, name: "River",     role: "JNG", team: "100T", year: 2025, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 83, frm: 82, cmp: 79, map: 83, ldr: 78 } },
    { id: 4504, name: "Quid",      role: "MID", team: "100T", year: 2025, rating: 84, quality: "Gold",     region: "LCS", stats: { mec: 85, tmf: 84, frm: 85, cmp: 81, map: 82, ldr: 79 } },
    { id: 4505, name: "FBI",       role: "ADC", team: "100T", year: 2025, rating: 86, quality: "Platinum", region: "LCS", stats: { mec: 87, tmf: 85, frm: 87, cmp: 83, map: 82, ldr: 80 } },
    { id: 4506, name: "Eyla",      role: "SUP", team: "100T", year: 2025, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 77, tmf: 83, frm: 83, cmp: 81, map: 84, ldr: 81 } },

    // Cloud9 (61.9% WR — 2nd seed)
    { id: 4511, name: "Thanatos",  role: "TOP", team: "C9",   year: 2025, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 86, tmf: 85, frm: 86, cmp: 82, map: 83, ldr: 80 } },
    { id: 4512, name: "Blaber",    role: "JNG", team: "C9",   year: 2025, rating: 87, quality: "Platinum", region: "LCS", stats: { mec: 87, tmf: 87, frm: 87, cmp: 84, map: 89, ldr: 87 } },
    { id: 4513, name: "Loki",      role: "MID", team: "C9",   year: 2025, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 89, tmf: 87, frm: 89, cmp: 85, map: 85, ldr: 83 } },
    { id: 4514, name: "Zven",      role: "ADC", team: "C9",   year: 2025, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 89, tmf: 87, frm: 89, cmp: 87, map: 84, ldr: 85 } },
    { id: 4515, name: "Vulcan",    role: "SUP", team: "C9",   year: 2025, rating: 86, quality: "Platinum", region: "LCS", stats: { mec: 80, tmf: 87, frm: 87, cmp: 85, map: 89, ldr: 87 } },

    // Dignitas (18.2% WR — 8th, last place)
    { id: 4521, name: "Photon",    role: "TOP", team: "DIG",  year: 2025, rating: 79, quality: "Silver",   region: "LCS", stats: { mec: 80, tmf: 78, frm: 80, cmp: 76, map: 77, ldr: 74 } },
    { id: 4522, name: "Sheiden",   role: "JNG", team: "DIG",  year: 2025, rating: 77, quality: "Silver",   region: "LCS", stats: { mec: 78, tmf: 77, frm: 77, cmp: 74, map: 78, ldr: 72 } },
    { id: 4523, name: "Keine",     role: "MID", team: "DIG",  year: 2025, rating: 78, quality: "Silver",   region: "LCS", stats: { mec: 80, tmf: 77, frm: 79, cmp: 75, map: 76, ldr: 73 } },
    { id: 4524, name: "Tomo",      role: "ADC", team: "DIG",  year: 2025, rating: 79, quality: "Silver",   region: "LCS", stats: { mec: 80, tmf: 78, frm: 80, cmp: 75, map: 76, ldr: 72 } },
    { id: 4525, name: "Isles",     role: "SUP", team: "DIG",  year: 2025, rating: 76, quality: "Silver",   region: "LCS", stats: { mec: 71, tmf: 77, frm: 77, cmp: 75, map: 78, ldr: 74 } },

    // Disguised (47.1% WR — 5th)
    { id: 4531, name: "Castle",    role: "TOP", team: "DSG",  year: 2025, rating: 81, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 81, frm: 82, cmp: 78, map: 79, ldr: 76 } },
    { id: 4532, name: "eXyu",      role: "JNG", team: "DSG",  year: 2025, rating: 79, quality: "Silver",   region: "LCS", stats: { mec: 80, tmf: 79, frm: 79, cmp: 76, map: 80, ldr: 75 } },
    { id: 4533, name: "DARKWINGS", role: "MID", team: "DSG",  year: 2025, rating: 80, quality: "Gold",     region: "LCS", stats: { mec: 81, tmf: 79, frm: 81, cmp: 77, map: 79, ldr: 75 } },
    { id: 4534, name: "Rahel",     role: "ADC", team: "DSG",  year: 2025, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 83, tmf: 81, frm: 84, cmp: 78, map: 77, ldr: 74 } },
    { id: 4535, name: "huhi",      role: "SUP", team: "DSG",  year: 2025, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 78, tmf: 83, frm: 82, cmp: 82, map: 84, ldr: 83 } },

    // FlyQuest (88.2% WR — Champions, Split MVP: Inspired)
    { id: 4541, name: "Bwipo",     role: "TOP", team: "FLY",  year: 2025, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 88, tmf: 88, frm: 88, cmp: 87, map: 86, ldr: 88 } },
    { id: 4542, name: "Gakgos",    role: "TOP", team: "FLY",  year: 2025, rating: 80, quality: "Gold",     region: "LCS", stats: { mec: 81, tmf: 80, frm: 81, cmp: 77, map: 78, ldr: 75 } },
    { id: 4543, name: "Inspired",  role: "JNG", team: "FLY",  year: 2025, rating: 91, quality: "Diamond",  region: "LCS", stats: { mec: 90, tmf: 91, frm: 89, cmp: 90, map: 94, ldr: 88 } },
    { id: 4544, name: "Quad",      role: "MID", team: "FLY",  year: 2025, rating: 89, quality: "Platinum", region: "LCS", stats: { mec: 90, tmf: 88, frm: 90, cmp: 86, map: 87, ldr: 84 } },
    { id: 4545, name: "Massu",     role: "ADC", team: "FLY",  year: 2025, rating: 90, quality: "Diamond",  region: "LCS", stats: { mec: 91, tmf: 89, frm: 91, cmp: 87, map: 85, ldr: 82 } },
    { id: 4546, name: "Busio",     role: "SUP", team: "FLY",  year: 2025, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 82, tmf: 89, frm: 89, cmp: 87, map: 91, ldr: 88 } },

    // LYON (27.3% WR — 6th, South American squad)
    { id: 4551, name: "Bejjaniii", role: "TOP", team: "LYON", year: 2025, rating: 76, quality: "Silver",   region: "LCS", stats: { mec: 77, tmf: 75, frm: 77, cmp: 73, map: 74, ldr: 71 } },
    { id: 4552, name: "Srtty",     role: "TOP", team: "LYON", year: 2025, rating: 79, quality: "Silver",   region: "LCS", stats: { mec: 80, tmf: 78, frm: 80, cmp: 76, map: 77, ldr: 73 } },
    { id: 4553, name: "Oddielan",  role: "JNG", team: "LYON", year: 2025, rating: 78, quality: "Silver",   region: "LCS", stats: { mec: 79, tmf: 78, frm: 78, cmp: 74, map: 79, ldr: 74 } },
    { id: 4554, name: "Saint",     role: "MID", team: "LYON", year: 2025, rating: 79, quality: "Silver",   region: "LCS", stats: { mec: 80, tmf: 78, frm: 80, cmp: 77, map: 78, ldr: 74 } },
    { id: 4555, name: "Hena",      role: "ADC", team: "LYON", year: 2025, rating: 80, quality: "Gold",     region: "LCS", stats: { mec: 81, tmf: 79, frm: 81, cmp: 77, map: 76, ldr: 73 } },
    { id: 4556, name: "Lyonz",     role: "SUP", team: "LYON", year: 2025, rating: 77, quality: "Silver",   region: "LCS", stats: { mec: 72, tmf: 78, frm: 77, cmp: 76, map: 79, ldr: 75 } },

    // Shopify Rebellion (50% WR — 4th)
    { id: 4561, name: "Fudge",     role: "TOP", team: "SR",   year: 2025, rating: 83, quality: "Gold",     region: "LCS", stats: { mec: 84, tmf: 82, frm: 84, cmp: 82, map: 81, ldr: 80 } },
    { id: 4562, name: "Contractz", role: "JNG", team: "SR",   year: 2025, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 82, frm: 82, cmp: 80, map: 83, ldr: 80 } },
    { id: 4563, name: "Palafox",   role: "MID", team: "SR",   year: 2025, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 83, tmf: 81, frm: 83, cmp: 80, map: 80, ldr: 78 } },
    { id: 4564, name: "Bvoy",      role: "ADC", team: "SR",   year: 2025, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 86, tmf: 84, frm: 86, cmp: 82, map: 81, ldr: 79 } },
    { id: 4565, name: "Ceos",      role: "SUP", team: "SR",   year: 2025, rating: 83, quality: "Gold",     region: "LCS", stats: { mec: 78, tmf: 84, frm: 83, cmp: 82, map: 85, ldr: 82 } },

    // Team Liquid (23.1% WR — 7th)
    { id: 4571, name: "Impact",    role: "TOP", team: "TL",   year: 2025, rating: 80, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 80, frm: 81, cmp: 80, map: 79, ldr: 81 } },
    { id: 4572, name: "Yuuji",     role: "JNG", team: "TL",   year: 2025, rating: 79, quality: "Silver",   region: "LCS", stats: { mec: 79, tmf: 79, frm: 79, cmp: 76, map: 80, ldr: 75 } },
    { id: 4573, name: "APA",       role: "MID", team: "TL",   year: 2025, rating: 79, quality: "Silver",   region: "LCS", stats: { mec: 80, tmf: 78, frm: 80, cmp: 77, map: 78, ldr: 75 } },
    { id: 4574, name: "Yeon",      role: "ADC", team: "TL",   year: 2025, rating: 81, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 80, frm: 82, cmp: 78, map: 77, ldr: 74 } },
    { id: 4575, name: "CoreJJ",    role: "SUP", team: "TL",   year: 2025, rating: 84, quality: "Gold",     region: "LCS", stats: { mec: 79, tmf: 85, frm: 88, cmp: 87, map: 90, ldr: 88 } },

    // ==========================================
    // --- 2. 2024 SEASON ROSTERS (PLAYERS & COACH) ---
    // ==========================================
    { id: 801, name: "kkOma", role: "COACH", team: "T1", year: 2024, rating: 98, quality: "Master", region: "LCK", stats: { mec: 20, tmf: 95, frm: 98, cmp: 98, map: 99, ldr: 99 } },
    { id: 101, name: "Faker", role: "MID", team: "T1", year: 2024, rating: 93, quality: "Grandmaster", region: "LCK", stats: { mec: 90, tmf: 94, frm: 89, cmp: 94, map: 93, ldr: 94 } },
    { id: 102, name: "Zeus", role: "TOP", team: "T1", year: 2024, rating: 94, quality: "Master", region: "LCK", stats: { mec: 97, tmf: 92, frm: 95, cmp: 91, map: 85, ldr: 82 } },
    { id: 103, name: "Oner", role: "JNG", team: "T1", year: 2024, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 93, tmf: 90, frm: 88, cmp: 89, map: 91, ldr: 87 } },
    { id: 104, name: "Gumayusi", role: "ADC", team: "T1", year: 2024, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 94, tmf: 95, frm: 96, cmp: 98, map: 82, ldr: 84 } },
    { id: 105, name: "Keria", role: "SUP", team: "T1", year: 2024, rating: 94, quality: "Master", region: "LCK", stats: { mec: 86, tmf: 93, frm: 94, cmp: 96, map: 97, ldr: 91 } },
    
    { id: 111, name: "Kiin", role: "TOP", team: "Gen.G", year: 2024, rating: 95, quality: "Grandmaster", region: "LCK", stats: { mec: 94, tmf: 95, frm: 96, cmp: 93, map: 88, ldr: 89 } },
    { id: 112, name: "Canyon", role: "JNG", team: "Gen.G", year: 2024, rating: 96, quality: "Grandmaster", region: "LCK", stats: { mec: 96, tmf: 95, frm: 98, cmp: 94, map: 97, ldr: 90 } },
    { id: 113, name: "Chovy", role: "MID", team: "Gen.G", year: 2024, rating: 98, quality: "Challenger", region: "LCK", stats: { mec: 99, tmf: 96, frm: 99, cmp: 96, map: 92, ldr: 88 } },
    { id: 114, name: "Peyz", role: "ADC", team: "Gen.G", year: 2024, rating: 95, quality: "Grandmaster", region: "LCK", stats: { mec: 96, tmf: 97, frm: 94, cmp: 92, map: 85, ldr: 82 } },
    { id: 115, name: "Lehends", role: "SUP", team: "Gen.G", year: 2024, rating: 92, quality: "Master", region: "LCK", stats: { mec: 82, tmf: 93, frm: 94, cmp: 94, map: 95, ldr: 93 } },
    
    { id: 121, name: "Doran", role: "TOP", team: "HLE", year: 2024, rating: 89, quality: "Diamond", region: "LCK", stats: { mec: 90, tmf: 88, frm: 90, cmp: 84, map: 82, ldr: 85 } },
    { id: 122, name: "Peanut", role: "JNG", team: "HLE", year: 2024, rating: 92, quality: "Master", region: "LCK", stats: { mec: 86, tmf: 94, frm: 88, cmp: 93, map: 96, ldr: 95 } },
    { id: 123, name: "Zeka", role: "MID", team: "HLE", year: 2024, rating: 93, quality: "Master", region: "LCK", stats: { mec: 97, tmf: 92, frm: 93, cmp: 88, map: 86, ldr: 83 } },
    { id: 124, name: "Viper", role: "ADC", team: "HLE", year: 2024, rating: 94, quality: "Master", region: "LCK", stats: { mec: 96, tmf: 95, frm: 94, cmp: 91, map: 88, ldr: 86 } },
    { id: 125, name: "Delight", role: "SUP", team: "HLE", year: 2024, rating: 90, quality: "Diamond", region: "LCK", stats: { mec: 82, tmf: 93, frm: 90, cmp: 88, map: 91, ldr: 86 } },
    
    { id: 131, name: "Kingen", role: "TOP", team: "DK", year: 2024, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 86, tmf: 89, frm: 87, cmp: 85, map: 81, ldr: 84 } },
    { id: 132, name: "Lucid", role: "JNG", team: "DK", year: 2024, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 85, frm: 86, cmp: 83, map: 85, ldr: 81 } },
    { id: 133, name: "ShowMaker", role: "MID", team: "DK", year: 2024, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 93, tmf: 90, frm: 91, cmp: 92, map: 90, ldr: 91 } },
    { id: 134, name: "Aiming", role: "ADC", team: "DK", year: 2024, rating: 89, quality: "Diamond", region: "LCK", stats: { mec: 91, tmf: 88, frm: 90, cmp: 87, map: 82, ldr: 81 } },
    { id: 135, name: "Kellin", role: "SUP", team: "DK", year: 2024, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 82, tmf: 84, frm: 84, cmp: 85, map: 86, ldr: 82 } },
    
    { id: 141, name: "Clear", role: "TOP", team: "FOX", year: 2024, rating: 77, quality: "Silver", region: "LCK", stats: { mec: 78, tmf: 76, frm: 79, cmp: 74, map: 72, ldr: 70 } },
    { id: 142, name: "Willer", role: "JNG", team: "FOX", year: 2024, rating: 81, quality: "Gold", region: "LCK", stats: { mec: 82, tmf: 80, frm: 81, cmp: 78, map: 82, ldr: 77 } },
    { id: 143, name: "Clozer", role: "MID", team: "FOX", year: 2024, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 86, tmf: 81, frm: 83, cmp: 80, map: 77, ldr: 75 } },
    { id: 144, name: "Hena", role: "ADC", team: "FOX", year: 2024, rating: 78, quality: "Silver", region: "LCK", stats: { mec: 79, tmf: 78, frm: 80, cmp: 76, map: 73, ldr: 72 } },
    { id: 145, name: "Execute", role: "SUP", team: "FOX", year: 2024, rating: 76, quality: "Silver", region: "LCK", stats: { mec: 72, tmf: 75, frm: 75, cmp: 74, map: 76, ldr: 73 } },
    
    { id: 151, name: "PerfecT", role: "TOP", team: "KT", year: 2024, rating: 82, quality: "Gold", region: "LCK", stats: { mec: 84, tmf: 80, frm: 83, cmp: 79, map: 80, ldr: 75 } },
    { id: 152, name: "Pyosik", role: "JNG", team: "KT", year: 2024, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 87, tmf: 85, frm: 86, cmp: 84, map: 87, ldr: 83 } },
    { id: 153, name: "Bdd", role: "MID", team: "KT", year: 2024, rating: 89, quality: "Diamond", region: "LCK", stats: { mec: 88, tmf: 90, frm: 91, cmp: 89, map: 88, ldr: 87 } },
    { id: 154, name: "Deft", role: "ADC", team: "KT", year: 2024, rating: 88, quality: "Platinum", region: "LCK", stats: { mec: 87, tmf: 90, frm: 89, cmp: 88, map: 86, ldr: 91 } },
    { id: 155, name: "BeryL", role: "SUP", team: "KT", year: 2024, rating: 88, quality: "Platinum", region: "LCK", stats: { mec: 81, tmf: 89, frm: 93, cmp: 93, map: 94, ldr: 95 } },
    
    { id: 161, name: "DuDu", role: "TOP", team: "KDF", year: 2024, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 85, tmf: 81, frm: 84, cmp: 80, map: 81, ldr: 79 } },
    { id: 162, name: "Cuzz", role: "JNG", team: "KDF", year: 2024, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 84, tmf: 87, frm: 85, cmp: 85, map: 88, ldr: 86 } },
    { id: 163, name: "BullDog", role: "MID", team: "KDF", year: 2024, rating: 80, quality: "Gold", region: "LCK", stats: { mec: 82, tmf: 79, frm: 81, cmp: 78, map: 79, ldr: 76 } },
    { id: 164, name: "Bull", role: "ADC", team: "KDF", year: 2024, rating: 74, quality: "Silver", region: "LCK", stats: { mec: 76, tmf: 73, frm: 75, cmp: 72, map: 71, ldr: 70 } },
    { id: 165, name: "Andil", role: "SUP", team: "KDF", year: 2024, rating: 75, quality: "Silver", region: "LCK", stats: { mec: 75, tmf: 74, frm: 60, cmp: 73, map: 76, ldr: 72 } },
    
    { id: 201, name: "Bin", role: "TOP", team: "BLG", year: 2024, rating: 97, quality: "Challenger", region: "LPL", stats: { mec: 99, tmf: 95, frm: 96, cmp: 94, map: 89, ldr: 88 } },
    { id: 202, name: "Xun", role: "JNG", team: "BLG", year: 2024, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 91, tmf: 89, frm: 92, cmp: 88, map: 89, ldr: 87 } },
    { id: 203, name: "Knight", role: "MID", team: "BLG", year: 2024, rating: 97, quality: "Challenger", region: "LPL", stats: { mec: 98, tmf: 97, frm: 96, cmp: 95, map: 94, ldr: 90 } },
    { id: 204, name: "Elk", role: "ADC", team: "BLG", year: 2024, rating: 95, quality: "Grandmaster", region: "LPL", stats: { mec: 96, tmf: 95, frm: 95, cmp: 92, map: 88, ldr: 85 } },
    { id: 205, name: "ON", role: "SUP", team: "BLG", year: 2024, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 89, tmf: 90, frm: 89, cmp: 90, map: 91, ldr: 86 } },
    
    { id: 211, name: "Flandre", role: "TOP", team: "JDG", year: 2024, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 89, frm: 88, cmp: 90, map: 85, ldr: 88 } },
    { id: 212, name: "Kanavi", role: "JNG", team: "JDG", year: 2024, rating: 94, quality: "Master", region: "LPL", stats: { mec: 95, tmf: 93, frm: 96, cmp: 92, map: 94, ldr: 89 } },
    { id: 213, name: "Yagao", role: "MID", team: "JDG", year: 2024, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 88, tmf: 92, frm: 90, cmp: 89, map: 91, ldr: 90 } },
    { id: 214, name: "Ruler", role: "ADC", team: "JDG", year: 2024, rating: 95, quality: "Grandmaster", region: "LPL", stats: { mec: 96, tmf: 96, frm: 97, cmp: 94, map: 89, ldr: 90 } },
    { id: 215, name: "MISSING", role: "SUP", team: "JDG", year: 2024, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 85, tmf: 92, frm: 91, cmp: 90, map: 93, ldr: 90 } },
    
    { id: 221, name: "369", role: "TOP", team: "TES", year: 2024, rating: 93, quality: "Master", region: "LPL", stats: { mec: 91, tmf: 95, frm: 93, cmp: 92, map: 94, ldr: 90 } },
    { id: 222, name: "Tian", role: "JNG", team: "TES", year: 2024, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 88, tmf: 91, frm: 89, cmp: 90, map: 92, ldr: 91 } },
    { id: 223, name: "Creme", role: "MID", team: "TES", year: 2024, rating: 89, quality: "Diamond", region: "LPL", stats: { mec: 92, tmf: 88, frm: 90, cmp: 86, map: 85, ldr: 82 } },
    { id: 224, name: "JackeyLove", role: "ADC", team: "TES", year: 2024, rating: 94, quality: "Master", region: "LPL", stats: { mec: 96, tmf: 94, frm: 95, cmp: 92, map: 90, ldr: 93 } },
    { id: 225, name: "Meiko", role: "SUP", team: "TES", year: 2024, rating: 92, quality: "Master", region: "LPL", stats: { mec: 88, tmf: 93, frm: 80, cmp: 92, map: 95, ldr: 96 } },
    
    { id: 231, name: "shanji", role: "TOP", team: "NIP", year: 2024, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 85, tmf: 83, frm: 84, cmp: 82, map: 81, ldr: 80 } },
    { id: 232, name: "AKi", role: "JNG", team: "NIP", year: 2024, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 81, tmf: 83, frm: 82, cmp: 80, map: 83, ldr: 81 } },
    { id: 233, name: "Rookie", role: "MID", team: "NIP", year: 2024, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 90, tmf: 87, frm: 88, cmp: 89, map: 86, ldr: 90 } },
    { id: 234, name: "Photic", role: "ADC", team: "NIP", year: 2024, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 84, frm: 85, cmp: 83, map: 82, ldr: 80 } },
    { id: 235, name: "Zhuo", role: "SUP", team: "NIP", year: 2024, rating: 80, quality: "Gold", region: "LPL", stats: { mec: 80, tmf: 81, frm: 65, cmp: 79, map: 81, ldr: 78 } },
   
    { id: 241, name: "Breathe", role: "TOP", team: "WBG", year: 2024, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 85, frm: 88, cmp: 85, map: 84, ldr: 82 } },
    { id: 242, name: "Tarzan", role: "JNG", team: "WBG", year: 2024, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 89, tmf: 92, frm: 90, cmp: 91, map: 93, ldr: 89 } },
    { id: 243, name: "Xiaohu", role: "MID", team: "WBG", year: 2024, rating: 89, quality: "Diamond", region: "LPL", stats: { mec: 87, tmf: 90, frm: 89, cmp: 91, map: 90, ldr: 92 } },
    { id: 244, name: "Light", role: "ADC", team: "WBG", year: 2024, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 87, frm: 89, cmp: 85, map: 84, ldr: 83 } },
    { id: 245, name: "Crisp", role: "SUP", team: "WBG", year: 2024, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 89, frm: 75, cmp: 88, map: 90, ldr: 89 } },
   
    { id: 301, name: "BrokenBlade", role: "TOP", team: "G2", year: 2024, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 85, tmf: 89, frm: 86, cmp: 88, map: 84, ldr: 88 } },
    { id: 302, name: "Yike", role: "JNG", team: "G2", year: 2024, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 86, frm: 87, cmp: 85, map: 86, ldr: 82 } },
    { id: 303, name: "Caps", role: "MID", team: "G2", year: 2024, rating: 95, quality: "Grandmaster", region: "LEC", stats: { mec: 95, tmf: 96, frm: 94, cmp: 97, map: 95, ldr: 96 } },
    { id: 304, name: "Hans Sama", role: "ADC", team: "G2", year: 2024, rating: 90, quality: "Diamond", region: "LEC", stats: { mec: 91, tmf: 89, frm: 91, cmp: 88, map: 85, ldr: 84 } },
    { id: 305, name: "Mikyx", role: "SUP", team: "G2", year: 2024, rating: 94, quality: "Master", region: "LEC", stats: { mec: 87, tmf: 94, frm: 94, cmp: 95, map: 96, ldr: 96 } },
   
    { id: 311, name: "Oscarinin", role: "TOP", team: "FNC", year: 2024, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 86, tmf: 83, frm: 85, cmp: 82, map: 81, ldr: 79 } },
    { id: 312, name: "Razork", role: "JNG", team: "FNC", year: 2024, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 89, frm: 86, cmp: 87, map: 88, ldr: 90 } },
    { id: 313, name: "Humanoid", role: "MID", team: "FNC", year: 2024, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 86, frm: 88, cmp: 86, map: 85, ldr: 84 } },
    { id: 314, name: "Noah", role: "ADC", team: "FNC", year: 2024, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 84, frm: 86, cmp: 83, map: 82, ldr: 80 } },
    { id: 315, name: "Jun", role: "SUP", team: "FNC", year: 2024, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 85, frm: 74, cmp: 86, map: 85, ldr: 83 } },
    
    { id: 321, name: "Myrwn", role: "TOP", team: "MAD", year: 2024, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 80, frm: 82, cmp: 85, map: 79, ldr: 78 } },
    { id: 322, name: "Elyoya", role: "JNG", team: "MAD", year: 2024, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 85, tmf: 87, frm: 85, cmp: 86, map: 88, ldr: 91 } },
    { id: 323, name: "Fresskowy", role: "MID", team: "MAD", year: 2024, rating: 78, quality: "Silver", region: "LEC", stats: { mec: 80, tmf: 77, frm: 79, cmp: 76, map: 77, ldr: 75 } },
    { id: 324, name: "Supa", role: "ADC", team: "MAD", year: 2024, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 84, tmf: 81, frm: 83, cmp: 80, map: 79, ldr: 80 } },
    { id: 325, name: "Alvaro", role: "SUP", team: "MAD", year: 2024, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 84, frm: 70, cmp: 82, map: 83, ldr: 81 } },
    
    { id: 331, name: "Photon", role: "TOP", team: "VIT", year: 2024, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 86, tmf: 82, frm: 84, cmp: 81, map: 80, ldr: 78 } },
    { id: 332, name: "Lyncas", role: "JNG", team: "VIT", year: 2024, rating: 79, quality: "Silver", region: "LEC", stats: { mec: 80, tmf: 78, frm: 79, cmp: 77, map: 80, ldr: 76 } },
    { id: 333, name: "Vetheo", role: "MID", team: "VIT", year: 2024, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 85, tmf: 81, frm: 83, cmp: 80, map: 79, ldr: 77 } },
    { id: 334, name: "Carzzy", role: "ADC", team: "VIT", year: 2024, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 86, tmf: 85, frm: 86, cmp: 83, map: 82, ldr: 84 } },
    { id: 335, name: "Hylissang", role: "SUP", team: "VIT", year: 2024, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 82, frm: 65, cmp: 80, map: 83, ldr: 85 } },
    
    { id: 341, name: "Wunder", role: "TOP", team: "TH", year: 2024, rating: 80, quality: "Gold", region: "LEC", stats: { mec: 82, tmf: 83, frm: 84, cmp: 85, map: 83, ldr: 84 } },
    { id: 342, name: "Jankos", role: "JNG", team: "TH", year: 2024, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 81, tmf: 85, frm: 82, cmp: 84, map: 88, ldr: 89 } },
    { id: 343, name: "Zwyroo", role: "MID", team: "TH", year: 2024, rating: 75, quality: "Silver", region: "LEC", stats: { mec: 79, tmf: 78, frm: 80, cmp: 76, map: 77, ldr: 75 } },
    { id: 344, name: "Flakked", role: "ADC", team: "TH", year: 2024, rating: 79, quality: "Silver", region: "LEC", stats: { mec: 83, tmf: 81, frm: 84, cmp: 80, map: 78, ldr: 77 } },
    { id: 345, name: "Trymbi", role: "SUP", team: "TH", year: 2024, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 77, tmf: 84, frm: 84, cmp: 82, map: 86, ldr: 85 } },
    
    { id: 401, name: "Impact", role: "TOP", team: "TL", year: 2024, rating: 86, quality: "Platinum", region: "LCS", stats: { mec: 82, tmf: 89, frm: 86, cmp: 88, map: 86, ldr: 94 } },
    { id: 402, name: "UmTi", role: "JNG", team: "TL", year: 2024, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 83, tmf: 86, frm: 84, cmp: 85, map: 88, ldr: 87 } },
    { id: 403, name: "Apa", role: "MID", team: "TL", year: 2024, rating: 79, quality: "Silver", region: "LCS", stats: { mec: 80, tmf: 79, frm: 80, cmp: 76, map: 75, ldr: 74 } },
    { id: 404, name: "Yeon", role: "ADC", team: "TL", year: 2024, rating: 79, quality: "Silver", region: "LCS", stats: { mec: 81, tmf: 78, frm: 81, cmp: 77, map: 74, ldr: 72 } },
    { id: 405, name: "CoreJJ", role: "SUP", team: "TL", year: 2024, rating: 89, quality: "Diamond", region: "LCS", stats: { mec: 80, tmf: 90, frm: 93, cmp: 91, map: 93, ldr: 96 } },
   
    { id: 411, name: "Bwipo", role: "TOP", team: "FLY", year: 2024, rating: 84, quality: "Gold", region: "LCS", stats: { mec: 83, tmf: 85, frm: 84, cmp: 88, map: 83, ldr: 86 } },
    { id: 412, name: "Inspired", role: "JNG", team: "FLY", year: 2024, rating: 84, quality: "Gold", region: "LCS", stats: { mec: 87, tmf: 88, frm: 89, cmp: 87, map: 90, ldr: 89 } },
    { id: 413, name: "Quad", role: "MID", team: "FLY", year: 2024, rating: 84, quality: "Gold", region: "LCS", stats: { mec: 86, tmf: 83, frm: 85, cmp: 82, map: 82, ldr: 80 } },
    { id: 414, name: "Massu", role: "ADC", team: "FLY", year: 2024, rating: 82, quality: "Gold", region: "LCS", stats: { mec: 84, tmf: 81, frm: 83, cmp: 80, map: 79, ldr: 78 } },
    { id: 415, name: "Busio", role: "SUP", team: "FLY", year: 2024, rating: 83, quality: "Gold", region: "LCS", stats: { mec: 83, tmf: 84, frm: 65, cmp: 82, map: 83, ldr: 81 } },
    
    { id: 421, name: "Dhokla", role: "TOP", team: "NRG", year: 2024, rating: 76, quality: "Silver", region: "LCS", stats: { mec: 77, tmf: 76, frm: 77, cmp: 75, map: 74, ldr: 75 } },
    { id: 422, name: "Contractz", role: "JNG", team: "NRG", year: 2024, rating: 79, quality: "Silver", region: "LCS", stats: { mec: 80, tmf: 79, frm: 78, cmp: 77, map: 81, ldr: 82 } },
    { id: 423, name: "Palafox", role: "MID", team: "NRG", year: 2024, rating: 78, quality: "Silver", region: "LCS", stats: { mec: 80, tmf: 78, frm: 79, cmp: 76, map: 77, ldr: 76 } },
    { id: 424, name: "FBI", role: "ADC", team: "NRG", year: 2024, rating: 81, quality: "Gold", region: "LCS", stats: { mec: 83, tmf: 81, frm: 82, cmp: 79, map: 80, ldr: 81 } },
    { id: 425, name: "huhi", role: "SUP", team: "NRG", year: 2024, rating: 80, quality: "Gold", region: "LCS", stats: { mec: 78, tmf: 81, frm: 65, cmp: 80, map: 82, ldr: 84 } },
   
    { id: 431, name: "Fudge", role: "TOP", team: "C9", year: 2024, rating: 82, quality: "Gold", region: "LCS", stats: { mec: 83, tmf: 81, frm: 84, cmp: 80, map: 80, ldr: 79 } },
    { id: 432, name: "Blaber", role: "JNG", team: "C9", year: 2024, rating: 86, quality: "Platinum", region: "LCS", stats: { mec: 87, tmf: 85, frm: 86, cmp: 85, map: 87, ldr: 88 } },
    { id: 433, name: "Jojopyun", role: "MID", team: "C9", year: 2024, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 88, tmf: 84, frm: 85, cmp: 83, map: 82, ldr: 83 } },
    { id: 434, name: "Berserker", role: "ADC", team: "C9", year: 2024, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 91, tmf: 88, frm: 90, cmp: 85, map: 84, ldr: 82 } },
    { id: 435, name: "Vulcan", role: "SUP", team: "C9", year: 2024, rating: 83, quality: "Gold", region: "LCS", stats: { mec: 83, tmf: 84, frm: 65, cmp: 82, map: 84, ldr: 84 } },
   
    { id: 441, name: "Sniper", role: "TOP", team: "100T", year: 2024, rating: 76, quality: "Silver", region: "LCS", stats: { mec: 80, tmf: 74, frm: 77, cmp: 73, map: 72, ldr: 70 } },
    { id: 442, name: "River", role: "JNG", team: "100T", year: 2024, rating: 83, quality: "Gold", region: "LCS", stats: { mec: 83, tmf: 83, frm: 82, cmp: 84, map: 85, ldr: 82 } },
    { id: 443, name: "Quid", role: "MID", team: "100T", year: 2024, rating: 81, quality: "Gold", region: "LCS", stats: { mec: 84, tmf: 80, frm: 82, cmp: 79, map: 78, ldr: 77 } },
    { id: 444, name: "Meech", role: "ADC", team: "100T", year: 2024, rating: 72, quality: "Silver", region: "LCS", stats: { mec: 74, tmf: 71, frm: 74, cmp: 70, map: 69, ldr: 68 } },
    { id: 445, name: "Eyla", role: "SUP", team: "100T", year: 2024, rating: 74, quality: "Silver", region: "LCS", stats: { mec: 73, tmf: 75, frm: 60, cmp: 74, map: 76, ldr: 72 } },
    
    { id: 451, name: "Rich", role: "TOP", team: "DIG", year: 2024, rating: 77, quality: "Silver", region: "LCS", stats: { mec: 79, tmf: 76, frm: 78, cmp: 75, map: 74, ldr: 73 } },
    { id: 452, name: "Spica", role: "JNG", team: "DIG", year: 2024, rating: 81, quality: "Gold", region: "LCS", stats: { mec: 82, tmf: 81, frm: 82, cmp: 80, map: 83, ldr: 82 } },
    { id: 453, name: "Dove", role: "MID", team: "DIG", year: 2024, rating: 76, quality: "Silver", region: "LCS", stats: { mec: 78, tmf: 76, frm: 78, cmp: 75, map: 75, ldr: 74 } },
    { id: 454, name: "Zven", role: "ADC", team: "DIG", year: 2024, rating: 82, quality: "Gold", region: "LCS", stats: { mec: 83, tmf: 83, frm: 84, cmp: 81, map: 80, ldr: 84 } },
    { id: 455, name: "Isles", role: "SUP", team: "DIG", year: 2024, rating: 73, quality: "Silver", region: "LCS", stats: { mec: 72, tmf: 74, frm: 55, cmp: 73, map: 75, ldr: 71 } },

    // ==========================================
    // --- 3. WORLD CHAMPIONS (Legacy Wildcards) ---
    // ==========================================
    { id: 9001, name: "Faker", role: "MID", team: "SKT", year: 2015, rating: 98, quality: "Champion", region: "Legacy", stats: { mec: 98, tmf: 97, frm: 97, cmp: 98, map: 97, ldr: 95 } },
    { id: 9002, name: "MaRin", role: "TOP", team: "SKT", year: 2015, rating: 96, quality: "Champion", region: "Legacy", stats: { mec: 96, tmf: 96, frm: 97, cmp: 94, map: 95, ldr: 97 } },
    { id: 9003, name: "Bang", role: "ADC", team: "SKT", year: 2015, rating: 95, quality: "Champion", region: "Legacy", stats: { mec: 95, tmf: 97, frm: 96, cmp: 98, map: 89, ldr: 88 } },
    { id: 9004, name: "Wolf", role: "SUP", team: "SKT", year: 2015, rating: 96, quality: "Champion", region: "Legacy", stats: { mec: 83, tmf: 97, frm: 96, cmp: 96, map: 97, ldr: 95 } },
    { id: 9005, name: "Bengi", role: "JNG", team: "SKT", year: 2015, rating: 94, quality: "Champion", region: "Legacy", stats: { mec: 86, tmf: 96, frm: 88, cmp: 98, map: 99, ldr: 95 } },
    { id: 9042, name: "Easyhoon", role: "MID", team: "SKT", year: 2015, rating: 92, quality: "Champion", region: "Legacy", stats: { mec: 85, tmf: 90, frm: 80, cmp: 99, map: 99, ldr: 91 } },
    { id: 9006, name: "kkOma", role: "COACH", team: "SKT", year: 2015, rating: 98, quality: "Champion", region: "Legacy", stats: { mec: 70, tmf: 96, frm: 97, cmp: 92, map: 99, ldr: 99 } },

    { id: 9043, name: "Duke", role: "TOP", team: "SKT", year: 2016, rating: 97, quality: "Champion", region: "Legacy", stats: { mec: 97, tmf: 94, frm: 97, cmp: 95, map: 90, ldr: 90 } },
    { id: 9044, name: "Bengi", role: "JNG", team: "SKT", year: 2016, rating: 99, quality: "Champion", region: "Legacy", stats: { mec: 99, tmf: 91, frm: 98, cmp: 92, map: 99, ldr: 92 } },
    { id: 9045, name: "Blank", role: "JNG", team: "SKT", year: 2016, rating: 98, quality: "Champion", region: "Legacy", stats: { mec: 95, tmf: 97, frm: 97, cmp: 92, map: 98, ldr: 90 } },
    { id: 9046, name: "Faker", role: "MID", team: "SKT", year: 2016, rating: 99, quality: "Champion", region: "Legacy", stats: { mec: 96, tmf: 98, frm: 99, cmp: 99, map: 97, ldr: 86 } },
    { id: 9047, name: "Bang", role: "ADC", team: "SKT", year: 2016, rating: 97, quality: "Champion", region: "Legacy", stats: { mec: 98, tmf: 99, frm: 97, cmp: 98, map: 91, ldr: 85 } },
    { id: 9048, name: "Wolf", role: "SUP", team: "SKT", year: 2016, rating: 98, quality: "Champion", region: "Legacy", stats: { mec: 90, tmf: 98, frm: 98, cmp: 98, map: 98, ldr: 97 } },
    
    { id: 9007, name: "TheShy", role: "TOP", team: "IG", year: 2018, rating: 97, quality: "Champion", region: "Legacy", stats: { mec: 99, tmf: 95, frm: 97, cmp: 94, map: 88, ldr: 85 } },
    { id: 9008, name: "Rookie", role: "MID", team: "IG", year: 2018, rating: 97, quality: "Champion", region: "Legacy", stats: { mec: 99, tmf: 96, frm: 97, cmp: 95, map: 94, ldr: 94 } },
    { id: 9009, name: "Ning", role: "JNG", team: "IG", year: 2018, rating: 94, quality: "Champion", region: "Legacy", stats: { mec: 95, tmf: 94, frm: 92, cmp: 90, map: 94, ldr: 89 } },
    { id: 9010, name: "JackeyLove", role: "ADC", team: "IG", year: 2018, rating: 95, quality: "Champion", region: "Legacy", stats: { mec: 97, tmf: 96, frm: 95, cmp: 92, map: 89, ldr: 88 } },
    { id: 9011, name: "Baolan", role: "SUP", team: "IG", year: 2018, rating: 92, quality: "Champion", region: "Legacy", stats: { mec: 82, tmf: 95, frm: 92, cmp: 92, map: 92, ldr: 90 } },
    
    { id: 9012, name: "Mata", role: "SUP", team: "SSW", year: 2014, rating: 98, quality: "Champion", region: "Legacy", stats: { mec: 88, tmf: 98, frm: 99, cmp: 99, map: 100, ldr: 99 } },
    { id: 9013, name: "Looper", role: "TOP", team: "SSW", year: 2014, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 92, tmf: 94, frm: 91, cmp: 95, map: 94, ldr: 90 } },
    { id: 9014, name: "DanDy", role: "JNG", team: "SSW", year: 2014, rating: 96, quality: "Champion", region: "Legacy", stats: { mec: 96, tmf: 97, frm: 95, cmp: 95, map: 98, ldr: 94 } },
    { id: 9015, name: "PawN", role: "MID", team: "SSW", year: 2014, rating: 94, quality: "Champion", region: "Legacy", stats: { mec: 95, tmf: 94, frm: 93, cmp: 95, map: 92, ldr: 91 } },
    { id: 9016, name: "imp", role: "ADC", team: "SSW", year: 2014, rating: 95, quality: "Champion", region: "Legacy", stats: { mec: 97, tmf: 95, frm: 95, cmp: 94, map: 90, ldr: 89 } },
    
    { id: 9017, name: "Ambition", role: "JNG", team: "SSG", year: 2017, rating: 94, quality: "Champion", region: "Legacy", stats: { mec: 88, tmf: 95, frm: 92, cmp: 93, map: 98, ldr: 99 } },
    { id: 9018, name: "CuVee", role: "TOP", team: "SSG", year: 2017, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 94, tmf: 94, frm: 95, cmp: 95, map: 89, ldr: 88 } },
    { id: 9019, name: "Crown", role: "MID", team: "SSG", year: 2017, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 92, tmf: 95, frm: 96, cmp: 96, map: 92, ldr: 90 } },
    { id: 9020, name: "Ruler", role: "ADC", team: "SSG", year: 2017, rating: 96, quality: "Champion", region: "Legacy", stats: { mec: 97, tmf: 98, frm: 97, cmp: 96, map: 91, ldr: 92 } },
    { id: 9021, name: "CoreJJ", role: "SUP", team: "SSG", year: 2017, rating: 95, quality: "Champion", region: "Legacy", stats: { mec: 82, tmf: 96, frm: 96, cmp: 96, map: 97, ldr: 95 } },
    
    { id: 9022, name: "ShowMaker", role: "MID", team: "DK", year: 2020, rating: 98, quality: "Champion", region: "Legacy", stats: { mec: 98, tmf: 97, frm: 98, cmp: 97, map: 96, ldr: 96 } },
    { id: 9023, name: "Canyon", role: "JNG", team: "DK", year: 2020, rating: 98, quality: "Champion", region: "Legacy", stats: { mec: 99, tmf: 98, frm: 99, cmp: 96, map: 99, ldr: 94 } },
    { id: 9024, name: "Nuguri", role: "TOP", team: "DK", year: 2020, rating: 97, quality: "Champion", region: "Legacy", stats: { mec: 99, tmf: 96, frm: 98, cmp: 92, map: 90, ldr: 88 } },
    { id: 9025, name: "Ghost", role: "ADC", team: "DK", year: 2020, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 90, tmf: 96, frm: 94, cmp: 98, map: 94, ldr: 92 } },
    { id: 9026, name: "BeryL", role: "SUP", team: "DK", year: 2020, rating: 96, quality: "Champion", region: "Legacy", stats: { mec: 82, tmf: 96, frm: 98, cmp: 97, map: 100, ldr: 98 } },
    
    { id: 9027, name: "Doinb", role: "MID", team: "FPX", year: 2019, rating: 96, quality: "Champion", region: "Legacy", stats: { mec: 89, tmf: 98, frm: 94, cmp: 99, map: 99, ldr: 99 } },
    { id: 9028, name: "Tian", role: "JNG", team: "FPX", year: 2019, rating: 95, quality: "Champion", region: "Legacy", stats: { mec: 96, tmf: 95, frm: 94, cmp: 94, map: 96, ldr: 91 } },
    { id: 9029, name: "Crisp", role: "SUP", team: "FPX", year: 2019, rating: 94, quality: "Champion", region: "Legacy", stats: { mec: 85, tmf: 94, frm: 94, cmp: 95, map: 95, ldr: 92 } },
    { id: 9030, name: "Lwx", role: "ADC", team: "FPX", year: 2019, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 94, tmf: 94, frm: 95, cmp: 91, map: 92, ldr: 89 } },
    { id: 9031, name: "GimGoon", role: "TOP", team: "FPX", year: 2019, rating: 91, quality: "Champion", region: "Legacy", stats: { mec: 88, tmf: 93, frm: 92, cmp: 90, map: 91, ldr: 92 } },
    
    { id: 9032, name: "Flandre", role: "TOP", team: "EDG", year: 2021, rating: 92, quality: "Champion", region: "Legacy", stats: { mec: 90, tmf: 93, frm: 92, cmp: 95, map: 91, ldr: 91 } },
    { id: 9033, name: "Jiejie", role: "JNG", team: "EDG", year: 2021, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 93, tmf: 94, frm: 92, cmp: 91, map: 94, ldr: 90 } },
    { id: 9034, name: "Scout", role: "MID", team: "EDG", year: 2021, rating: 95, quality: "Champion", region: "Legacy", stats: { mec: 96, tmf: 95, frm: 96, cmp: 94, map: 95, ldr: 94 } },
    { id: 9035, name: "Viper", role: "ADC", team: "EDG", year: 2021, rating: 96, quality: "Champion", region: "Legacy", stats: { mec: 98, tmf: 97, frm: 97, cmp: 95, map: 94, ldr: 93 } },
    { id: 9036, name: "Meiko", role: "SUP", team: "EDG", year: 2021, rating: 97, quality: "Champion", region: "Legacy", stats: { mec: 87, tmf: 98, frm: 98, cmp: 98, map: 98, ldr: 99 } },
   
    { id: 9037, name: "Kingen", role: "TOP", team: "DRX", year: 2022, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 94, tmf: 94, frm: 91, cmp: 90, map: 90, ldr: 89 } },
    { id: 9038, name: "Pyosik", role: "JNG", team: "DRX", year: 2022, rating: 92, quality: "Champion", region: "Legacy", stats: { mec: 93, tmf: 92, frm: 90, cmp: 92, map: 91, ldr: 91 } },
    { id: 9039, name: "Zeka", role: "MID", team: "DRX", year: 2022, rating: 94, quality: "Champion", region: "Legacy", stats: { mec: 98, tmf: 93, frm: 93, cmp: 90, map: 91, ldr: 88 } },
    { id: 9040, name: "Deft", role: "ADC", team: "DRX", year: 2022, rating: 95, quality: "Champion", region: "Legacy", stats: { mec: 94, tmf: 96, frm: 95, cmp: 95, map: 94, ldr: 97 } },
    { id: 9041, name: "BeryL",    role: "SUP", team: "DRX", year: 2022, rating: 96, quality: "Champion", region: "Legacy", stats: { mec: 81, tmf: 95, frm: 98, cmp: 99, map: 100, ldr: 99 } },

    // T1 2025 — World Champions
    { id: 9049, name: "Doran",    role: "TOP", team: "T1",  year: 2025, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 93, tmf: 90, frm: 92, cmp: 88, map: 87, ldr: 89 } },
    { id: 9050, name: "Oner",     role: "JNG", team: "T1",  year: 2025, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 94, tmf: 92, frm: 90, cmp: 90, map: 94, ldr: 89 } },
    { id: 9051, name: "Faker",    role: "MID", team: "T1",  year: 2025, rating: 98, quality: "Champion", region: "Legacy", stats: { mec: 94, tmf: 98, frm: 93, cmp: 99, map: 98, ldr: 99 } },
    { id: 9052, name: "Gumayusi",role: "ADC", team: "T1",  year: 2025, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 95, tmf: 93, frm: 94, cmp: 91, map: 84, ldr: 86 } },
    { id: 9053, name: "Keria",    role: "SUP", team: "T1",  year: 2025, rating: 97, quality: "Champion", region: "Legacy", stats: { mec: 87, tmf: 96, frm: 97, cmp: 98, map: 99, ldr: 94 } },

    // T1 2023 — World Champions (3-peat)
    { id: 9054, name: "Zeus",     role: "TOP", team: "T1",  year: 2023, rating: 95, quality: "Champion", region: "Legacy", stats: { mec: 95, tmf: 93, frm: 95, cmp: 91, map: 90, ldr: 90 } },
    { id: 9055, name: "Oner",     role: "JNG", team: "T1",  year: 2023, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 94, tmf: 92, frm: 91, cmp: 90, map: 95, ldr: 90 } },
    { id: 9056, name: "Faker",    role: "MID", team: "T1",  year: 2023, rating: 98, quality: "Champion", region: "Legacy", stats: { mec: 95, tmf: 98, frm: 94, cmp: 99, map: 98, ldr: 99 } },
    { id: 9057, name: "Gumayusi",role: "ADC", team: "T1",  year: 2023, rating: 92, quality: "Champion", region: "Legacy", stats: { mec: 94, tmf: 92, frm: 93, cmp: 90, map: 83, ldr: 85 } },
    { id: 9058, name: "Keria",    role: "SUP", team: "T1",  year: 2023, rating: 98, quality: "Champion", region: "Legacy", stats: { mec: 88, tmf: 97, frm: 98, cmp: 99, map: 100, ldr: 95 } },

    // T1 2024 — World Champions (4-peat)
    { id: 9059, name: "Zeus",     role: "TOP", team: "T1",  year: 2024, rating: 96, quality: "Champion", region: "Legacy", stats: { mec: 96, tmf: 94, frm: 96, cmp: 92, map: 91, ldr: 91 } },
    { id: 9060, name: "Oner",     role: "JNG", team: "T1",  year: 2024, rating: 94, quality: "Champion", region: "Legacy", stats: { mec: 95, tmf: 93, frm: 92, cmp: 91, map: 96, ldr: 91 } },
    { id: 9061, name: "Faker",    role: "MID", team: "T1",  year: 2024, rating: 94, quality: "Champion", region: "Legacy", stats: { mec: 91, tmf: 95, frm: 90, cmp: 96, map: 94, ldr: 96 } },
    { id: 9062, name: "Gumayusi",role: "ADC", team: "T1",  year: 2024, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 95, tmf: 93, frm: 94, cmp: 91, map: 84, ldr: 86 } },
    { id: 9063, name: "Keria",    role: "SUP", team: "T1",  year: 2024, rating: 97, quality: "Champion", region: "Legacy", stats: { mec: 87, tmf: 96, frm: 97, cmp: 98, map: 99, ldr: 94 } },

    // Fnatic 2011 — World Champions (inaugural)
    { id: 9064, name: "xPeke",       role: "TOP", team: "FNC", year: 2011, rating: 88, quality: "Champion", region: "Legacy", stats: { mec: 88, tmf: 87, frm: 88, cmp: 86, map: 83, ldr: 85 } },
    { id: 9065, name: "Cyanide",     role: "JNG", team: "FNC", year: 2011, rating: 87, quality: "Champion", region: "Legacy", stats: { mec: 85, tmf: 87, frm: 85, cmp: 84, map: 88, ldr: 83 } },
    { id: 9066, name: "Shushei",     role: "MID", team: "FNC", year: 2011, rating: 89, quality: "Champion", region: "Legacy", stats: { mec: 87, tmf: 88, frm: 88, cmp: 90, map: 87, ldr: 88 } },
    { id: 9067, name: "LamiaZealot", role: "ADC", team: "FNC", year: 2011, rating: 86, quality: "Champion", region: "Legacy", stats: { mec: 85, tmf: 85, frm: 86, cmp: 83, map: 82, ldr: 80 } },
    { id: 9068, name: "Mellisan",    role: "SUP", team: "FNC", year: 2011, rating: 85, quality: "Champion", region: "Legacy", stats: { mec: 72, tmf: 85, frm: 84, cmp: 83, map: 85, ldr: 84 } },

    // Taipei Assassins 2012 — World Champions
    { id: 9069, name: "Stanley",  role: "TOP", team: "TPA", year: 2012, rating: 90, quality: "Champion", region: "Legacy", stats: { mec: 88, tmf: 90, frm: 90, cmp: 91, map: 89, ldr: 88 } },
    { id: 9070, name: "lilballz", role: "JNG", team: "TPA", year: 2012, rating: 89, quality: "Champion", region: "Legacy", stats: { mec: 86, tmf: 89, frm: 86, cmp: 87, map: 90, ldr: 85 } },
    { id: 9071, name: "Toyz",     role: "MID", team: "TPA", year: 2012, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 91, tmf: 91, frm: 92, cmp: 94, map: 93, ldr: 90 } },
    { id: 9072, name: "Bebe",     role: "ADC", team: "TPA", year: 2012, rating: 90, quality: "Champion", region: "Legacy", stats: { mec: 88, tmf: 89, frm: 90, cmp: 87, map: 85, ldr: 84 } },
    { id: 9073, name: "MiSTakE",  role: "SUP", team: "TPA", year: 2012, rating: 88, quality: "Champion", region: "Legacy", stats: { mec: 75, tmf: 88, frm: 87, cmp: 87, map: 88, ldr: 86 } },

    // SK Telecom T1 K 2013 — World Champions (Faker's debut)
    { id: 9074, name: "Impact",    role: "TOP", team: "SKT", year: 2013, rating: 92, quality: "Champion", region: "Legacy", stats: { mec: 92, tmf: 92, frm: 91, cmp: 90, map: 87, ldr: 88 } },
    { id: 9075, name: "Bengi",     role: "JNG", team: "SKT", year: 2013, rating: 93, quality: "Champion", region: "Legacy", stats: { mec: 88, tmf: 94, frm: 88, cmp: 94, map: 95, ldr: 93 } },
    { id: 9076, name: "Faker",     role: "MID", team: "SKT", year: 2013, rating: 97, quality: "Champion", region: "Legacy", stats: { mec: 97, tmf: 96, frm: 95, cmp: 97, map: 97, ldr: 97 } },
    { id: 9077, name: "Piglet",    role: "ADC", team: "SKT", year: 2013, rating: 94, quality: "Champion", region: "Legacy", stats: { mec: 94, tmf: 93, frm: 95, cmp: 91, map: 89, ldr: 88 } },
    { id: 9078, name: "PoohManDu", role: "SUP", team: "SKT", year: 2013, rating: 91, quality: "Champion", region: "Legacy", stats: { mec: 80, tmf: 92, frm: 91, cmp: 92, map: 91, ldr: 90 } },

    // ==========================================
    // --- 4. FINALISTS (Worlds Runner-Up) ---
    // ==========================================

    // KT Rolster 2025 — Worlds Finalist
    { id: 9101, name: "PerfecT", role: "TOP", team: "KT",  year: 2025, rating: 93, quality: "Finalist", region: "Legacy", stats: { mec: 93, tmf: 92, frm: 93, cmp: 90, map: 88, ldr: 89 } },
    { id: 9102, name: "Cuzz",    role: "JNG", team: "KT",  year: 2025, rating: 93, quality: "Finalist", region: "Legacy", stats: { mec: 95, tmf: 92, frm: 93, cmp: 89, map: 95, ldr: 89 } },
    { id: 9103, name: "Bdd",     role: "MID", team: "KT",  year: 2025, rating: 97, quality: "Finalist", region: "Legacy", stats: { mec: 97, tmf: 98, frm: 98, cmp: 94, map: 96, ldr: 97 } },
    { id: 9104, name: "deokdam", role: "ADC", team: "KT",  year: 2025, rating: 91, quality: "Finalist", region: "Legacy", stats: { mec: 93, tmf: 90, frm: 93, cmp: 88, map: 85, ldr: 85 } },
    { id: 9105, name: "Peter",   role: "SUP", team: "KT",  year: 2025, rating: 90, quality: "Finalist", region: "Legacy", stats: { mec: 82, tmf: 95, frm: 89, cmp: 89, map: 91, ldr: 80 } },
    { id: 9106, name: "Score",   role: "COACH", team: "KT",year: 2025, rating: 88, quality: "Finalist", region: "Legacy", stats: { mec: 25, tmf: 87, frm: 88, cmp: 87, map: 89, ldr: 89 } },

    // ==========================================
    // --- 5. MSI WINNERS ---
    // ==========================================

    // Gen.G 2025 — MSI Champions
    { id: 9201, name: "Kiin",   role: "TOP", team: "Gen.G", year: 2025, rating: 96, quality: "MSI", region: "Legacy", stats: { mec: 96, tmf: 96, frm: 97, cmp: 95, map: 90, ldr: 91 } },
    { id: 9202, name: "Canyon", role: "JNG", team: "Gen.G", year: 2025, rating: 98, quality: "MSI", region: "Legacy", stats: { mec: 98, tmf: 97, frm: 99, cmp: 96, map: 98, ldr: 93 } },
    { id: 9203, name: "Chovy",  role: "MID", team: "Gen.G", year: 2025, rating: 99, quality: "MSI", region: "Legacy", stats: { mec: 99, tmf: 97, frm: 99, cmp: 97, map: 93, ldr: 91 } },
    { id: 9204, name: "Ruler",  role: "ADC", team: "Gen.G", year: 2025, rating: 96, quality: "MSI", region: "Legacy", stats: { mec: 97, tmf: 97, frm: 97, cmp: 95, map: 90, ldr: 90 } },
    { id: 9205, name: "Duro",   role: "SUP", team: "Gen.G", year: 2025, rating: 88, quality: "MSI", region: "Legacy", stats: { mec: 83, tmf: 90, frm: 89, cmp: 88, map: 91, ldr: 87 } },

    // RNG 2022 — MSI Champions (83.3% WR, 24G)
    { id: 9218, name: "Bin",    role: "TOP",   team: "RNG", year: 2022, rating: 92, quality: "MSI", region: "Legacy", stats: { mec: 95, tmf: 90, frm: 93, cmp: 93, map: 89, ldr: 91 } },
    { id: 9219, name: "Wei",    role: "JNG",   team: "RNG", year: 2022, rating: 95, quality: "MSI", region: "Legacy", stats: { mec: 93, tmf: 95, frm: 95, cmp: 97, map: 97, ldr: 94 } },
    { id: 9220, name: "Xiaohu", role: "MID",   team: "RNG", year: 2022, rating: 96, quality: "MSI", region: "Legacy", stats: { mec: 97, tmf: 97, frm: 96, cmp: 96, map: 93, ldr: 93 } },
    { id: 9221, name: "GALA",   role: "ADC",   team: "RNG", year: 2022, rating: 96, quality: "MSI", region: "Legacy", stats: { mec: 99, tmf: 95, frm: 97, cmp: 97, map: 92, ldr: 90 } },
    { id: 9222, name: "Ming",   role: "SUP",   team: "RNG", year: 2022, rating: 97, quality: "MSI", region: "Legacy", stats: { mec: 89, tmf: 97, frm: 97, cmp: 97, map: 99, ldr: 98 } },
    { id: 9223, name: "KenZhu", role: "COACH", team: "RNG", year: 2022, rating: 93, quality: "MSI", region: "Legacy", stats: { mec: 20, tmf: 91, frm: 93, cmp: 92, map: 93, ldr: 95 } },

    // G2 Esports 2019 — MSI Champions (first EU team to win MSI, swept TL 3-0)
    { id: 9230, name: "Wunder",  role: "TOP",   team: "G2", year: 2019, rating: 94, quality: "MSI", region: "Legacy", stats: { mec: 95, tmf: 93, frm: 95, cmp: 93, map: 90, ldr: 91 } },
    { id: 9231, name: "Jankos",  role: "JNG",   team: "G2", year: 2019, rating: 95, quality: "MSI", region: "Legacy", stats: { mec: 93, tmf: 96, frm: 93, cmp: 95, map: 96, ldr: 94 } },
    { id: 9232, name: "Caps",    role: "MID",   team: "G2", year: 2019, rating: 97, quality: "MSI", region: "Legacy", stats: { mec: 98, tmf: 97, frm: 96, cmp: 97, map: 95, ldr: 93 } },
    { id: 9233, name: "Perkz",   role: "ADC",   team: "G2", year: 2019, rating: 96, quality: "MSI", region: "Legacy", stats: { mec: 97, tmf: 95, frm: 97, cmp: 96, map: 93, ldr: 92 } },
    { id: 9234, name: "Mikyx",   role: "SUP",   team: "G2", year: 2019, rating: 95, quality: "MSI", region: "Legacy", stats: { mec: 88, tmf: 96, frm: 95, cmp: 95, map: 97, ldr: 95 } },
    { id: 9235, name: "GrabbZ",  role: "COACH", team: "G2", year: 2019, rating: 93, quality: "MSI", region: "Legacy", stats: { mec: 20, tmf: 91, frm: 93, cmp: 93, map: 94, ldr: 95 } },

    // RNG 2021 — MSI Champions (beat DK 3-2, GALA Finals MVP)
    { id: 9240, name: "Xiaohu",  role: "TOP",   team: "RNG", year: 2021, rating: 95, quality: "MSI", region: "Legacy", stats: { mec: 96, tmf: 95, frm: 96, cmp: 94, map: 92, ldr: 93 } },
    { id: 9241, name: "Wei",     role: "JNG",   team: "RNG", year: 2021, rating: 93, quality: "MSI", region: "Legacy", stats: { mec: 91, tmf: 93, frm: 93, cmp: 95, map: 95, ldr: 92 } },
    { id: 9242, name: "Cryin",   role: "MID",   team: "RNG", year: 2021, rating: 89, quality: "MSI", region: "Legacy", stats: { mec: 91, tmf: 88, frm: 89, cmp: 88, map: 86, ldr: 85 } },
    { id: 9243, name: "GALA",    role: "ADC",   team: "RNG", year: 2021, rating: 95, quality: "MSI", region: "Legacy", stats: { mec: 97, tmf: 94, frm: 96, cmp: 95, map: 90, ldr: 89 } },
    { id: 9244, name: "Ming",    role: "SUP",   team: "RNG", year: 2021, rating: 96, quality: "MSI", region: "Legacy", stats: { mec: 88, tmf: 96, frm: 96, cmp: 96, map: 98, ldr: 97 } },

    // RNG 2018 — MSI Champions (beat KZ 3-1, Uzi Finals MVP, first non-KR Bo5 win since 2015)
    { id: 9250, name: "Letme",   role: "TOP",   team: "RNG", year: 2018, rating: 91, quality: "MSI", region: "Legacy", stats: { mec: 89, tmf: 92, frm: 91, cmp: 92, map: 88, ldr: 90 } },
    { id: 9251, name: "Karsa",   role: "JNG",   team: "RNG", year: 2018, rating: 93, quality: "MSI", region: "Legacy", stats: { mec: 91, tmf: 94, frm: 91, cmp: 94, map: 95, ldr: 93 } },
    { id: 9252, name: "Xiaohu",  role: "MID",   team: "RNG", year: 2018, rating: 94, quality: "MSI", region: "Legacy", stats: { mec: 95, tmf: 94, frm: 94, cmp: 93, map: 91, ldr: 92 } },
    { id: 9253, name: "Uzi",     role: "ADC",   team: "RNG", year: 2018, rating: 98, quality: "MSI", region: "Legacy", stats: { mec: 99, tmf: 97, frm: 99, cmp: 98, map: 93, ldr: 92 } },
    { id: 9254, name: "Ming",    role: "SUP",   team: "RNG", year: 2018, rating: 95, quality: "MSI", region: "Legacy", stats: { mec: 87, tmf: 95, frm: 95, cmp: 96, map: 97, ldr: 96 } },
    { id: 9255, name: "Heart",   role: "COACH", team: "RNG", year: 2018, rating: 93, quality: "MSI", region: "Legacy", stats: { mec: 20, tmf: 91, frm: 93, cmp: 93, map: 94, ldr: 95 } },

    // SKT T1 2017 — MSI Champions (14W-3L, 82% WR, 3-1 vs G2, Faker Finals MVP)
    // Real stats: Peanut 7.4 KDA · Faker 4.7 KDA 24.9%DMG · Huni 3.4 KDA 25.3%DMG (carry top) · Bang 5.0 KDA · Wolf 64.5%KP best on team
    { id: 9291, name: "Huni",    role: "TOP",   team: "SKT", year: 2017, rating: 92, quality: "MSI", region: "Legacy", stats: { mec: 95, tmf: 93, frm: 87, cmp: 88, map: 87, ldr: 86 } },
    { id: 9292, name: "Peanut",  role: "JNG",   team: "SKT", year: 2017, rating: 95, quality: "MSI", region: "Legacy", stats: { mec: 93, tmf: 94, frm: 96, cmp: 95, map: 97, ldr: 91 } },
    { id: 9293, name: "Faker",   role: "MID",   team: "SKT", year: 2017, rating: 98, quality: "MSI", region: "Legacy", stats: { mec: 98, tmf: 97, frm: 98, cmp: 98, map: 96, ldr: 99 } },
    { id: 9294, name: "Bang",    role: "ADC",   team: "SKT", year: 2017, rating: 95, quality: "MSI", region: "Legacy", stats: { mec: 96, tmf: 95, frm: 95, cmp: 94, map: 91, ldr: 90 } },
    { id: 9295, name: "Wolf",    role: "SUP",   team: "SKT", year: 2017, rating: 92, quality: "MSI", region: "Legacy", stats: { mec: 85, tmf: 94, frm: 92, cmp: 93, map: 94, ldr: 95 } },
    { id: 9296, name: "kkOma",   role: "COACH", team: "SKT", year: 2017, rating: 97, quality: "MSI", region: "Legacy", stats: { mec: 20, tmf: 95, frm: 97, cmp: 96, map: 97, ldr: 99 } },

    // SKT T1 2016 — MSI Champions (12W-5L, 71% WR, 3-0 vs CLG, Faker Finals MVP)
    // Real stats: Duke 7.0 KDA (tank/clean) · Blank 70.9%KP highest · Faker 4.7 KDA 65.2%KP 26.5%DMG · Bang 6.7 KDA 31.4%DMG · Wolf 69.2%KP
    { id: 9297, name: "Duke",    role: "TOP",   team: "SKT", year: 2016, rating: 91, quality: "MSI", region: "Legacy", stats: { mec: 90, tmf: 89, frm: 94, cmp: 93, map: 88, ldr: 87 } },
    { id: 9298, name: "Blank",   role: "JNG",   team: "SKT", year: 2016, rating: 89, quality: "MSI", region: "Legacy", stats: { mec: 87, tmf: 91, frm: 89, cmp: 89, map: 93, ldr: 88 } },
    { id: 9299, name: "Faker",   role: "MID",   team: "SKT", year: 2016, rating: 97, quality: "MSI", region: "Legacy", stats: { mec: 98, tmf: 95, frm: 96, cmp: 96, map: 95, ldr: 98 } },
    { id: 9300, name: "Bang",    role: "ADC",   team: "SKT", year: 2016, rating: 94, quality: "MSI", region: "Legacy", stats: { mec: 96, tmf: 94, frm: 95, cmp: 94, map: 90, ldr: 88 } },
    { id: 9311, name: "Wolf",    role: "SUP",   team: "SKT", year: 2016, rating: 90, quality: "MSI", region: "Legacy", stats: { mec: 83, tmf: 92, frm: 90, cmp: 92, map: 92, ldr: 93 } },
    { id: 9312, name: "kkOma",   role: "COACH", team: "SKT", year: 2016, rating: 96, quality: "MSI", region: "Legacy", stats: { mec: 20, tmf: 94, frm: 96, cmp: 95, map: 96, ldr: 99 } },

    // EDG Edward Gaming 2015 — INAUGURAL MSI Champions (10W-3L, 77% WR, beat SKT T1 3-2)
    // Real stats: ClearLove 10.0 KDA 51K/21D/158A (best in tournament, Finals MVP) · Koro1 6.4 KDA 67K/32D/139A · Meiko 6.1 KDA 22K/36D/197A
    { id: 9313, name: "Koro1",     role: "TOP",   team: "EDG", year: 2015, rating: 93, quality: "MSI", region: "Legacy", stats: { mec: 93, tmf: 92, frm: 94, cmp: 93, map: 91, ldr: 89 } },
    { id: 9314, name: "ClearLove", role: "JNG",   team: "EDG", year: 2015, rating: 97, quality: "MSI", region: "Legacy", stats: { mec: 93, tmf: 95, frm: 97, cmp: 97, map: 98, ldr: 94 } },
    { id: 9315, name: "PawN",      role: "MID",   team: "EDG", year: 2015, rating: 94, quality: "MSI", region: "Legacy", stats: { mec: 97, tmf: 94, frm: 93, cmp: 93, map: 91, ldr: 90 } },
    { id: 9316, name: "Deft",      role: "ADC",   team: "EDG", year: 2015, rating: 95, quality: "MSI", region: "Legacy", stats: { mec: 98, tmf: 95, frm: 95, cmp: 93, map: 91, ldr: 88 } },
    { id: 9317, name: "Meiko",     role: "SUP",   team: "EDG", year: 2015, rating: 93, quality: "MSI", region: "Legacy", stats: { mec: 87, tmf: 96, frm: 92, cmp: 93, map: 97, ldr: 96 } },
    { id: 9318, name: "Aaron",     role: "COACH", team: "EDG", year: 2015, rating: 93, quality: "MSI", region: "Legacy", stats: { mec: 20, tmf: 91, frm: 93, cmp: 92, map: 93, ldr: 95 } },

    // === LEAGUE AWARDS 2025 ===
    // POTY — Chovy (Gen.G): dominant 2025 season, MSI winner, LCK title
    { id: 9260, name: "Chovy",    role: "MID",   team: "Gen.G", year: 2025, rating: 99, quality: "POTY", region: "LCK", stats: { mec: 98, tmf: 97, frm: 99, cmp: 98, map: 97, ldr: 95 } },
    // TOTY — T1 (won Team of the Year 2025)
    { id: 9261, name: "Kiin",     role: "TOP",   team: "T1",    year: 2025, rating: 97, quality: "TOTY", region: "LCK", stats: { mec: 96, tmf: 95, frm: 97, cmp: 95, map: 94, ldr: 92 } },
    { id: 9262, name: "Oner",     role: "JNG",   team: "T1",    year: 2025, rating: 97, quality: "TOTY", region: "LCK", stats: { mec: 96, tmf: 97, frm: 96, cmp: 95, map: 97, ldr: 93 } },
    { id: 9263, name: "Faker",    role: "MID",   team: "T1",    year: 2025, rating: 97, quality: "TOTY", region: "LCK", stats: { mec: 94, tmf: 97, frm: 96, cmp: 99, map: 97, ldr: 99 } },
    { id: 9264, name: "Gumayusi",role: "ADC",   team: "T1",    year: 2025, rating: 97, quality: "TOTY", region: "LCK", stats: { mec: 97, tmf: 95, frm: 97, cmp: 95, map: 93, ldr: 92 } },
    { id: 9265, name: "Keria",    role: "SUP",   team: "T1",    year: 2025, rating: 97, quality: "TOTY", region: "LCK", stats: { mec: 95, tmf: 96, frm: 96, cmp: 97, map: 95, ldr: 96 } },
    // ROTY — HongQ (CFO, LCP): breakthrough rookie of 2025
    { id: 9266, name: "HongQ",    role: "MID",   team: "CFO",   year: 2025, rating: 90, quality: "ROTY", region: "LCP", stats: { mec: 89, tmf: 88, frm: 90, cmp: 87, map: 87, ldr: 85 } },

    // === LEAGUE AWARDS 2024 ===
    // POTY — Faker (T1): fourth World Championship, undisputed GOAT
    { id: 9270, name: "Faker",    role: "MID",   team: "T1",    year: 2024, rating: 99, quality: "POTY", region: "LCK", stats: { mec: 99, tmf: 97, frm: 98, cmp: 99, map: 98, ldr: 98 } },
    // TOTY — T1 (won Team of the Year 2024)
    { id: 9271, name: "Zeus",     role: "TOP",   team: "T1",    year: 2024, rating: 96, quality: "TOTY", region: "LCK", stats: { mec: 95, tmf: 95, frm: 95, cmp: 93, map: 93, ldr: 91 } },
    { id: 9272, name: "Oner",     role: "JNG",   team: "T1",    year: 2024, rating: 96, quality: "TOTY", region: "LCK", stats: { mec: 95, tmf: 96, frm: 95, cmp: 94, map: 95, ldr: 92 } },
    { id: 9273, name: "Faker",    role: "MID",   team: "T1",    year: 2024, rating: 98, quality: "TOTY", region: "LCK", stats: { mec: 97, tmf: 96, frm: 97, cmp: 98, map: 97, ldr: 97 } },
    { id: 9274, name: "Gumayusi",role: "ADC",   team: "T1",    year: 2024, rating: 96, quality: "TOTY", region: "LCK", stats: { mec: 97, tmf: 94, frm: 95, cmp: 93, map: 92, ldr: 91 } },
    { id: 9275, name: "Keria",    role: "SUP",   team: "T1",    year: 2024, rating: 96, quality: "TOTY", region: "LCK", stats: { mec: 94, tmf: 95, frm: 95, cmp: 96, map: 94, ldr: 95 } },
    // ROTY — Massu (FlyQuest, LCS): LCS standout rookie support
    { id: 9276, name: "Massu",    role: "SUP",   team: "FQ",    year: 2024, rating: 88, quality: "ROTY", region: "LCS", stats: { mec: 83, tmf: 87, frm: 87, cmp: 88, map: 85, ldr: 87 } },

    // JDG 2023 — MSI Champions (80% WR, 15G)
    { id: 9212, name: "369",     role: "TOP",   team: "JDG", year: 2023, rating: 93, quality: "MSI", region: "Legacy", stats: { mec: 95, tmf: 91, frm: 94, cmp: 96, map: 90, ldr: 91 } },
    { id: 9213, name: "Kanavi",  role: "JNG",   team: "JDG", year: 2023, rating: 96, quality: "MSI", region: "Legacy", stats: { mec: 95, tmf: 96, frm: 95, cmp: 97, map: 97, ldr: 93 } },
    { id: 9214, name: "knight",  role: "MID",   team: "JDG", year: 2023, rating: 97, quality: "MSI", region: "Legacy", stats: { mec: 99, tmf: 98, frm: 98, cmp: 98, map: 94, ldr: 93 } },
    { id: 9215, name: "Ruler",   role: "ADC",   team: "JDG", year: 2023, rating: 97, quality: "MSI", region: "Legacy", stats: { mec: 99, tmf: 97, frm: 97, cmp: 99, map: 93, ldr: 91 } },
    { id: 9216, name: "Missing", role: "SUP",   team: "JDG", year: 2023, rating: 95, quality: "MSI", region: "Legacy", stats: { mec: 87, tmf: 97, frm: 94, cmp: 95, map: 97, ldr: 95 } },
    { id: 9217, name: "Homme",   role: "COACH", team: "JDG", year: 2023, rating: 93, quality: "MSI", region: "Legacy", stats: { mec: 20, tmf: 91, frm: 92, cmp: 91, map: 92, ldr: 95 } },

    // Gen.G 2024 — MSI Champions (75% WR, 16G)
    { id: 9206, name: "Kiin",    role: "TOP",   team: "Gen.G", year: 2024, rating: 97, quality: "MSI", region: "Legacy", stats: { mec: 96, tmf: 97, frm: 98, cmp: 95, map: 91, ldr: 92 } },
    { id: 9207, name: "Canyon",  role: "JNG",   team: "Gen.G", year: 2024, rating: 98, quality: "MSI", region: "Legacy", stats: { mec: 98, tmf: 97, frm: 99, cmp: 96, map: 99, ldr: 93 } },
    { id: 9208, name: "Chovy",   role: "MID",   team: "Gen.G", year: 2024, rating: 99, quality: "MSI", region: "Legacy", stats: { mec: 99, tmf: 98, frm: 99, cmp: 98, map: 94, ldr: 91 } },
    { id: 9209, name: "Peyz",    role: "ADC",   team: "Gen.G", year: 2024, rating: 97, quality: "MSI", region: "Legacy", stats: { mec: 98, tmf: 99, frm: 96, cmp: 95, map: 88, ldr: 86 } },
    { id: 9210, name: "Lehends", role: "SUP",   team: "Gen.G", year: 2024, rating: 96, quality: "MSI", region: "Legacy", stats: { mec: 85, tmf: 96, frm: 96, cmp: 96, map: 98, ldr: 98 } },
    { id: 9211, name: "KIM",     role: "COACH", team: "Gen.G", year: 2024, rating: 94, quality: "MSI", region: "Legacy", stats: { mec: 20, tmf: 92, frm: 94, cmp: 92, map: 93, ldr: 96 } },

    // ==========================================
    // --- 6. FIRST STAND WINNERS ---
    // ==========================================

    // BLG 2026 — First Stand Champions (80% WR, 15G)
    { id: 9306, name: "Bin",    role: "TOP", team: "BLG", year: 2026, rating: 99, quality: "FirstStand", region: "Legacy", stats: { mec: 99, tmf: 98, frm: 99, cmp: 97, map: 93, ldr: 92 } },
    { id: 9307, name: "Xun",    role: "JNG", team: "BLG", year: 2026, rating: 93, quality: "FirstStand", region: "Legacy", stats: { mec: 92, tmf: 93, frm: 93, cmp: 93, map: 95, ldr: 91 } },
    { id: 9308, name: "Knight", role: "MID", team: "BLG", year: 2026, rating: 99, quality: "FirstStand", region: "Legacy", stats: { mec: 99, tmf: 99, frm: 98, cmp: 97, map: 96, ldr: 94 } },
    { id: 9309, name: "Viper",  role: "ADC", team: "BLG", year: 2026, rating: 98, quality: "FirstStand", region: "Legacy", stats: { mec: 99, tmf: 98, frm: 98, cmp: 97, map: 92, ldr: 91 } },
    { id: 9310, name: "ON",     role: "SUP", team: "BLG", year: 2026, rating: 97, quality: "FirstStand", region: "Legacy", stats: { mec: 92, tmf: 96, frm: 97, cmp: 97, map: 98, ldr: 96 } },

    // HLE 2025 — First Stand Champions (82.4% WR, 17G)
    { id: 9301, name: "Zeus",    role: "TOP", team: "HLE", year: 2025, rating: 95, quality: "FirstStand", region: "Legacy", stats: { mec: 98, tmf: 94, frm: 96, cmp: 92, map: 91, ldr: 89 } },
    { id: 9302, name: "Peanut",  role: "JNG", team: "HLE", year: 2025, rating: 95, quality: "FirstStand", region: "Legacy", stats: { mec: 91, tmf: 97, frm: 93, cmp: 95, map: 98, ldr: 97 } },
    { id: 9303, name: "Zeka",    role: "MID", team: "HLE", year: 2025, rating: 97, quality: "FirstStand", region: "Legacy", stats: { mec: 99, tmf: 96, frm: 97, cmp: 95, map: 93, ldr: 92 } },
    { id: 9304, name: "Viper",   role: "ADC", team: "HLE", year: 2025, rating: 96, quality: "FirstStand", region: "Legacy", stats: { mec: 99, tmf: 96, frm: 97, cmp: 94, map: 91, ldr: 90 } },
    { id: 9305, name: "Delight", role: "SUP", team: "HLE", year: 2025, rating: 93, quality: "FirstStand", region: "Legacy", stats: { mec: 85, tmf: 95, frm: 93, cmp: 92, map: 96, ldr: 91 } },

    // ==========================================
    // --- 6b. WORLDS FINALISTS ---
    // ==========================================

    // BLG 2024 — Worlds Finalists (65% WR, 20G — lost to T1 in Grand Finals)
    { id: 9401, name: "Bin",      role: "TOP",   team: "BLG", year: 2024, rating: 92, quality: "Finalist", region: "Legacy", stats: { mec: 94, tmf: 91, frm: 92, cmp: 90, map: 88, ldr: 87 } },
    { id: 9402, name: "XUN",      role: "JNG",   team: "BLG", year: 2024, rating: 91, quality: "Finalist", region: "Legacy", stats: { mec: 88, tmf: 91, frm: 91, cmp: 89, map: 93, ldr: 89 } },
    { id: 9403, name: "knight",   role: "MID",   team: "BLG", year: 2024, rating: 95, quality: "Finalist", region: "Legacy", stats: { mec: 96, tmf: 93, frm: 94, cmp: 93, map: 92, ldr: 91 } },
    { id: 9404, name: "Elk",      role: "ADC",   team: "BLG", year: 2024, rating: 93, quality: "Finalist", region: "Legacy", stats: { mec: 95, tmf: 92, frm: 92, cmp: 91, map: 88, ldr: 85 } },
    { id: 9405, name: "ON",       role: "SUP",   team: "BLG", year: 2024, rating: 88, quality: "Finalist", region: "Legacy", stats: { mec: 80, tmf: 88, frm: 88, cmp: 89, map: 90, ldr: 88 } },
    { id: 9406, name: "BigWei",   role: "COACH", team: "BLG", year: 2024, rating: 89, quality: "Finalist", region: "Legacy", stats: { mec: 22, tmf: 88, frm: 88, cmp: 88, map: 90, ldr: 92 } },
    { id: 9407, name: "Easyhoon", role: "COACH", team: "BLG", year: 2024, rating: 83, quality: "Finalist", region: "Legacy", stats: { mec: 35, tmf: 82, frm: 82, cmp: 83, map: 83, ldr: 84 } },

    // Weibo Gaming 2023 — Worlds Finalists (57.9% WR, 19G — lost to T1 in Grand Finals)
    { id: 9408, name: "TheShy",  role: "TOP",   team: "WBG", year: 2023, rating: 91, quality: "Finalist", region: "Legacy", stats: { mec: 97, tmf: 88, frm: 87, cmp: 88, map: 84, ldr: 87 } },
    { id: 9409, name: "Weiwei",  role: "JNG",   team: "WBG", year: 2023, rating: 88, quality: "Finalist", region: "Legacy", stats: { mec: 87, tmf: 90, frm: 88, cmp: 86, map: 89, ldr: 85 } },
    { id: 9410, name: "Xiaohu",  role: "MID",   team: "WBG", year: 2023, rating: 90, quality: "Finalist", region: "Legacy", stats: { mec: 90, tmf: 90, frm: 90, cmp: 91, map: 88, ldr: 90 } },
    { id: 9411, name: "Light",   role: "ADC",   team: "WBG", year: 2023, rating: 93, quality: "Finalist", region: "Legacy", stats: { mec: 94, tmf: 92, frm: 93, cmp: 91, map: 88, ldr: 88 } },
    { id: 9412, name: "Crisp",   role: "SUP",   team: "WBG", year: 2023, rating: 89, quality: "Finalist", region: "Legacy", stats: { mec: 83, tmf: 91, frm: 89, cmp: 88, map: 91, ldr: 88 } },
    { id: 9413, name: "Daeny",   role: "COACH", team: "WBG", year: 2023, rating: 87, quality: "Finalist", region: "Legacy", stats: { mec: 22, tmf: 86, frm: 87, cmp: 86, map: 87, ldr: 88 } },

    // KOO Tigers — 2015 Worlds Finalists (lost to SKT 1-3)
    { id: 9420, name: "Smeb",    role: "TOP", team: "KOO", year: 2015, rating: 97, quality: "Finalist", region: "Legacy", stats: { mec: 99, tmf: 96, frm: 99, cmp: 98, map: 94, ldr: 96 } },
    { id: 9421, name: "Hojin",   role: "JNG", team: "KOO", year: 2015, rating: 94, quality: "Finalist", region: "Legacy", stats: { mec: 92, tmf: 97, frm: 93, cmp: 96, map: 97, ldr: 96 } },
    { id: 9422, name: "Kuro",    role: "MID", team: "KOO", year: 2015, rating: 96, quality: "Finalist", region: "Legacy", stats: { mec: 99, tmf: 97, frm: 97, cmp: 99, map: 95, ldr: 95 } },
    { id: 9423, name: "PraY",    role: "ADC", team: "KOO", year: 2015, rating: 98, quality: "Finalist", region: "Legacy", stats: { mec: 99, tmf: 97, frm: 99, cmp: 98, map: 95, ldr: 97 } },
    { id: 9424, name: "GorillA", role: "SUP", team: "KOO", year: 2015, rating: 95, quality: "Finalist", region: "Legacy", stats: { mec: 87, tmf: 96, frm: 93, cmp: 99, map: 99, ldr: 99 } },
    { id: 9425, name: "NoFe",    role: "COACH", team: "KOO", year: 2015, rating: 95, quality: "Finalist", region: "Legacy", stats: { mec: 25, tmf: 93, frm: 95, cmp: 95, map: 96, ldr: 97 } },

    // Samsung Galaxy — 2016 Worlds Finalists (lost to SKT 1-3)
    { id: 9430, name: "CuVee",    role: "TOP", team: "SSG", year: 2016, rating: 93, quality: "Finalist", region: "Legacy", stats: { mec: 95, tmf: 92, frm: 95, cmp: 92, map: 90, ldr: 90 } },
    { id: 9431, name: "Ambition",  role: "JNG", team: "SSG", year: 2016, rating: 93, quality: "Finalist", region: "Legacy", stats: { mec: 91, tmf: 96, frm: 92, cmp: 95, map: 96, ldr: 95 } },
    { id: 9432, name: "Crown",    role: "MID", team: "SSG", year: 2016, rating: 94, quality: "Finalist", region: "Legacy", stats: { mec: 97, tmf: 95, frm: 94, cmp: 96, map: 93, ldr: 92 } },
    { id: 9433, name: "Ruler",    role: "ADC", team: "SSG", year: 2016, rating: 94, quality: "Finalist", region: "Legacy", stats: { mec: 98, tmf: 93, frm: 97, cmp: 92, map: 90, ldr: 91 } },
    { id: 9434, name: "CoreJJ",   role: "SUP", team: "SSG", year: 2016, rating: 92, quality: "Finalist", region: "Legacy", stats: { mec: 84, tmf: 93, frm: 90, cmp: 95, map: 97, ldr: 96 } },

    // ── LCP 2025 ──
    { id: 10600, name: "zorenous", role: "TOP", team: "CHF", year: 2025, rating: 81, quality: "Gold", region: "LCP", stats: { mec: 84, tmf: 80, frm: 85, cmp: 82, map: 78, ldr: 78 } },
    { id: 10601, name: "Husha", role: "JNG", team: "CHF", year: 2025, rating: 83, quality: "Gold", region: "LCP", stats: { mec: 80, tmf: 86, frm: 78, cmp: 85, map: 86, ldr: 84 } },
    { id: 10602, name: "JimieN", role: "MID", team: "CHF", year: 2025, rating: 84, quality: "Gold", region: "LCP", stats: { mec: 87, tmf: 86, frm: 85, cmp: 86, map: 82, ldr: 82 } },
    { id: 10603, name: "Violet", role: "ADC", team: "CHF", year: 2025, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 87, tmf: 86, frm: 89, cmp: 81, map: 82, ldr: 81 } },
    { id: 10604, name: "Luon", role: "SUP", team: "CHF", year: 2025, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 78, tmf: 85, frm: 84, cmp: 87, map: 90, ldr: 88 } },
    { id: 10605, name: "Driver", role: "TOP", team: "CFO", year: 2025, rating: 92, quality: "Diamond", region: "LCP", stats: { mec: 95, tmf: 92, frm: 97, cmp: 93, map: 87, ldr: 92 } },
    { id: 10606, name: "JunJia", role: "JNG", team: "CFO", year: 2025, rating: 92, quality: "Diamond", region: "LCP", stats: { mec: 91, tmf: 95, frm: 90, cmp: 93, map: 96, ldr: 94 } },
    { id: 10607, name: "HongQ", role: "MID", team: "CFO", year: 2025, rating: 92, quality: "Diamond", region: "LCP", stats: { mec: 97, tmf: 93, frm: 93, cmp: 93, map: 94, ldr: 91 } },
    { id: 10608, name: "Doggo", role: "ADC", team: "CFO", year: 2025, rating: 92, quality: "Diamond", region: "LCP", stats: { mec: 97, tmf: 92, frm: 95, cmp: 92, map: 89, ldr: 87 } },
    { id: 10609, name: "Kaiwing", role: "SUP", team: "CFO", year: 2025, rating: 94, quality: "Master", region: "LCP", stats: { mec: 88, tmf: 93, frm: 93, cmp: 98, map: 99, ldr: 97 } },
    { id: 10610, name: "RayFarky", role: "TOP", team: "DFM", year: 2025, rating: 82, quality: "Gold", region: "LCP", stats: { mec: 83, tmf: 79, frm: 85, cmp: 80, map: 78, ldr: 78 } },
    { id: 10611, name: "Guwon", role: "JNG", team: "DFM", year: 2025, rating: 84, quality: "Gold", region: "LCP", stats: { mec: 80, tmf: 86, frm: 82, cmp: 85, map: 90, ldr: 84 } },
    { id: 10612, name: "Aria", role: "MID", team: "DFM", year: 2025, rating: 83, quality: "Gold", region: "LCP", stats: { mec: 85, tmf: 82, frm: 84, cmp: 84, map: 82, ldr: 82 } },
    { id: 10613, name: "Kakkun", role: "ADC", team: "DFM", year: 2025, rating: 82, quality: "Gold", region: "LCP", stats: { mec: 85, tmf: 80, frm: 85, cmp: 80, map: 80, ldr: 80 } },
    { id: 10614, name: "Harp", role: "SUP", team: "DFM", year: 2025, rating: 84, quality: "Gold", region: "LCP", stats: { mec: 75, tmf: 84, frm: 84, cmp: 86, map: 88, ldr: 90 } },
    { id: 10615, name: "Evi", role: "TOP", team: "SHG", year: 2025, rating: 81, quality: "Gold", region: "LCP", stats: { mec: 81, tmf: 81, frm: 83, cmp: 82, map: 77, ldr: 80 } },
    { id: 10616, name: "Courage", role: "JNG", team: "SHG", year: 2025, rating: 84, quality: "Gold", region: "LCP", stats: { mec: 81, tmf: 89, frm: 81, cmp: 85, map: 89, ldr: 84 } },
    { id: 10617, name: "FATE", role: "MID", team: "SHG", year: 2025, rating: 84, quality: "Gold", region: "LCP", stats: { mec: 88, tmf: 85, frm: 84, cmp: 85, map: 83, ldr: 83 } },
    { id: 10618, name: "Marble", role: "ADC", team: "SHG", year: 2025, rating: 86, quality: "Platinum", region: "LCP", stats: { mec: 89, tmf: 86, frm: 90, cmp: 85, map: 83, ldr: 82 } },
    { id: 10619, name: "Gaeng", role: "SUP", team: "SHG", year: 2025, rating: 84, quality: "Gold", region: "LCP", stats: { mec: 75, tmf: 85, frm: 83, cmp: 88, map: 88, ldr: 89 } },
    { id: 10620, name: "Kiaya", role: "TOP", team: "GAM", year: 2025, rating: 86, quality: "Platinum", region: "LCP", stats: { mec: 88, tmf: 83, frm: 87, cmp: 87, map: 83, ldr: 85 } },
    { id: 10621, name: "Levi", role: "JNG", team: "GAM", year: 2025, rating: 87, quality: "Platinum", region: "LCP", stats: { mec: 85, tmf: 92, frm: 85, cmp: 87, map: 90, ldr: 88 } },
    { id: 10622, name: "Aress", role: "MID", team: "GAM", year: 2025, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 90, tmf: 88, frm: 89, cmp: 90, map: 89, ldr: 84 } },
    { id: 10623, name: "Artemis", role: "ADC", team: "GAM", year: 2025, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 92, tmf: 86, frm: 92, cmp: 88, map: 86, ldr: 87 } },
    { id: 10624, name: "Elio", role: "SUP", team: "GAM", year: 2025, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 80, tmf: 89, frm: 84, cmp: 92, map: 94, ldr: 92 } },
    { id: 10625, name: "Kratos", role: "TOP", team: "MGN", year: 2025, rating: 86, quality: "Platinum", region: "LCP", stats: { mec: 89, tmf: 85, frm: 89, cmp: 86, map: 84, ldr: 86 } },
    { id: 10626, name: "Gury", role: "JNG", team: "MGN", year: 2025, rating: 86, quality: "Platinum", region: "LCP", stats: { mec: 83, tmf: 87, frm: 82, cmp: 87, map: 91, ldr: 86 } },
    { id: 10627, name: "Kati", role: "MID", team: "MGN", year: 2025, rating: 90, quality: "Diamond", region: "LCP", stats: { mec: 92, tmf: 91, frm: 89, cmp: 94, map: 92, ldr: 88 } },
    { id: 10628, name: "Sty1e", role: "ADC", team: "MGN", year: 2025, rating: 89, quality: "Platinum", region: "LCP", stats: { mec: 92, tmf: 88, frm: 94, cmp: 88, map: 85, ldr: 87 } },
    { id: 10629, name: "SiuLoong", role: "SUP", team: "MGN", year: 2025, rating: 86, quality: "Platinum", region: "LCP", stats: { mec: 80, tmf: 88, frm: 86, cmp: 87, map: 89, ldr: 89 } },
    { id: 10630, name: "Azhi", role: "TOP", team: "TLN", year: 2025, rating: 86, quality: "Platinum", region: "LCP", stats: { mec: 88, tmf: 86, frm: 90, cmp: 87, map: 82, ldr: 83 } },
    { id: 10631, name: "Karsa", role: "JNG", team: "TLN", year: 2025, rating: 89, quality: "Platinum", region: "LCP", stats: { mec: 89, tmf: 92, frm: 86, cmp: 92, map: 92, ldr: 91 } },
    { id: 10632, name: "FoFo", role: "MID", team: "TLN", year: 2025, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 91, tmf: 89, frm: 88, cmp: 89, map: 89, ldr: 85 } },
    { id: 10633, name: "Betty", role: "ADC", team: "TLN", year: 2025, rating: 90, quality: "Diamond", region: "LCP", stats: { mec: 93, tmf: 88, frm: 94, cmp: 88, map: 87, ldr: 85 } },
    { id: 10634, name: "Woody", role: "SUP", team: "TLN", year: 2025, rating: 89, quality: "Platinum", region: "LCP", stats: { mec: 81, tmf: 89, frm: 86, cmp: 91, map: 93, ldr: 93 } },
    { id: 10635, name: "Hiro02", role: "TOP", team: "TSW", year: 2025, rating: 87, quality: "Platinum", region: "LCP", stats: { mec: 91, tmf: 86, frm: 89, cmp: 88, map: 82, ldr: 87 } },
    { id: 10636, name: "Hizto", role: "JNG", team: "TSW", year: 2025, rating: 90, quality: "Diamond", region: "LCP", stats: { mec: 86, tmf: 91, frm: 85, cmp: 89, map: 95, ldr: 90 } },
    { id: 10637, name: "Dire", role: "MID", team: "TSW", year: 2025, rating: 90, quality: "Diamond", region: "LCP", stats: { mec: 94, tmf: 90, frm: 92, cmp: 93, map: 90, ldr: 89 } },
    { id: 10638, name: "Eddie", role: "ADC", team: "TSW", year: 2025, rating: 93, quality: "Diamond", region: "LCP", stats: { mec: 99, tmf: 90, frm: 96, cmp: 89, map: 89, ldr: 89 } },
    { id: 10639, name: "Taki", role: "SUP", team: "TSW", year: 2025, rating: 91, quality: "Diamond", region: "LCP", stats: { mec: 83, tmf: 93, frm: 91, cmp: 94, map: 97, ldr: 93 } },
    // ── PCS 2024 ──
    { id: 10700, name: "Driver", role: "TOP", team: "CFO", year: 2024, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 88, tmf: 85, frm: 90, cmp: 86, map: 80, ldr: 85 } },
    { id: 10701, name: "Karsa", role: "JNG", team: "CFO", year: 2024, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 88, tmf: 91, frm: 85, cmp: 91, map: 91, ldr: 90 } },
    { id: 10702, name: "Gori", role: "MID", team: "CFO", year: 2024, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 91, tmf: 88, frm: 88, cmp: 89, map: 89, ldr: 85 } },
    { id: 10703, name: "Shunn", role: "ADC", team: "CFO", year: 2024, rating: 90, quality: "Diamond", region: "LCP", stats: { mec: 95, tmf: 91, frm: 93, cmp: 88, map: 87, ldr: 86 } },
    { id: 10704, name: "SwordArt", role: "SUP", team: "CFO", year: 2024, rating: 87, quality: "Platinum", region: "LCP", stats: { mec: 80, tmf: 88, frm: 86, cmp: 88, map: 92, ldr: 91 } },
    { id: 10705, name: "665", role: "JNG", team: "DCG", year: 2024, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 84, tmf: 92, frm: 84, cmp: 91, map: 92, ldr: 90 } },
    { id: 10706, name: "Taco", role: "TOP", team: "DCG", year: 2024, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 86, tmf: 83, frm: 89, cmp: 85, map: 81, ldr: 82 } },
    { id: 10707, name: "Cryscata", role: "MID", team: "DCG", year: 2024, rating: 87, quality: "Platinum", region: "LCP", stats: { mec: 90, tmf: 87, frm: 86, cmp: 88, map: 87, ldr: 84 } },
    { id: 10708, name: "Feng", role: "ADC", team: "DCG", year: 2024, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 90, tmf: 87, frm: 92, cmp: 87, map: 86, ldr: 85 } },
    { id: 10709, name: "Orca", role: "SUP", team: "DCG", year: 2024, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 82, tmf: 90, frm: 84, cmp: 91, map: 93, ldr: 94 } },
    { id: 10710, name: "1Jiang", role: "TOP", team: "FE", year: 2024, rating: 87, quality: "Platinum", region: "LCP", stats: { mec: 89, tmf: 85, frm: 90, cmp: 86, map: 83, ldr: 83 } },
    { id: 10711, name: "Gemini", role: "JNG", team: "FE", year: 2024, rating: 89, quality: "Platinum", region: "LCP", stats: { mec: 85, tmf: 93, frm: 85, cmp: 89, map: 93, ldr: 90 } },
    { id: 10712, name: "JimieN", role: "MID", team: "FE", year: 2024, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 91, tmf: 90, frm: 89, cmp: 90, map: 86, ldr: 86 } },
    { id: 10713, name: "Wako", role: "ADC", team: "FE", year: 2024, rating: 92, quality: "Diamond", region: "LCP", stats: { mec: 96, tmf: 92, frm: 96, cmp: 89, map: 88, ldr: 88 } },
    { id: 10714, name: "Kaiwing", role: "SUP", team: "FE", year: 2024, rating: 91, quality: "Diamond", region: "LCP", stats: { mec: 85, tmf: 90, frm: 90, cmp: 95, map: 96, ldr: 94 } },
    { id: 10715, name: "GuanGuan", role: "TOP", team: "HP", year: 2024, rating: 81, quality: "Gold", region: "LCP", stats: { mec: 82, tmf: 82, frm: 83, cmp: 81, map: 78, ldr: 79 } },
    { id: 10716, name: "Abyss", role: "JNG", team: "HP", year: 2024, rating: 81, quality: "Gold", region: "LCP", stats: { mec: 78, tmf: 85, frm: 77, cmp: 81, map: 87, ldr: 84 } },
    { id: 10717, name: "NuL1", role: "MID", team: "HP", year: 2024, rating: 84, quality: "Gold", region: "LCP", stats: { mec: 85, tmf: 84, frm: 84, cmp: 86, map: 85, ldr: 84 } },
    { id: 10718, name: "Cheng9", role: "ADC", team: "HP", year: 2024, rating: 84, quality: "Gold", region: "LCP", stats: { mec: 90, tmf: 85, frm: 87, cmp: 81, map: 79, ldr: 82 } },
    { id: 10719, name: "Kerry", role: "SUP", team: "HP", year: 2024, rating: 83, quality: "Gold", region: "LCP", stats: { mec: 74, tmf: 82, frm: 81, cmp: 85, map: 89, ldr: 88 } },
    { id: 10720, name: "Likai", role: "TOP", team: "JT", year: 2024, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 88, tmf: 86, frm: 88, cmp: 86, map: 82, ldr: 83 } },
    { id: 10721, name: "Lauva", role: "JNG", team: "JT", year: 2024, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 87, tmf: 91, frm: 85, cmp: 88, map: 93, ldr: 88 } },
    { id: 10722, name: "Minji", role: "MID", team: "JT", year: 2024, rating: 86, quality: "Platinum", region: "LCP", stats: { mec: 88, tmf: 89, frm: 85, cmp: 88, map: 87, ldr: 85 } },
    { id: 10723, name: "ChiCh1", role: "ADC", team: "JT", year: 2024, rating: 88, quality: "Platinum", region: "LCP", stats: { mec: 90, tmf: 87, frm: 92, cmp: 84, map: 85, ldr: 83 } },
    { id: 10724, name: "Enso", role: "SUP", team: "JT", year: 2024, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 78, tmf: 85, frm: 85, cmp: 89, map: 89, ldr: 89 } },
    { id: 10725, name: "Azhi", role: "TOP", team: "PSG", year: 2024, rating: 92, quality: "Diamond", region: "LCP", stats: { mec: 94, tmf: 92, frm: 96, cmp: 93, map: 88, ldr: 89 } },
    { id: 10726, name: "JunJia", role: "JNG", team: "PSG", year: 2024, rating: 95, quality: "Master", region: "LCP", stats: { mec: 94, tmf: 98, frm: 93, cmp: 96, map: 99, ldr: 97 } },
    { id: 10727, name: "Maple", role: "MID", team: "PSG", year: 2024, rating: 92, quality: "Diamond", region: "LCP", stats: { mec: 97, tmf: 92, frm: 91, cmp: 94, map: 92, ldr: 90 } },
    { id: 10728, name: "Betty", role: "ADC", team: "PSG", year: 2024, rating: 94, quality: "Master", region: "LCP", stats: { mec: 97, tmf: 92, frm: 98, cmp: 92, map: 91, ldr: 89 } },
    { id: 10729, name: "Woody", role: "SUP", team: "PSG", year: 2024, rating: 91, quality: "Diamond", region: "LCP", stats: { mec: 83, tmf: 91, frm: 88, cmp: 93, map: 95, ldr: 95 } },
    { id: 10730, name: "1116", role: "MID", team: "WPE", year: 2024, rating: 86, quality: "Platinum", region: "LCP", stats: { mec: 90, tmf: 86, frm: 85, cmp: 89, map: 87, ldr: 86 } },
    { id: 10731, name: "Relhia", role: "TOP", team: "WPE", year: 2024, rating: 78, quality: "Silver", region: "LCP", stats: { mec: 79, tmf: 79, frm: 82, cmp: 78, map: 73, ldr: 76 } },
    { id: 10732, name: "RYue", role: "JNG", team: "WPE", year: 2024, rating: 83, quality: "Gold", region: "LCP", stats: { mec: 83, tmf: 87, frm: 78, cmp: 82, map: 88, ldr: 84 } },
    { id: 10733, name: "Lilv", role: "ADC", team: "WPE", year: 2024, rating: 86, quality: "Platinum", region: "LCP", stats: { mec: 91, tmf: 83, frm: 87, cmp: 85, map: 82, ldr: 83 } },
    { id: 10734, name: "Cha9", role: "SUP", team: "WPE", year: 2024, rating: 83, quality: "Gold", region: "LCP", stats: { mec: 74, tmf: 84, frm: 79, cmp: 84, map: 89, ldr: 87 } },

    // ==========================================
    // --- 7. MVP / NOTEWORTHY VETERANS ---
    // ==========================================

    // T1 2025 Worlds Finals MVP
    { id: 9501, name: "Gumayusi", role: "ADC", team: "T1", year: 2025, rating: 97, quality: "MVP", region: "Legacy", stats: { mec: 99, tmf: 96, frm: 98, cmp: 94, map: 88, ldr: 89 } },

    // Worlds MVP cards — one per year (2020-2024)
    // Faker — Worlds 2024 MVP (T1, 4-peat)
    { id: 9502, name: "Faker", role: "MID", team: "T1", year: 2024, rating: 97, quality: "MVP", region: "Legacy", stats: { mec: 96, tmf: 98, frm: 95, cmp: 98, map: 97, ldr: 98 } },
    // Zeus — Worlds 2023 MVP (T1, 3-peat)
    { id: 9503, name: "Zeus", role: "TOP", team: "T1", year: 2023, rating: 97, quality: "MVP", region: "Legacy", stats: { mec: 97, tmf: 96, frm: 97, cmp: 94, map: 93, ldr: 95 } },
    // Kingen — Worlds 2022 MVP (DRX)
    { id: 9504, name: "Kingen", role: "TOP", team: "DRX", year: 2022, rating: 96, quality: "MVP", region: "Legacy", stats: { mec: 97, tmf: 96, frm: 94, cmp: 94, map: 93, ldr: 93 } },
    // Scout — Worlds 2021 MVP (EDG)
    { id: 9505, name: "Scout", role: "MID", team: "EDG", year: 2021, rating: 97, quality: "MVP", region: "Legacy", stats: { mec: 98, tmf: 97, frm: 98, cmp: 96, map: 97, ldr: 96 } },
    // Canyon — Worlds 2020 MVP (DAMWON Gaming)
    { id: 9506, name: "Canyon", role: "JNG", team: "DK", year: 2020, rating: 99, quality: "MVP", region: "Legacy", stats: { mec: 100, tmf: 99, frm: 100, cmp: 98, map: 100, ldr: 97 } },
    // Tian — Worlds 2019 MVP (FPX)
    { id: 9507, name: "Tian", role: "JNG", team: "FPX", year: 2019, rating: 97, quality: "MVP", region: "Legacy", stats: { mec: 98, tmf: 97, frm: 96, cmp: 96, map: 98, ldr: 93 } },
    // Ning — Worlds 2018 MVP (iG)
    { id: 9508, name: "Ning", role: "JNG", team: "IG", year: 2018, rating: 96, quality: "MVP", region: "Legacy", stats: { mec: 97, tmf: 96, frm: 94, cmp: 92, map: 96, ldr: 91 } },
    // Ruler — Worlds 2017 MVP (SSG)
    { id: 9509, name: "Ruler", role: "ADC", team: "SSG", year: 2017, rating: 99, quality: "MVP", region: "Legacy", stats: { mec: 99, tmf: 100, frm: 99, cmp: 99, map: 97, ldr: 98 } },
    // Faker — Worlds 2016 MVP (SKT T1)
    { id: 9510, name: "Faker", role: "MID", team: "SKT", year: 2016, rating: 99, quality: "MVP", region: "Legacy", stats: { mec: 97, tmf: 99, frm: 100, cmp: 100, map: 98, ldr: 90 } },
    // MaRin — Worlds 2015 MVP (SKT T1)
    { id: 9511, name: "MaRin", role: "TOP", team: "SKT", year: 2015, rating: 98, quality: "MVP", region: "Legacy", stats: { mec: 98, tmf: 98, frm: 99, cmp: 96, map: 97, ldr: 99 } },
    // Mata — Worlds 2014 MVP (Samsung White)
    { id: 9512, name: "Mata", role: "SUP", team: "SSW", year: 2014, rating: 99, quality: "MVP", region: "Legacy", stats: { mec: 89, tmf: 99, frm: 100, cmp: 100, map: 100, ldr: 100 } },
    // Faker — Worlds 2013 MVP (SKT T1)
    { id: 9513, name: "Faker", role: "MID", team: "SKT", year: 2013, rating: 97, quality: "MVP", region: "Legacy", stats: { mec: 98, tmf: 97, frm: 96, cmp: 98, map: 98, ldr: 98 } },
    // Toyz — Worlds 2012 MVP (TPA)
    { id: 9514, name: "Toyz", role: "MID", team: "TPA", year: 2012, rating: 95, quality: "MVP", region: "Legacy", stats: { mec: 93, tmf: 93, frm: 94, cmp: 96, map: 95, ldr: 92 } },
    // Shushei — Worlds 2011 MVP (Fnatic)
    { id: 9515, name: "Shushei", role: "MID", team: "FNC", year: 2011, rating: 91, quality: "MVP", region: "Legacy", stats: { mec: 89, tmf: 90, frm: 90, cmp: 92, map: 89, ldr: 90 } },

    // ==========================================
    // --- CLASSIC YEARS: 2015 SPRING ROSTERS ---
    // ==========================================
    // ===== LCK 2015 Spring Season =====
    // CJ - LCK 2015 Spring
    { id: 10000, name: "Space", role: "ADC", team: "CJ", year: 2015, rating: 90, quality: "Diamond", region: "LCK", stats: { mec: 94, tmf: 89, frm: 93, cmp: 90, map: 86, ldr: 89 } },
    { id: 10001, name: "Ambition", role: "JNG", team: "CJ", year: 2015, rating: 89, quality: "Platinum", region: "LCK", stats: { mec: 87, tmf: 92, frm: 88, cmp: 92, map: 93, ldr: 92 } },
    { id: 10002, name: "Coco", role: "MID", team: "CJ", year: 2015, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 94, tmf: 92, frm: 93, cmp: 95, map: 91, ldr: 91 } },
    { id: 10003, name: "MadLife", role: "SUP", team: "CJ", year: 2015, rating: 90, quality: "Diamond", region: "LCK", stats: { mec: 82, tmf: 91, frm: 87, cmp: 95, map: 95, ldr: 96 } },
    { id: 10004, name: "Shy", role: "TOP", team: "CJ", year: 2015, rating: 89, quality: "Platinum", region: "LCK", stats: { mec: 91, tmf: 88, frm: 94, cmp: 91, map: 86, ldr: 89 } },
    // GET - LCK 2015 Spring
    { id: 10005, name: "PraY", role: "ADC", team: "GET", year: 2015, rating: 97, quality: "Grandmaster", region: "LCK", stats: { mec: 100, tmf: 96, frm: 100, cmp: 97, map: 93, ldr: 96 } },
    { id: 10006, name: "Lee", role: "JNG", team: "GET", year: 2015, rating: 92, quality: "Diamond", region: "LCK", stats: { mec: 90, tmf: 95, frm: 91, cmp: 95, map: 96, ldr: 95 } },
    { id: 10007, name: "Kuro", role: "MID", team: "GET", year: 2015, rating: 94, quality: "Master", region: "LCK", stats: { mec: 97, tmf: 95, frm: 96, cmp: 98, map: 94, ldr: 94 } },
    { id: 10008, name: "GorillA", role: "SUP", team: "GET", year: 2015, rating: 93, quality: "Diamond", region: "LCK", stats: { mec: 85, tmf: 94, frm: 91, cmp: 98, map: 98, ldr: 99 } },
    { id: 10009, name: "Smeb", role: "TOP", team: "GET", year: 2015, rating: 95, quality: "Master", region: "LCK", stats: { mec: 97, tmf: 94, frm: 100, cmp: 97, map: 92, ldr: 95 } },
    // IM - LCK 2015 Spring
    { id: 10010, name: "SONSTAR", role: "ADC", team: "IM", year: 2015, rating: 82, quality: "Gold", region: "LCK", stats: { mec: 86, tmf: 81, frm: 87, cmp: 79, map: 78, ldr: 78 } },
    { id: 10011, name: "Wisdom", role: "JNG", team: "IM", year: 2015, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 84, tmf: 89, frm: 82, cmp: 86, map: 90, ldr: 87 } },
    { id: 10012, name: "Frozen", role: "MID", team: "IM", year: 2015, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 86, frm: 87, cmp: 87, map: 85, ldr: 82 } },
    { id: 10013, name: "TusiN", role: "SUP", team: "IM", year: 2015, rating: 84, quality: "Gold", region: "LCK", stats: { mec: 76, tmf: 85, frm: 84, cmp: 86, map: 89, ldr: 87 } },
    { id: 10014, name: "Lil4c", role: "TOP", team: "IM", year: 2015, rating: 81, quality: "Gold", region: "LCK", stats: { mec: 83, tmf: 80, frm: 84, cmp: 80, map: 78, ldr: 78 } },
    // JAG - LCK 2015 Spring
    { id: 10015, name: "Pilot", role: "ADC", team: "JAG", year: 2015, rating: 88, quality: "Platinum", region: "LCK", stats: { mec: 92, tmf: 87, frm: 93, cmp: 88, map: 84, ldr: 85 } },
    { id: 10016, name: "Chaser", role: "JNG", team: "JAG", year: 2015, rating: 90, quality: "Diamond", region: "LCK", stats: { mec: 88, tmf: 93, frm: 86, cmp: 93, map: 94, ldr: 93 } },
    { id: 10017, name: "GBM", role: "MID", team: "JAG", year: 2015, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 94, tmf: 92, frm: 91, cmp: 95, map: 91, ldr: 89 } },
    { id: 10018, name: "Chei", role: "SUP", team: "JAG", year: 2015, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 79, tmf: 88, frm: 84, cmp: 90, map: 92, ldr: 91 } },
    { id: 10019, name: "TrAce", role: "TOP", team: "JAG", year: 2015, rating: 88, quality: "Platinum", region: "LCK", stats: { mec: 90, tmf: 87, frm: 91, cmp: 90, map: 85, ldr: 86 } },
    // KT - LCK 2015 Spring
    { id: 10020, name: "Arrow", role: "ADC", team: "KT", year: 2015, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 91, tmf: 86, frm: 89, cmp: 85, map: 83, ldr: 84 } },
    { id: 10021, name: "Score", role: "JNG", team: "KT", year: 2015, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 85, tmf: 90, frm: 84, cmp: 88, map: 91, ldr: 88 } },
    { id: 10022, name: "Nagne", role: "MID", team: "KT", year: 2015, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 86, frm: 87, cmp: 86, map: 85, ldr: 83 } },
    { id: 10023, name: "hachani", role: "SUP", team: "KT", year: 2015, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 75, tmf: 84, frm: 80, cmp: 85, map: 88, ldr: 86 } },
    { id: 10024, name: "Ssumday", role: "TOP", team: "KT", year: 2015, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 89, tmf: 86, frm: 92, cmp: 87, map: 84, ldr: 85 } },
    // NJ - LCK 2015 Spring
    { id: 10025, name: "Ohq", role: "ADC", team: "NJ", year: 2015, rating: 88, quality: "Platinum", region: "LCK", stats: { mec: 92, tmf: 87, frm: 93, cmp: 88, map: 84, ldr: 85 } },
    { id: 10026, name: "Watch", role: "JNG", team: "NJ", year: 2015, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 84, tmf: 89, frm: 83, cmp: 87, map: 90, ldr: 87 } },
    { id: 10027, name: "Ggoong", role: "MID", team: "NJ", year: 2015, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 89, tmf: 87, frm: 86, cmp: 88, map: 86, ldr: 84 } },
    { id: 10028, name: "Cain", role: "SUP", team: "NJ", year: 2015, rating: 82, quality: "Gold", region: "LCK", stats: { mec: 74, tmf: 83, frm: 82, cmp: 84, map: 87, ldr: 86 } },
    { id: 10029, name: "Duke", role: "TOP", team: "NJ", year: 2015, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 85, frm: 91, cmp: 86, map: 83, ldr: 83 } },
    // SKT - LCK 2015 Spring
    { id: 10030, name: "Bang", role: "ADC", team: "SKT", year: 2015, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 95, tmf: 90, frm: 96, cmp: 91, map: 87, ldr: 90 } },
    { id: 10031, name: "Bengi", role: "JNG", team: "SKT", year: 2015, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 85, tmf: 90, frm: 83, cmp: 88, map: 91, ldr: 90 } },
    { id: 10032, name: "Faker", role: "MID", team: "SKT", year: 2015, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 94, tmf: 92, frm: 93, cmp: 95, map: 91, ldr: 91 } },
    { id: 10033, name: "Wolf", role: "SUP", team: "SKT", year: 2015, rating: 94, quality: "Master", region: "LCK", stats: { mec: 86, tmf: 95, frm: 94, cmp: 99, map: 99, ldr: 100 } },
    { id: 10034, name: "MaRin", role: "TOP", team: "SKT", year: 2015, rating: 89, quality: "Platinum", region: "LCK", stats: { mec: 91, tmf: 88, frm: 94, cmp: 91, map: 86, ldr: 89 } },
    // SSG - LCK 2015 Spring
    { id: 10035, name: "Fury", role: "ADC", team: "SSG", year: 2015, rating: 84, quality: "Gold", region: "LCK", stats: { mec: 88, tmf: 83, frm: 87, cmp: 81, map: 80, ldr: 80 } },
    { id: 10036, name: "Eve", role: "JNG", team: "SSG", year: 2015, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 81, tmf: 86, frm: 82, cmp: 83, map: 87, ldr: 83 } },
    { id: 10037, name: "BlisS", role: "MID", team: "SSG", year: 2015, rating: 78, quality: "Silver", region: "LCK", stats: { mec: 81, tmf: 79, frm: 77, cmp: 79, map: 78, ldr: 75 } },
    { id: 10038, name: "Wraith", role: "SUP", team: "SSG", year: 2015, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 75, tmf: 84, frm: 83, cmp: 85, map: 88, ldr: 86 } },
    { id: 10039, name: "CuVee", role: "TOP", team: "SSG", year: 2015, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 85, tmf: 82, frm: 86, cmp: 82, map: 80, ldr: 80 } },
    // ===== LPL 2015 Spring Season =====
    // EDG - LPL 2015 Spring
    { id: 10040, name: "Deft", role: "ADC", team: "EDG", year: 2015, rating: 95, quality: "Master", region: "LPL", stats: { mec: 99, tmf: 94, frm: 100, cmp: 95, map: 91, ldr: 94 } },
    { id: 10041, name: "ClearLove", role: "JNG", team: "EDG", year: 2015, rating: 99, quality: "Challenger", region: "LPL", stats: { mec: 97, tmf: 100, frm: 96, cmp: 100, map: 100, ldr: 100 } },
    { id: 10042, name: "PawN", role: "MID", team: "EDG", year: 2015, rating: 95, quality: "Master", region: "LPL", stats: { mec: 98, tmf: 96, frm: 94, cmp: 99, map: 95, ldr: 95 } },
    { id: 10043, name: "Meiko", role: "SUP", team: "EDG", year: 2015, rating: 96, quality: "Grandmaster", region: "LPL", stats: { mec: 88, tmf: 97, frm: 93, cmp: 100, map: 100, ldr: 100 } },
    { id: 10044, name: "Mouse", role: "SUP", team: "EDG", year: 2015, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 83, tmf: 92, frm: 89, cmp: 96, map: 96, ldr: 97 } },
    { id: 10045, name: "Koro1", role: "TOP", team: "EDG", year: 2015, rating: 97, quality: "Grandmaster", region: "LPL", stats: { mec: 99, tmf: 96, frm: 100, cmp: 99, map: 94, ldr: 97 } },
    // EP - LPL 2015 Spring
    { id: 10046, name: "kane", role: "ADC", team: "EP", year: 2015, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 86, tmf: 81, frm: 85, cmp: 79, map: 78, ldr: 78 } },
    { id: 10047, name: "ZangAo", role: "ADC", team: "EP", year: 2015, rating: 80, quality: "Gold", region: "LPL", stats: { mec: 84, tmf: 79, frm: 82, cmp: 77, map: 76, ldr: 76 } },
    { id: 10048, name: "Drizzle", role: "JNG", team: "EP", year: 2015, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 81, tmf: 86, frm: 79, cmp: 83, map: 87, ldr: 83 } },
    { id: 10049, name: "Captain57", role: "JNG", team: "EP", year: 2015, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 80, tmf: 85, frm: 78, cmp: 82, map: 86, ldr: 82 } },
    { id: 10050, name: "Raphael", role: "MID", team: "EP", year: 2015, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 85, tmf: 83, frm: 81, cmp: 83, map: 82, ldr: 79 } },
    { id: 10051, name: "x1u", role: "SUP", team: "EP", year: 2015, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 74, tmf: 83, frm: 80, cmp: 84, map: 87, ldr: 85 } },
    { id: 10052, name: "AmazingJ", role: "TOP", team: "EP", year: 2015, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 83, tmf: 80, frm: 84, cmp: 80, map: 78, ldr: 78 } },
    // GT - LPL 2015 Spring
    { id: 10053, name: "Tale", role: "ADC", team: "GT", year: 2015, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 87, tmf: 82, frm: 85, cmp: 80, map: 79, ldr: 79 } },
    { id: 10054, name: "hu1", role: "JNG", team: "GT", year: 2015, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 82, tmf: 87, frm: 81, cmp: 85, map: 88, ldr: 84 } },
    { id: 10055, name: "Danger", role: "JNG", team: "GT", year: 2015, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 83, tmf: 88, frm: 81, cmp: 85, map: 89, ldr: 85 } },
    { id: 10056, name: "xiaohu", role: "MID", team: "GT", year: 2015, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 86, frm: 85, cmp: 87, map: 85, ldr: 82 } },
    { id: 10057, name: "SinkDream", role: "SUP", team: "GT", year: 2015, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 75, tmf: 84, frm: 80, cmp: 85, map: 88, ldr: 86 } },
    { id: 10058, name: "LetMe", role: "TOP", team: "GT", year: 2015, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 85, tmf: 82, frm: 85, cmp: 82, map: 80, ldr: 80 } },
    // IG - LPL 2015 Spring
    { id: 10059, name: "Kid", role: "ADC", team: "IG", year: 2015, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 92, tmf: 87, frm: 90, cmp: 88, map: 84, ldr: 85 } },
    { id: 10060, name: "KaKAO", role: "JNG", team: "IG", year: 2015, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 91, frm: 87, cmp: 91, map: 92, ldr: 89 } },
    { id: 10061, name: "RooKie", role: "MID", team: "IG", year: 2015, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 91, tmf: 89, frm: 90, cmp: 90, map: 88, ldr: 86 } },
    { id: 10062, name: "Kitties", role: "SUP", team: "IG", year: 2015, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 80, tmf: 89, frm: 88, cmp: 91, map: 93, ldr: 92 } },
    { id: 10063, name: "Pokemon", role: "TOP", team: "IG", year: 2015, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 90, tmf: 87, frm: 90, cmp: 88, map: 85, ldr: 88 } },
    { id: 10064, name: "Zzitai", role: "TOP", team: "IG", year: 2015, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 84, frm: 90, cmp: 84, map: 82, ldr: 83 } },
    // King - LPL 2015 Spring
    { id: 10065, name: "wuxin", role: "ADC", team: "King", year: 2015, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 90, tmf: 85, frm: 89, cmp: 83, map: 82, ldr: 83 } },
    { id: 10066, name: "Mlxg", role: "JNG", team: "King", year: 2015, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 84, tmf: 89, frm: 83, cmp: 87, map: 90, ldr: 87 } },
    { id: 10067, name: "Assassin", role: "MID", team: "King", year: 2015, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 86, frm: 85, cmp: 86, map: 85, ldr: 83 } },
    { id: 10068, name: "Leyn", role: "SUP", team: "King", year: 2015, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 77, tmf: 86, frm: 85, cmp: 88, map: 90, ldr: 89 } },
    { id: 10069, name: "Skye", role: "TOP", team: "King", year: 2015, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 85, frm: 88, cmp: 86, map: 83, ldr: 84 } },
    // LGD - LPL 2015 Spring
    { id: 10070, name: "imp", role: "ADC", team: "LGD", year: 2015, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 91, tmf: 86, frm: 90, cmp: 85, map: 83, ldr: 84 } },
    { id: 10071, name: "TBQ", role: "JNG", team: "LGD", year: 2015, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 91, frm: 87, cmp: 89, map: 92, ldr: 89 } },
    { id: 10072, name: "We1less", role: "MID", team: "LGD", year: 2015, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 90, tmf: 88, frm: 89, cmp: 89, map: 87, ldr: 85 } },
    { id: 10073, name: "Pyl", role: "SUP", team: "LGD", year: 2015, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 80, tmf: 89, frm: 86, cmp: 91, map: 93, ldr: 94 } },
    { id: 10074, name: "Acorn", role: "TOP", team: "LGD", year: 2015, rating: 89, quality: "Platinum", region: "LPL", stats: { mec: 91, tmf: 88, frm: 91, cmp: 91, map: 86, ldr: 87 } },
    { id: 10075, name: "Flame", role: "TOP", team: "LGD", year: 2015, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 89, tmf: 86, frm: 89, cmp: 87, map: 84, ldr: 85 } },
    // M3 - LPL 2015 Spring
    { id: 10076, name: "Candy", role: "ADC", team: "M3", year: 2015, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 91, tmf: 86, frm: 90, cmp: 85, map: 83, ldr: 84 } },
    { id: 10077, name: "SmLz", role: "ADC", team: "M3", year: 2015, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 88, tmf: 83, frm: 87, cmp: 82, map: 80, ldr: 80 } },
    { id: 10078, name: "Condi", role: "JNG", team: "M3", year: 2015, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 81, tmf: 86, frm: 80, cmp: 83, map: 87, ldr: 83 } },
    { id: 10079, name: "Ruo", role: "JNG", team: "M3", year: 2015, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 84, tmf: 89, frm: 85, cmp: 87, map: 90, ldr: 87 } },
    { id: 10080, name: "dade", role: "MID", team: "M3", year: 2015, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 86, tmf: 84, frm: 82, cmp: 84, map: 83, ldr: 80 } },
    { id: 10081, name: "Lovecd", role: "SUP", team: "M3", year: 2015, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 77, tmf: 86, frm: 85, cmp: 88, map: 90, ldr: 89 } },
    { id: 10082, name: "Looper", role: "TOP", team: "M3", year: 2015, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 84, frm: 87, cmp: 85, map: 82, ldr: 82 } },
    // OMG - LPL 2015 Spring
    { id: 10083, name: "Uzi", role: "ADC", team: "OMG", year: 2015, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 92, tmf: 87, frm: 93, cmp: 86, map: 84, ldr: 87 } },
    { id: 10084, name: "LoveLing", role: "JNG", team: "OMG", year: 2015, rating: 89, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 92, frm: 85, cmp: 92, map: 93, ldr: 92 } },
    { id: 10085, name: "Cool", role: "MID", team: "OMG", year: 2015, rating: 92, quality: "Diamond", region: "LPL", stats: { mec: 95, tmf: 93, frm: 92, cmp: 96, map: 92, ldr: 92 } },
    { id: 10086, name: "Luo", role: "SUP", team: "OMG", year: 2015, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 74, tmf: 83, frm: 82, cmp: 84, map: 87, ldr: 85 } },
    { id: 10087, name: "Cloud", role: "SUP", team: "OMG", year: 2015, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 79, tmf: 88, frm: 85, cmp: 90, map: 92, ldr: 91 } },
    { id: 10088, name: "Gogoing", role: "TOP", team: "OMG", year: 2015, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 93, tmf: 90, frm: 94, cmp: 93, map: 88, ldr: 91 } },
    // SHRC - LPL 2015 Spring
    { id: 10089, name: "HYY", role: "ADC", team: "SHRC", year: 2015, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 90, tmf: 85, frm: 88, cmp: 84, map: 82, ldr: 82 } },
    { id: 10090, name: "NaMei", role: "ADC", team: "SHRC", year: 2015, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 87, tmf: 82, frm: 85, cmp: 80, map: 79, ldr: 80 } },
    { id: 10091, name: "inSec", role: "JNG", team: "SHRC", year: 2015, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 82, tmf: 87, frm: 81, cmp: 84, map: 88, ldr: 84 } },
    { id: 10092, name: "Blank", role: "JNG", team: "SHRC", year: 2015, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 82, tmf: 87, frm: 81, cmp: 84, map: 88, ldr: 84 } },
    { id: 10093, name: "corn", role: "MID", team: "SHRC", year: 2015, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 87, tmf: 85, frm: 83, cmp: 86, map: 84, ldr: 81 } },
    { id: 10094, name: "Cola", role: "TOP", team: "SHRC", year: 2015, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 85, tmf: 82, frm: 86, cmp: 82, map: 80, ldr: 80 } },
    { id: 10095, name: "GodLike", role: "TOP", team: "SHRC", year: 2015, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 86, tmf: 83, frm: 86, cmp: 83, map: 81, ldr: 82 } },
    { id: 10122, name: "Zero", role: "SUP", team: "SHRC", year: 2015, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 76, tmf: 85, frm: 82, cmp: 87, map: 89, ldr: 88 } },
    // Snake - LPL 2015 Spring
    { id: 10096, name: "kRYST4L", role: "ADC", team: "Snake", year: 2015, rating: 89, quality: "Platinum", region: "LPL", stats: { mec: 93, tmf: 88, frm: 94, cmp: 87, map: 85, ldr: 88 } },
    { id: 10097, name: "Beast", role: "JNG", team: "Snake", year: 2015, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 88, tmf: 93, frm: 86, cmp: 93, map: 94, ldr: 93 } },
    { id: 10098, name: "BAKA", role: "MID", team: "Snake", year: 2015, rating: 89, quality: "Platinum", region: "LPL", stats: { mec: 92, tmf: 90, frm: 88, cmp: 91, map: 89, ldr: 89 } },
    { id: 10099, name: "Ella", role: "SUP", team: "Snake", year: 2015, rating: 92, quality: "Diamond", region: "LPL", stats: { mec: 84, tmf: 93, frm: 89, cmp: 97, map: 97, ldr: 98 } },
    { id: 10100, name: "Flandre", role: "TOP", team: "Snake", year: 2015, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 92, tmf: 89, frm: 95, cmp: 90, map: 87, ldr: 90 } },
    // VG - LPL 2015 Spring
    { id: 10101, name: "Vasilii", role: "ADC", team: "VG", year: 2015, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 94, tmf: 89, frm: 92, cmp: 90, map: 86, ldr: 89 } },
    { id: 10102, name: "DanDy", role: "JNG", team: "VG", year: 2015, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 88, tmf: 93, frm: 89, cmp: 93, map: 94, ldr: 93 } },
    { id: 10103, name: "Hetong", role: "MID", team: "VG", year: 2015, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 93, tmf: 91, frm: 90, cmp: 94, map: 90, ldr: 88 } },
    { id: 10104, name: "Mata", role: "SUP", team: "VG", year: 2015, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 82, tmf: 91, frm: 88, cmp: 95, map: 95, ldr: 96 } },
    { id: 10105, name: "Carry", role: "TOP", team: "VG", year: 2015, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 92, tmf: 89, frm: 95, cmp: 92, map: 87, ldr: 90 } },
    // WE - LPL 2015 Spring
    { id: 10106, name: "Styz", role: "ADC", team: "WE", year: 2015, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 86, tmf: 81, frm: 85, cmp: 79, map: 78, ldr: 78 } },
    { id: 10107, name: "Mystic", role: "ADC", team: "WE", year: 2015, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 94, tmf: 89, frm: 92, cmp: 88, map: 86, ldr: 89 } },
    { id: 10108, name: "Spirit", role: "JNG", team: "WE", year: 2015, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 84, tmf: 89, frm: 85, cmp: 87, map: 90, ldr: 87 } },
    { id: 10109, name: "Ninja", role: "MID", team: "WE", year: 2015, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 85, tmf: 83, frm: 81, cmp: 83, map: 82, ldr: 79 } },
    { id: 10110, name: "xiye", role: "MID", team: "WE", year: 2015, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 91, tmf: 89, frm: 88, cmp: 89, map: 88, ldr: 88 } },
    { id: 10111, name: "YuZhe", role: "SUP", team: "WE", year: 2015, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 77, tmf: 86, frm: 83, cmp: 88, map: 90, ldr: 89 } },
    { id: 10112, name: "Conan", role: "SUP", team: "WE", year: 2015, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 80, tmf: 89, frm: 85, cmp: 93, map: 93, ldr: 91 } },
    { id: 10113, name: "Aluka", role: "TOP", team: "WE", year: 2015, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 84, frm: 87, cmp: 84, map: 82, ldr: 82 } },
    // ===== LCK 2015 Spring Season - Head Coaches =====
    { id: 10114, name: "Kezman", role: "COACH", team: "CJ", year: 2015, rating: 90, quality: "Diamond", region: "LCK", stats: { mec: 25, tmf: 87, frm: 90, cmp: 90, map: 91, ldr: 92 } },
    { id: 10115, name: "Micro", role: "COACH", team: "IM", year: 2015, rating: 84, quality: "Gold", region: "LCK", stats: { mec: 25, tmf: 81, frm: 84, cmp: 84, map: 85, ldr: 86 } },
    { id: 10116, name: "NoFe", role: "COACH", team: "GET", year: 2015, rating: 94, quality: "Master", region: "LCK", stats: { mec: 25, tmf: 91, frm: 94, cmp: 94, map: 95, ldr: 96 } },
    { id: 10117, name: "Sweet", role: "COACH", team: "JAG", year: 2015, rating: 89, quality: "Platinum", region: "LCK", stats: { mec: 25, tmf: 86, frm: 89, cmp: 89, map: 90, ldr: 91 } },
    { id: 10118, name: "Lee Ji-hoon", role: "COACH", team: "KT", year: 2015, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 25, tmf: 83, frm: 86, cmp: 86, map: 87, ldr: 88 } },
    { id: 10119, name: "viNylCat", role: "COACH", team: "NJ", year: 2015, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 25, tmf: 83, frm: 86, cmp: 86, map: 87, ldr: 88 } },
    { id: 10120, name: "DoGGi", role: "COACH", team: "SSG", year: 2015, rating: 82, quality: "Gold", region: "LCK", stats: { mec: 25, tmf: 79, frm: 82, cmp: 82, map: 83, ldr: 84 } },
    { id: 10121, name: "kkOma", role: "COACH", team: "SKT", year: 2015, rating: 92, quality: "Diamond", region: "LCK", stats: { mec: 22, tmf: 89, frm: 92, cmp: 92, map: 93, ldr: 97 } },

    // ===== EU LCS 2015 Summer Season (LEC) =====
    // Fnatic (18-0 undefeated split)
    { id: 10200, name: "Huni", role: "TOP", team: "FNC", year: 2015, rating: 94, quality: "Master", region: "LEC", stats: { mec: 97, tmf: 92, frm: 95, cmp: 95, map: 91, ldr: 92 } },
    { id: 10201, name: "Reignover", role: "JNG", team: "FNC", year: 2015, rating: 94, quality: "Master", region: "LEC", stats: { mec: 93, tmf: 98, frm: 90, cmp: 94, map: 99, ldr: 97 } },
    { id: 10202, name: "Febiven", role: "MID", team: "FNC", year: 2015, rating: 94, quality: "Master", region: "LEC", stats: { mec: 97, tmf: 96, frm: 94, cmp: 97, map: 93, ldr: 92 } },
    { id: 10203, name: "Rekkles", role: "ADC", team: "FNC", year: 2015, rating: 95, quality: "Master", region: "LEC", stats: { mec: 99, tmf: 93, frm: 97, cmp: 94, map: 90, ldr: 90 } },
    { id: 10204, name: "YellOwStaR", role: "SUP", team: "FNC", year: 2015, rating: 96, quality: "Grandmaster", region: "LEC", stats: { mec: 87, tmf: 97, frm: 96, cmp: 97, map: 99, ldr: 99 } },
    // Origen
    { id: 10205, name: "sOAZ", role: "TOP", team: "OG", year: 2015, rating: 91, quality: "Diamond", region: "LEC", stats: { mec: 95, tmf: 88, frm: 93, cmp: 90, map: 90, ldr: 90 } },
    { id: 10206, name: "Amazing", role: "JNG", team: "OG", year: 2015, rating: 90, quality: "Diamond", region: "LEC", stats: { mec: 89, tmf: 94, frm: 86, cmp: 93, map: 94, ldr: 93 } },
    { id: 10207, name: "xPeke", role: "MID", team: "OG", year: 2015, rating: 90, quality: "Diamond", region: "LEC", stats: { mec: 94, tmf: 89, frm: 92, cmp: 91, map: 91, ldr: 88 } },
    { id: 10208, name: "Niels", role: "ADC", team: "OG", year: 2015, rating: 92, quality: "Diamond", region: "LEC", stats: { mec: 95, tmf: 89, frm: 95, cmp: 91, map: 87, ldr: 90 } },
    { id: 10209, name: "Mithy", role: "SUP", team: "OG", year: 2015, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 81, tmf: 90, frm: 84, cmp: 90, map: 92, ldr: 90 } },
    // H2k-Gaming
    { id: 10210, name: "Odoamne", role: "TOP", team: "H2K", year: 2015, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 87, frm: 92, cmp: 88, map: 83, ldr: 86 } },
    { id: 10211, name: "Loulex", role: "JNG", team: "H2K", year: 2015, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 84, tmf: 92, frm: 83, cmp: 87, map: 93, ldr: 87 } },
    { id: 10212, name: "Ryu", role: "MID", team: "H2K", year: 2015, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 94, tmf: 88, frm: 89, cmp: 92, map: 88, ldr: 87 } },
    { id: 10213, name: "Hjarnan", role: "ADC", team: "H2K", year: 2015, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 93, tmf: 89, frm: 93, cmp: 86, map: 85, ldr: 87 } },
    { id: 10214, name: "KaSing", role: "SUP", team: "H2K", year: 2015, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 82, tmf: 92, frm: 87, cmp: 94, map: 92, ldr: 92 } },
    // Unicorns of Love
    { id: 10215, name: "Vizicsacsi", role: "TOP", team: "UOL", year: 2015, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 90, tmf: 89, frm: 90, cmp: 88, map: 86, ldr: 88 } },
    { id: 10216, name: "Kikis", role: "JNG", team: "UOL", year: 2015, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 91, frm: 84, cmp: 89, map: 93, ldr: 89 } },
    { id: 10217, name: "PowerOfEvil", role: "MID", team: "UOL", year: 2015, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 92, tmf: 91, frm: 86, cmp: 91, map: 88, ldr: 87 } },
    { id: 10218, name: "Vardags", role: "ADC", team: "UOL", year: 2015, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 91, tmf: 85, frm: 90, cmp: 86, map: 82, ldr: 86 } },
    { id: 10219, name: "Hylissang", role: "SUP", team: "UOL", year: 2015, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 78, tmf: 89, frm: 84, cmp: 89, map: 92, ldr: 91 } },
    // Gambit Gaming
    { id: 10220, name: "Cabochard", role: "TOP", team: "GMB", year: 2015, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 87, frm: 90, cmp: 86, map: 84, ldr: 83 } },
    { id: 10221, name: "Diamondprox", role: "JNG", team: "GMB", year: 2015, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 80, tmf: 83, frm: 77, cmp: 85, map: 88, ldr: 82 } },
    { id: 10222, name: "Betsy", role: "MID", team: "GMB", year: 2015, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 88, tmf: 84, frm: 83, cmp: 85, map: 84, ldr: 81 } },
    { id: 10223, name: "FORG1VEN", role: "ADC", team: "GMB", year: 2015, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 85, tmf: 80, frm: 87, cmp: 80, map: 79, ldr: 79 } },
    { id: 10224, name: "Edward", role: "SUP", team: "GMB", year: 2015, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 75, tmf: 84, frm: 81, cmp: 86, map: 88, ldr: 87 } },
    // SK Gaming
    { id: 10225, name: "fredy122", role: "TOP", team: "SK", year: 2015, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 86, tmf: 83, frm: 85, cmp: 84, map: 81, ldr: 82 } },
    { id: 10226, name: "Svenskeren", role: "JNG", team: "SK", year: 2015, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 82, tmf: 86, frm: 79, cmp: 83, map: 87, ldr: 86 } },
    { id: 10227, name: "Fox", role: "MID", team: "SK", year: 2015, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 88, tmf: 83, frm: 85, cmp: 85, map: 83, ldr: 82 } },
    { id: 10228, name: "CandyPanda", role: "ADC", team: "SK", year: 2015, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 89, tmf: 82, frm: 85, cmp: 83, map: 81, ldr: 79 } },
    { id: 10229, name: "nRated", role: "SUP", team: "SK", year: 2015, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 75, tmf: 86, frm: 84, cmp: 87, map: 92, ldr: 87 } },
    // Giants Gaming
    { id: 10230, name: "Werlyb", role: "TOP", team: "GIA", year: 2015, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 86, frm: 88, cmp: 86, map: 83, ldr: 85 } },
    { id: 10231, name: "Fr3deric", role: "JNG", team: "GIA", year: 2015, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 82, tmf: 86, frm: 82, cmp: 86, map: 88, ldr: 87 } },
    { id: 10232, name: "Pepiinero", role: "MID", team: "GIA", year: 2015, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 91, tmf: 88, frm: 86, cmp: 91, map: 86, ldr: 86 } },
    { id: 10233, name: "Adryh", role: "ADC", team: "GIA", year: 2015, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 84, frm: 89, cmp: 83, map: 79, ldr: 82 } },
    { id: 10234, name: "G0DFRED", role: "SUP", team: "GIA", year: 2015, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 77, tmf: 87, frm: 85, cmp: 88, map: 90, ldr: 92 } },
    // Elements
    { id: 10235, name: "Jwaow", role: "TOP", team: "EL", year: 2015, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 85, frm: 90, cmp: 88, map: 85, ldr: 83 } },
    { id: 10236, name: "Dexter", role: "JNG", team: "EL", year: 2015, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 85, tmf: 89, frm: 81, cmp: 87, map: 91, ldr: 89 } },
    { id: 10237, name: "Froggen", role: "MID", team: "EL", year: 2015, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 85, frm: 86, cmp: 89, map: 86, ldr: 83 } },
    { id: 10238, name: "Tabzz", role: "ADC", team: "EL", year: 2015, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 91, tmf: 82, frm: 86, cmp: 85, map: 80, ldr: 80 } },
    { id: 10239, name: "promisq", role: "SUP", team: "EL", year: 2015, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 77, tmf: 87, frm: 83, cmp: 86, map: 87, ldr: 90 } },
    // Team ROCCAT
    { id: 10240, name: "Steve", role: "TOP", team: "ROC", year: 2015, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 85, frm: 90, cmp: 88, map: 84, ldr: 85 } },
    { id: 10241, name: "Jankos", role: "JNG", team: "ROC", year: 2015, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 92, frm: 86, cmp: 91, map: 92, ldr: 89 } },
    { id: 10242, name: "Nukeduck", role: "MID", team: "ROC", year: 2015, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 91, tmf: 88, frm: 89, cmp: 92, map: 89, ldr: 89 } },
    { id: 10243, name: "MrRallez", role: "ADC", team: "ROC", year: 2015, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 92, tmf: 87, frm: 88, cmp: 84, map: 82, ldr: 86 } },
    { id: 10244, name: "Vander", role: "SUP", team: "ROC", year: 2015, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 77, tmf: 86, frm: 84, cmp: 89, map: 91, ldr: 92 } },
    // Copenhagen Wolves
    { id: 10245, name: "YoungBuck", role: "TOP", team: "CW", year: 2015, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 84, tmf: 80, frm: 83, cmp: 82, map: 77, ldr: 81 } },
    { id: 10246, name: "Airwaks", role: "JNG", team: "CW", year: 2015, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 87, frm: 81, cmp: 84, map: 86, ldr: 86 } },
    { id: 10247, name: "Soren", role: "MID", team: "CW", year: 2015, rating: 79, quality: "Silver", region: "LEC", stats: { mec: 84, tmf: 79, frm: 80, cmp: 82, map: 80, ldr: 77 } },
    { id: 10248, name: "Freeze", role: "ADC", team: "CW", year: 2015, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 84, frm: 87, cmp: 84, map: 79, ldr: 81 } },
    { id: 10249, name: "Unlimited", role: "SUP", team: "CW", year: 2015, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 72, tmf: 84, frm: 80, cmp: 86, map: 85, ldr: 84 } },

// NA LCS 2015 Summer — Player Entries for database.js
// Generated by gen_nalcs.js
// Total players: 50

    // --- C9 (Cloud9) ---
    { id: 10800, name: "Balls", role: "TOP", team: "C9", year: 2015, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 88, tmf: 86, frm: 86, cmp: 87, map: 80, ldr: 84 } },
    { id: 10801, name: "Hai", role: "JNG", team: "C9", year: 2015, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 83, tmf: 88, frm: 80, cmp: 87, map: 87, ldr: 88 } },
    { id: 10802, name: "Incarnati0n", role: "MID", team: "C9", year: 2015, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 89, tmf: 85, frm: 85, cmp: 89, map: 85, ldr: 82 } },
    { id: 10803, name: "Sneaky", role: "ADC", team: "C9", year: 2015, rating: 87, quality: "Platinum", region: "LCS", stats: { mec: 92, tmf: 86, frm: 92, cmp: 85, map: 81, ldr: 84 } },
    { id: 10804, name: "LemonNation", role: "SUP", team: "C9", year: 2015, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 75, tmf: 84, frm: 83, cmp: 87, map: 88, ldr: 89 } },
    // --- CLG (Counter Logic Gaming) ---
    { id: 10805, name: "ZionSpartan", role: "TOP", team: "CLG", year: 2015, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 92, tmf: 89, frm: 89, cmp: 89, map: 87, ldr: 86 } },
    { id: 10806, name: "Xmithie", role: "JNG", team: "CLG", year: 2015, rating: 89, quality: "Platinum", region: "LCS", stats: { mec: 89, tmf: 93, frm: 87, cmp: 89, map: 93, ldr: 90 } },
    { id: 10807, name: "Pobelter", role: "MID", team: "CLG", year: 2015, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 93, tmf: 90, frm: 88, cmp: 89, map: 87, ldr: 85 } },
    { id: 10808, name: "Doublelift", role: "ADC", team: "CLG", year: 2015, rating: 91, quality: "Diamond", region: "LCS", stats: { mec: 97, tmf: 90, frm: 96, cmp: 91, map: 87, ldr: 86 } },
    { id: 10809, name: "Aphromoo", role: "SUP", team: "CLG", year: 2015, rating: 90, quality: "Diamond", region: "LCS", stats: { mec: 81, tmf: 92, frm: 89, cmp: 94, map: 94, ldr: 96 } },
    // --- NME (Enemy) ---
    { id: 10810, name: "Flaresz", role: "TOP", team: "NME", year: 2015, rating: 81, quality: "Gold", region: "LCS", stats: { mec: 83, tmf: 82, frm: 84, cmp: 79, map: 78, ldr: 77 } },
    { id: 10811, name: "Trashy", role: "JNG", team: "NME", year: 2015, rating: 86, quality: "Platinum", region: "LCS", stats: { mec: 82, tmf: 89, frm: 81, cmp: 88, map: 92, ldr: 88 } },
    { id: 10812, name: "Innox", role: "MID", team: "NME", year: 2015, rating: 84, quality: "Gold", region: "LCS", stats: { mec: 86, tmf: 87, frm: 85, cmp: 87, map: 84, ldr: 80 } },
    { id: 10813, name: "otter", role: "ADC", team: "NME", year: 2015, rating: 83, quality: "Gold", region: "LCS", stats: { mec: 87, tmf: 80, frm: 85, cmp: 81, map: 81, ldr: 80 } },
    { id: 10814, name: "Bodydrop", role: "SUP", team: "NME", year: 2015, rating: 82, quality: "Gold", region: "LCS", stats: { mec: 72, tmf: 85, frm: 79, cmp: 85, map: 85, ldr: 86 } },
    // --- GV (Gravity) ---
    { id: 10815, name: "Hauntzer", role: "TOP", team: "GV", year: 2015, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 88, tmf: 87, frm: 92, cmp: 88, map: 87, ldr: 86 } },
    { id: 10816, name: "Move", role: "JNG", team: "GV", year: 2015, rating: 87, quality: "Platinum", region: "LCS", stats: { mec: 86, tmf: 90, frm: 85, cmp: 89, map: 90, ldr: 89 } },
    { id: 10817, name: "Keane", role: "MID", team: "GV", year: 2015, rating: 87, quality: "Platinum", region: "LCS", stats: { mec: 91, tmf: 87, frm: 88, cmp: 87, map: 89, ldr: 85 } },
    { id: 10818, name: "Altec", role: "ADC", team: "GV", year: 2015, rating: 90, quality: "Diamond", region: "LCS", stats: { mec: 96, tmf: 91, frm: 93, cmp: 88, map: 84, ldr: 87 } },
    { id: 10819, name: "BunnyFuFuu", role: "SUP", team: "GV", year: 2015, rating: 89, quality: "Platinum", region: "LCS", stats: { mec: 79, tmf: 90, frm: 87, cmp: 94, map: 94, ldr: 94 } },
    // --- T8 (Team 8) ---
    { id: 10820, name: "CaliTrlolz8", role: "TOP", team: "T8", year: 2015, rating: 84, quality: "Gold", region: "LCS", stats: { mec: 86, tmf: 83, frm: 88, cmp: 85, map: 80, ldr: 80 } },
    { id: 10821, name: "Porpoise8", role: "JNG", team: "T8", year: 2015, rating: 86, quality: "Platinum", region: "LCS", stats: { mec: 83, tmf: 87, frm: 82, cmp: 86, map: 90, ldr: 89 } },
    { id: 10822, name: "Slooshi8", role: "MID", team: "T8", year: 2015, rating: 81, quality: "Gold", region: "LCS", stats: { mec: 83, tmf: 81, frm: 81, cmp: 84, map: 79, ldr: 77 } },
    { id: 10823, name: "Maplestreet8", role: "ADC", team: "T8", year: 2015, rating: 81, quality: "Gold", region: "LCS", stats: { mec: 87, tmf: 78, frm: 82, cmp: 79, map: 75, ldr: 77 } },
    { id: 10824, name: "Dodo8", role: "SUP", team: "T8", year: 2015, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 79, tmf: 87, frm: 81, cmp: 86, map: 89, ldr: 91 } },
    // --- DIG (Dignitas) ---
    { id: 10825, name: "Gamsu", role: "TOP", team: "DIG", year: 2015, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 91, tmf: 88, frm: 90, cmp: 86, map: 83, ldr: 88 } },
    { id: 10826, name: "Helios", role: "JNG", team: "DIG", year: 2015, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 83, tmf: 86, frm: 83, cmp: 85, map: 89, ldr: 87 } },
    { id: 10827, name: "Shiphtur", role: "MID", team: "DIG", year: 2015, rating: 87, quality: "Platinum", region: "LCS", stats: { mec: 89, tmf: 90, frm: 87, cmp: 87, map: 87, ldr: 84 } },
    { id: 10828, name: "CoreJJ", role: "ADC", team: "DIG", year: 2015, rating: 89, quality: "Platinum", region: "LCS", stats: { mec: 94, tmf: 88, frm: 90, cmp: 85, map: 84, ldr: 88 } },
    { id: 10829, name: "KiWiKiD", role: "SUP", team: "DIG", year: 2015, rating: 86, quality: "Platinum", region: "LCS", stats: { mec: 76, tmf: 85, frm: 83, cmp: 90, map: 92, ldr: 91 } },
    // --- TDK (Team Dragon Knights) ---
    { id: 10830, name: "Seraph", role: "TOP", team: "TDK", year: 2015, rating: 82, quality: "Gold", region: "LCS", stats: { mec: 85, tmf: 83, frm: 87, cmp: 84, map: 78, ldr: 81 } },
    { id: 10831, name: "Kez", role: "JNG", team: "TDK", year: 2015, rating: 83, quality: "Gold", region: "LCS", stats: { mec: 80, tmf: 88, frm: 82, cmp: 84, map: 86, ldr: 86 } },
    { id: 10832, name: "Ninja", role: "MID", team: "TDK", year: 2015, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 87, tmf: 87, frm: 83, cmp: 85, map: 87, ldr: 84 } },
    { id: 10833, name: "Emperor", role: "ADC", team: "TDK", year: 2015, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 90, tmf: 82, frm: 86, cmp: 82, map: 82, ldr: 82 } },
    { id: 10834, name: "Smoothie", role: "SUP", team: "TDK", year: 2015, rating: 83, quality: "Gold", region: "LCS", stats: { mec: 74, tmf: 83, frm: 79, cmp: 85, map: 88, ldr: 85 } },
    // --- TIP (Team Impulse) ---
    { id: 10835, name: "Impact", role: "TOP", team: "TIP", year: 2015, rating: 91, quality: "Diamond", region: "LCS", stats: { mec: 92, tmf: 92, frm: 96, cmp: 89, map: 90, ldr: 87 } },
    { id: 10836, name: "Rush", role: "JNG", team: "TIP", year: 2015, rating: 90, quality: "Diamond", region: "LCS", stats: { mec: 87, tmf: 95, frm: 88, cmp: 93, map: 95, ldr: 93 } },
    { id: 10837, name: "Gate", role: "MID", team: "TIP", year: 2015, rating: 89, quality: "Platinum", region: "LCS", stats: { mec: 93, tmf: 92, frm: 90, cmp: 90, map: 88, ldr: 89 } },
    { id: 10838, name: "Apollo", role: "ADC", team: "TIP", year: 2015, rating: 93, quality: "Diamond", region: "LCS", stats: { mec: 98, tmf: 94, frm: 98, cmp: 90, map: 88, ldr: 88 } },
    { id: 10839, name: "Adrian", role: "SUP", team: "TIP", year: 2015, rating: 92, quality: "Diamond", region: "LCS", stats: { mec: 84, tmf: 93, frm: 90, cmp: 95, map: 98, ldr: 96 } },
    // --- TL (Team Liquid) ---
    { id: 10840, name: "Quas", role: "TOP", team: "TL", year: 2015, rating: 90, quality: "Diamond", region: "LCS", stats: { mec: 92, tmf: 89, frm: 93, cmp: 90, map: 85, ldr: 90 } },
    { id: 10841, name: "IWDominate", role: "JNG", team: "TL", year: 2015, rating: 91, quality: "Diamond", region: "LCS", stats: { mec: 87, tmf: 93, frm: 89, cmp: 90, map: 94, ldr: 90 } },
    { id: 10842, name: "FeniX", role: "MID", team: "TL", year: 2015, rating: 91, quality: "Diamond", region: "LCS", stats: { mec: 96, tmf: 92, frm: 90, cmp: 95, map: 93, ldr: 88 } },
    { id: 10843, name: "Piglet", role: "ADC", team: "TL", year: 2015, rating: 96, quality: "Grandmaster", region: "LCS", stats: { mec: 99, tmf: 97, frm: 99, cmp: 94, map: 94, ldr: 93 } },
    { id: 10844, name: "Xpecial", role: "SUP", team: "TL", year: 2015, rating: 91, quality: "Diamond", region: "LCS", stats: { mec: 84, tmf: 91, frm: 89, cmp: 92, map: 96, ldr: 93 } },
    // --- TSM (Team SoloMid) ---
    { id: 10845, name: "Dyrus", role: "TOP", team: "TSM", year: 2015, rating: 87, quality: "Platinum", region: "LCS", stats: { mec: 89, tmf: 84, frm: 90, cmp: 86, map: 83, ldr: 84 } },
    { id: 10846, name: "Santorin", role: "JNG", team: "TSM", year: 2015, rating: 95, quality: "Master", region: "LCS", stats: { mec: 92, tmf: 99, frm: 94, cmp: 97, map: 99, ldr: 96 } },
    { id: 10847, name: "Bjergsen", role: "MID", team: "TSM", year: 2015, rating: 89, quality: "Platinum", region: "LCS", stats: { mec: 93, tmf: 92, frm: 91, cmp: 92, map: 91, ldr: 89 } },
    { id: 10848, name: "WildTurtle", role: "ADC", team: "TSM", year: 2015, rating: 87, quality: "Platinum", region: "LCS", stats: { mec: 93, tmf: 86, frm: 88, cmp: 86, map: 84, ldr: 83 } },
    { id: 10849, name: "Lustboy", role: "SUP", team: "TSM", year: 2015, rating: 88, quality: "Platinum", region: "LCS", stats: { mec: 78, tmf: 91, frm: 86, cmp: 91, map: 95, ldr: 93 } },

    // ===== LCK 2016 Summer Season =====
    // Afreeca Freecs
    { id: 10300, name: "ikssu", role: "TOP", team: "AF", year: 2016, rating: 89, quality: "Platinum", region: "LCK", stats: { mec: 91, tmf: 88, frm: 91, cmp: 88, map: 88, ldr: 87 } },
    { id: 10301, name: "LirA", role: "JNG", team: "AF", year: 2016, rating: 89, quality: "Platinum", region: "LCK", stats: { mec: 85, tmf: 91, frm: 87, cmp: 90, map: 92, ldr: 88 } },
    { id: 10302, name: "Mickey", role: "MID", team: "AF", year: 2016, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 86, frm: 85, cmp: 87, map: 86, ldr: 85 } },
    { id: 10303, name: "Sangyoon", role: "ADC", team: "AF", year: 2016, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 91, tmf: 85, frm: 91, cmp: 84, map: 85, ldr: 85 } },
    { id: 10304, name: "SnowFlower", role: "SUP", team: "AF", year: 2016, rating: 88, quality: "Platinum", region: "LCK", stats: { mec: 82, tmf: 87, frm: 88, cmp: 90, map: 94, ldr: 91 } },
    // CJ Entus
    { id: 10305, name: "Untara", role: "TOP", team: "CJ", year: 2016, rating: 82, quality: "Gold", region: "LCK", stats: { mec: 82, tmf: 83, frm: 85, cmp: 80, map: 81, ldr: 78 } },
    { id: 10306, name: "Haru", role: "JNG", team: "CJ", year: 2016, rating: 82, quality: "Gold", region: "LCK", stats: { mec: 78, tmf: 85, frm: 79, cmp: 85, map: 84, ldr: 82 } },
    { id: 10307, name: "Bdd", role: "MID", team: "CJ", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 84, frm: 85, cmp: 87, map: 86, ldr: 85 } },
    { id: 10308, name: "Kramer", role: "ADC", team: "CJ", year: 2016, rating: 84, quality: "Gold", region: "LCK", stats: { mec: 87, tmf: 84, frm: 86, cmp: 83, map: 81, ldr: 81 } },
    { id: 10309, name: "MadLife", role: "SUP", team: "CJ", year: 2016, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 80, tmf: 86, frm: 86, cmp: 89, map: 90, ldr: 90 } },
    // ESC Ever
    { id: 10310, name: "Crazy", role: "TOP", team: "ESC", year: 2016, rating: 84, quality: "Gold", region: "LCK", stats: { mec: 86, tmf: 81, frm: 85, cmp: 82, map: 83, ldr: 82 } },
    { id: 10311, name: "Bless", role: "JNG", team: "ESC", year: 2016, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 83, tmf: 86, frm: 79, cmp: 84, map: 86, ldr: 82 } },
    { id: 10312, name: "Tempt", role: "MID", team: "ESC", year: 2016, rating: 84, quality: "Gold", region: "LCK", stats: { mec: 86, tmf: 87, frm: 85, cmp: 85, map: 86, ldr: 83 } },
    { id: 10313, name: "LokeN", role: "ADC", team: "ESC", year: 2016, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 88, tmf: 80, frm: 84, cmp: 80, map: 77, ldr: 79 } },
    { id: 10314, name: "Key", role: "SUP", team: "ESC", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 77, tmf: 88, frm: 83, cmp: 90, map: 92, ldr: 89 } },
    // Jin Air Green Wings
    { id: 10315, name: "TrAce", role: "TOP", team: "JAG", year: 2016, rating: 83, quality: "Gold", region: "LCK", stats: { mec: 85, tmf: 84, frm: 85, cmp: 81, map: 79, ldr: 81 } },
    { id: 10316, name: "Winged", role: "JNG", team: "JAG", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 85, tmf: 88, frm: 82, cmp: 86, map: 88, ldr: 86 } },
    { id: 10317, name: "Kuzan", role: "MID", team: "JAG", year: 2016, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 90, tmf: 87, frm: 85, cmp: 90, map: 84, ldr: 85 } },
    { id: 10318, name: "Pilot", role: "ADC", team: "JAG", year: 2016, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 93, tmf: 88, frm: 88, cmp: 87, map: 81, ldr: 82 } },
    { id: 10319, name: "Chei", role: "SUP", team: "JAG", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 77, tmf: 87, frm: 81, cmp: 89, map: 90, ldr: 87 } },
    // KT Rolster
    { id: 10320, name: "Ssumday", role: "TOP", team: "KT", year: 2016, rating: 93, quality: "Diamond", region: "LCK", stats: { mec: 97, tmf: 93, frm: 94, cmp: 94, map: 90, ldr: 90 } },
    { id: 10321, name: "Score", role: "JNG", team: "KT", year: 2016, rating: 93, quality: "Diamond", region: "LCK", stats: { mec: 92, tmf: 95, frm: 92, cmp: 92, map: 98, ldr: 92 } },
    { id: 10322, name: "Fly", role: "MID", team: "KT", year: 2016, rating: 90, quality: "Diamond", region: "LCK", stats: { mec: 95, tmf: 93, frm: 91, cmp: 90, map: 92, ldr: 90 } },
    { id: 10323, name: "Arrow", role: "ADC", team: "KT", year: 2016, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 95, tmf: 92, frm: 95, cmp: 90, map: 89, ldr: 90 } },
    { id: 10324, name: "Hachani", role: "SUP", team: "KT", year: 2016, rating: 90, quality: "Diamond", region: "LCK", stats: { mec: 84, tmf: 91, frm: 88, cmp: 92, map: 94, ldr: 93 } },
    // Longzhu Gaming
    { id: 10325, name: "Expession", role: "TOP", team: "LZ", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 89, tmf: 84, frm: 86, cmp: 86, map: 81, ldr: 83 } },
    { id: 10326, name: "Chaser", role: "JNG", team: "LZ", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 84, tmf: 90, frm: 82, cmp: 87, map: 89, ldr: 84 } },
    { id: 10327, name: "Coco", role: "MID", team: "LZ", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 90, tmf: 84, frm: 87, cmp: 86, map: 83, ldr: 82 } },
    { id: 10328, name: "Fury", role: "ADC", team: "LZ", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 91, tmf: 83, frm: 86, cmp: 82, map: 79, ldr: 83 } },
    { id: 10329, name: "Pure", role: "SUP", team: "LZ", year: 2016, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 80, tmf: 88, frm: 83, cmp: 88, map: 91, ldr: 90 } },
    // MVP
    { id: 10330, name: "ADD", role: "TOP", team: "MVP2016", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 85, tmf: 82, frm: 87, cmp: 83, map: 82, ldr: 82 } },
    { id: 10331, name: "Beyond", role: "JNG", team: "MVP2016", year: 2016, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 82, tmf: 88, frm: 83, cmp: 88, map: 92, ldr: 89 } },
    { id: 10332, name: "Ian", role: "MID", team: "MVP2016", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 87, tmf: 88, frm: 83, cmp: 86, map: 86, ldr: 81 } },
    { id: 10333, name: "MaHa", role: "ADC", team: "MVP2016", year: 2016, rating: 82, quality: "Gold", region: "LCK", stats: { mec: 88, tmf: 79, frm: 84, cmp: 79, map: 76, ldr: 78 } },
    { id: 10334, name: "Max", role: "SUP", team: "MVP2016", year: 2016, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 79, tmf: 87, frm: 85, cmp: 89, map: 93, ldr: 90 } },
    // ROX Tigers
    { id: 10335, name: "Smeb", role: "TOP", team: "ROX", year: 2016, rating: 94, quality: "Master", region: "LCK", stats: { mec: 98, tmf: 93, frm: 98, cmp: 93, map: 91, ldr: 93 } },
    { id: 10336, name: "Peanut", role: "JNG", team: "ROX", year: 2016, rating: 93, quality: "Diamond", region: "LCK", stats: { mec: 93, tmf: 95, frm: 91, cmp: 92, map: 98, ldr: 94 } },
    { id: 10337, name: "Kuro", role: "MID", team: "ROX", year: 2016, rating: 94, quality: "Master", region: "LCK", stats: { mec: 95, tmf: 94, frm: 95, cmp: 94, map: 96, ldr: 94 } },
    { id: 10338, name: "PraY", role: "ADC", team: "ROX", year: 2016, rating: 90, quality: "Diamond", region: "LCK", stats: { mec: 96, tmf: 90, frm: 94, cmp: 90, map: 86, ldr: 88 } },
    { id: 10339, name: "GorillA", role: "SUP", team: "ROX", year: 2016, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 84, tmf: 92, frm: 89, cmp: 96, map: 97, ldr: 94 } },
    // Samsung Galaxy
    { id: 10340, name: "CuVee", role: "TOP", team: "SSG", year: 2016, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 86, tmf: 85, frm: 87, cmp: 86, map: 84, ldr: 85 } },
    { id: 10341, name: "Ambition", role: "JNG", team: "SSG", year: 2016, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 85, tmf: 89, frm: 82, cmp: 89, map: 89, ldr: 86 } },
    { id: 10342, name: "Crown", role: "MID", team: "SSG", year: 2016, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 87, tmf: 88, frm: 86, cmp: 86, map: 86, ldr: 82 } },
    { id: 10343, name: "Ruler", role: "ADC", team: "SSG", year: 2016, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 93, tmf: 84, frm: 91, cmp: 86, map: 82, ldr: 82 } },
    { id: 10344, name: "CoreJJ", role: "SUP", team: "SSG", year: 2016, rating: 81, quality: "Gold", region: "LCK", stats: { mec: 74, tmf: 83, frm: 78, cmp: 85, map: 84, ldr: 83 } },
    // SK Telecom T1
    { id: 10345, name: "Duke", role: "TOP", team: "SKT", year: 2016, rating: 89, quality: "Platinum", region: "LCK", stats: { mec: 89, tmf: 89, frm: 94, cmp: 90, map: 88, ldr: 88 } },
    { id: 10346, name: "Bengi", role: "JNG", team: "SKT", year: 2016, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 86, tmf: 90, frm: 83, cmp: 88, map: 91, ldr: 89 } },
    { id: 10347, name: "Faker", role: "MID", team: "SKT", year: 2016, rating: 89, quality: "Platinum", region: "LCK", stats: { mec: 94, tmf: 90, frm: 89, cmp: 89, map: 88, ldr: 89 } },
    { id: 10348, name: "Bang", role: "ADC", team: "SKT", year: 2016, rating: 94, quality: "Master", region: "LCK", stats: { mec: 98, tmf: 91, frm: 99, cmp: 91, map: 90, ldr: 91 } },
    { id: 10349, name: "Wolf", role: "SUP", team: "SKT", year: 2016, rating: 91, quality: "Diamond", region: "LCK", stats: { mec: 81, tmf: 93, frm: 87, cmp: 96, map: 94, ldr: 96 } },

    // ===== LPL 2016 Summer Season =====
    // Edward Gaming
    { id: 10400, name: "Mouse", role: "TOP", team: "EDG", year: 2016, rating: 93, quality: "Diamond", region: "LPL", stats: { mec: 97, tmf: 91, frm: 96, cmp: 94, map: 92, ldr: 89 } },
    { id: 10401, name: "Clearlove", role: "JNG", team: "EDG", year: 2016, rating: 96, quality: "Grandmaster", region: "LPL", stats: { mec: 94, tmf: 99, frm: 94, cmp: 97, map: 99, ldr: 95 } },
    { id: 10402, name: "Scout", role: "MID", team: "EDG", year: 2016, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 93, tmf: 94, frm: 93, cmp: 92, map: 93, ldr: 89 } },
    { id: 10403, name: "Deft", role: "ADC", team: "EDG", year: 2016, rating: 94, quality: "Master", region: "LPL", stats: { mec: 96, tmf: 95, frm: 97, cmp: 91, map: 92, ldr: 92 } },
    { id: 10404, name: "Meiko", role: "SUP", team: "EDG", year: 2016, rating: 96, quality: "Grandmaster", region: "LPL", stats: { mec: 86, tmf: 99, frm: 94, cmp: 98, map: 99, ldr: 99 } },
    // Game Talents
    { id: 10405, name: "GimGoon", role: "TOP", team: "GT", year: 2016, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 90, tmf: 83, frm: 89, cmp: 84, map: 84, ldr: 86 } },
    { id: 10406, name: "WuShuang", role: "JNG", team: "GT", year: 2016, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 80, tmf: 87, frm: 80, cmp: 85, map: 86, ldr: 86 } },
    { id: 10407, name: "Republic", role: "MID", team: "GT", year: 2016, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 92, tmf: 90, frm: 88, cmp: 91, map: 88, ldr: 85 } },
    { id: 10408, name: "PentaQ", role: "ADC", team: "GT", year: 2016, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 87, tmf: 80, frm: 88, cmp: 82, map: 77, ldr: 79 } },
    { id: 10409, name: "Savoki", role: "SUP", team: "GT", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 75, tmf: 86, frm: 84, cmp: 89, map: 92, ldr: 88 } },
    // I May
    { id: 10410, name: "AmazingJ", role: "TOP", team: "IM2016", year: 2016, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 93, tmf: 88, frm: 94, cmp: 91, map: 87, ldr: 88 } },
    { id: 10411, name: "Avoidless", role: "JNG", team: "IM2016", year: 2016, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 92, frm: 83, cmp: 91, map: 94, ldr: 91 } },
    { id: 10412, name: "Athena", role: "MID", team: "IM2016", year: 2016, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 92, tmf: 91, frm: 89, cmp: 91, map: 93, ldr: 88 } },
    { id: 10413, name: "Jinjiao", role: "ADC", team: "IM2016", year: 2016, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 94, tmf: 87, frm: 89, cmp: 86, map: 85, ldr: 83 } },
    { id: 10414, name: "Road", role: "SUP", team: "IM2016", year: 2016, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 77, tmf: 85, frm: 86, cmp: 90, map: 92, ldr: 89 } },
    // Invictus Gaming
    { id: 10415, name: "Zz1tai", role: "TOP", team: "IG", year: 2016, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 84, frm: 91, cmp: 85, map: 86, ldr: 83 } },
    { id: 10416, name: "Kid", role: "JNG", team: "IG", year: 2016, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 82, tmf: 87, frm: 79, cmp: 84, map: 86, ldr: 87 } },
    { id: 10417, name: "Rookie", role: "MID", team: "IG", year: 2016, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 88, frm: 85, cmp: 88, map: 87, ldr: 85 } },
    { id: 10418, name: "Rain", role: "ADC", team: "IG", year: 2016, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 85, tmf: 79, frm: 87, cmp: 78, map: 79, ldr: 81 } },
    { id: 10419, name: "Tabe", role: "SUP", team: "IG", year: 2016, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 78, tmf: 89, frm: 84, cmp: 87, map: 89, ldr: 92 } },
    // LGD Gaming
    { id: 10420, name: "MaRin", role: "TOP", team: "LGD", year: 2016, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 83, tmf: 81, frm: 86, cmp: 82, map: 82, ldr: 80 } },
    { id: 10421, name: "Eimy", role: "JNG", team: "LGD", year: 2016, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 83, tmf: 84, frm: 80, cmp: 83, map: 87, ldr: 85 } },
    { id: 10422, name: "Punished", role: "MID", team: "LGD", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 87, frm: 83, cmp: 86, map: 87, ldr: 83 } },
    { id: 10423, name: "imp", role: "ADC", team: "LGD", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 89, tmf: 84, frm: 89, cmp: 84, map: 83, ldr: 83 } },
    { id: 10424, name: "Pyl", role: "SUP", team: "LGD", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 75, tmf: 85, frm: 82, cmp: 87, map: 89, ldr: 88 } },
    // Newbee
    { id: 10425, name: "V", role: "TOP", team: "NB", year: 2016, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 86, frm: 91, cmp: 89, map: 83, ldr: 84 } },
    { id: 10426, name: "Swift", role: "JNG", team: "NB", year: 2016, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 84, tmf: 89, frm: 81, cmp: 84, map: 87, ldr: 86 } },
    { id: 10427, name: "dade", role: "MID", team: "NB", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 85, frm: 84, cmp: 85, map: 85, ldr: 85 } },
    { id: 10428, name: "HappyY", role: "ADC", team: "NB", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 91, tmf: 86, frm: 86, cmp: 82, map: 79, ldr: 82 } },
    { id: 10429, name: "MorZB", role: "SUP", team: "NB", year: 2016, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 74, tmf: 85, frm: 82, cmp: 84, map: 89, ldr: 85 } },
    // Oh My God
    { id: 10430, name: "xiyang", role: "TOP", team: "OMG", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 85, frm: 86, cmp: 86, map: 82, ldr: 82 } },
    { id: 10431, name: "juejue", role: "JNG", team: "OMG", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 83, tmf: 90, frm: 80, cmp: 85, map: 91, ldr: 87 } },
    { id: 10432, name: "icon", role: "MID", team: "OMG", year: 2016, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 86, tmf: 83, frm: 81, cmp: 87, map: 85, ldr: 80 } },
    { id: 10433, name: "S1mlz", role: "ADC", team: "OMG", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 91, tmf: 86, frm: 90, cmp: 85, map: 79, ldr: 83 } },
    { id: 10434, name: "five", role: "SUP", team: "OMG", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 76, tmf: 85, frm: 82, cmp: 87, map: 88, ldr: 91 } },
    // Royal Never Give Up
    { id: 10435, name: "Looper", role: "TOP", team: "RNG", year: 2016, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 92, tmf: 89, frm: 91, cmp: 87, map: 84, ldr: 88 } },
    { id: 10436, name: "Mlxg", role: "JNG", team: "RNG", year: 2016, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 90, tmf: 96, frm: 90, cmp: 91, map: 93, ldr: 94 } },
    { id: 10437, name: "xiaohu", role: "MID", team: "RNG", year: 2016, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 94, tmf: 90, frm: 89, cmp: 93, map: 88, ldr: 87 } },
    { id: 10438, name: "Uzi", role: "ADC", team: "RNG", year: 2016, rating: 93, quality: "Diamond", region: "LPL", stats: { mec: 96, tmf: 91, frm: 97, cmp: 93, map: 87, ldr: 88 } },
    { id: 10439, name: "Mata", role: "SUP", team: "RNG", year: 2016, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 85, tmf: 91, frm: 88, cmp: 92, map: 96, ldr: 96 } },
    // Saint Gaming
    { id: 10440, name: "Acorn", role: "TOP", team: "SAT", year: 2016, rating: 80, quality: "Gold", region: "LPL", stats: { mec: 80, tmf: 79, frm: 81, cmp: 82, map: 79, ldr: 77 } },
    { id: 10441, name: "chimin", role: "JNG", team: "SAT", year: 2016, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 81, tmf: 87, frm: 82, cmp: 87, map: 88, ldr: 84 } },
    { id: 10442, name: "Otto", role: "MID", team: "SAT", year: 2016, rating: 79, quality: "Silver", region: "LPL", stats: { mec: 84, tmf: 78, frm: 77, cmp: 79, map: 79, ldr: 77 } },
    { id: 10443, name: "xQ", role: "ADC", team: "SAT", year: 2016, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 83, tmf: 82, frm: 82, cmp: 79, map: 75, ldr: 80 } },
    { id: 10444, name: "x1u", role: "SUP", team: "SAT", year: 2016, rating: 80, quality: "Gold", region: "LPL", stats: { mec: 72, tmf: 79, frm: 80, cmp: 84, map: 86, ldr: 84 } },
    // Snake eSports
    { id: 10445, name: "Flandre", role: "TOP", team: "Snake", year: 2016, rating: 85, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 85, frm: 87, cmp: 84, map: 81, ldr: 81 } },
    { id: 10446, name: "SofM", role: "JNG", team: "Snake", year: 2016, rating: 89, quality: "Platinum", region: "LPL", stats: { mec: 88, tmf: 93, frm: 85, cmp: 90, map: 93, ldr: 89 } },
    { id: 10447, name: "TANK", role: "MID", team: "Snake", year: 2016, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 92, tmf: 91, frm: 89, cmp: 94, map: 91, ldr: 90 } },
    { id: 10448, name: "Martin", role: "ADC", team: "Snake", year: 2016, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 93, tmf: 89, frm: 93, cmp: 87, map: 84, ldr: 86 } },
    { id: 10449, name: "Jiezou", role: "SUP", team: "Snake", year: 2016, rating: 89, quality: "Platinum", region: "LPL", stats: { mec: 79, tmf: 89, frm: 87, cmp: 91, map: 92, ldr: 93 } },
    // Team WE
    { id: 10450, name: "957", role: "TOP", team: "WE", year: 2016, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 94, tmf: 90, frm: 94, cmp: 89, map: 87, ldr: 90 } },
    { id: 10451, name: "Condi", role: "JNG", team: "WE", year: 2016, rating: 89, quality: "Platinum", region: "LPL", stats: { mec: 89, tmf: 90, frm: 85, cmp: 90, map: 91, ldr: 92 } },
    { id: 10452, name: "xiye", role: "MID", team: "WE", year: 2016, rating: 89, quality: "Platinum", region: "LPL", stats: { mec: 93, tmf: 88, frm: 88, cmp: 91, map: 88, ldr: 87 } },
    { id: 10453, name: "Mystic", role: "ADC", team: "WE", year: 2016, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 93, tmf: 90, frm: 94, cmp: 90, map: 88, ldr: 89 } },
    { id: 10454, name: "Zero", role: "SUP", team: "WE", year: 2016, rating: 89, quality: "Platinum", region: "LPL", stats: { mec: 82, tmf: 91, frm: 88, cmp: 90, map: 92, ldr: 92 } },
    // Vici Gaming
    { id: 10455, name: "Loong", role: "TOP", team: "VG", year: 2016, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 91, tmf: 88, frm: 90, cmp: 90, map: 86, ldr: 88 } },
    { id: 10456, name: "DanDy", role: "JNG", team: "VG", year: 2016, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 86, tmf: 92, frm: 84, cmp: 89, map: 93, ldr: 87 } },
    { id: 10457, name: "Easyhoon", role: "MID", team: "VG", year: 2016, rating: 88, quality: "Platinum", region: "LPL", stats: { mec: 92, tmf: 90, frm: 88, cmp: 92, map: 86, ldr: 87 } },
    { id: 10458, name: "XuanXuanPi", role: "ADC", team: "VG", year: 2016, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 90, tmf: 84, frm: 91, cmp: 87, map: 82, ldr: 82 } },
    { id: 10459, name: "caveMan", role: "SUP", team: "VG", year: 2016, rating: 90, quality: "Diamond", region: "LPL", stats: { mec: 83, tmf: 93, frm: 87, cmp: 91, map: 94, ldr: 95 } },

    // ===== EU LCS 2016 Summer Season =====
    // FC Schalke 04
    { id: 10500, name: "Steve", role: "TOP", team: "S04", year: 2016, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 86, tmf: 84, frm: 91, cmp: 85, map: 85, ldr: 84 } },
    { id: 10501, name: "Gilius", role: "JNG", team: "S04", year: 2016, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 88, frm: 80, cmp: 84, map: 89, ldr: 83 } },
    { id: 10502, name: "Fox", role: "MID", team: "S04", year: 2016, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 92, tmf: 91, frm: 89, cmp: 92, map: 90, ldr: 87 } },
    { id: 10503, name: "MrRalleZ", role: "ADC", team: "S04", year: 2016, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 85, frm: 90, cmp: 83, map: 81, ldr: 85 } },
    { id: 10504, name: "sprattel", role: "SUP", team: "S04", year: 2016, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 78, tmf: 87, frm: 87, cmp: 90, map: 95, ldr: 90 } },
    // Fnatic
    { id: 10505, name: "Gamsu", role: "TOP", team: "FNC", year: 2016, rating: 90, quality: "Diamond", region: "LEC", stats: { mec: 91, tmf: 87, frm: 95, cmp: 88, map: 88, ldr: 89 } },
    { id: 10506, name: "Spirit", role: "JNG", team: "FNC", year: 2016, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 92, frm: 86, cmp: 90, map: 95, ldr: 91 } },
    { id: 10507, name: "Febiven", role: "MID", team: "FNC", year: 2016, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 90, tmf: 90, frm: 90, cmp: 91, map: 90, ldr: 88 } },
    { id: 10508, name: "Rekkles", role: "ADC", team: "FNC", year: 2016, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 90, tmf: 89, frm: 92, cmp: 85, map: 83, ldr: 87 } },
    { id: 10509, name: "YellOwStaR", role: "SUP", team: "FNC", year: 2016, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 81, tmf: 89, frm: 87, cmp: 93, map: 94, ldr: 90 } },
    // G2 Esports
    { id: 10510, name: "Expect", role: "TOP", team: "G2", year: 2016, rating: 93, quality: "Diamond", region: "LEC", stats: { mec: 97, tmf: 92, frm: 98, cmp: 93, map: 92, ldr: 92 } },
    { id: 10511, name: "Trick", role: "JNG", team: "G2", year: 2016, rating: 94, quality: "Master", region: "LEC", stats: { mec: 91, tmf: 96, frm: 90, cmp: 95, map: 99, ldr: 93 } },
    { id: 10512, name: "Perkz", role: "MID", team: "G2", year: 2016, rating: 91, quality: "Diamond", region: "LEC", stats: { mec: 95, tmf: 92, frm: 91, cmp: 93, map: 92, ldr: 89 } },
    { id: 10513, name: "Zven", role: "ADC", team: "G2", year: 2016, rating: 91, quality: "Diamond", region: "LEC", stats: { mec: 93, tmf: 91, frm: 92, cmp: 91, map: 87, ldr: 88 } },
    { id: 10514, name: "Mithy", role: "SUP", team: "G2", year: 2016, rating: 94, quality: "Master", region: "LEC", stats: { mec: 84, tmf: 95, frm: 94, cmp: 98, map: 99, ldr: 96 } },
    // Giants Gaming
    { id: 10515, name: "Smittyj", role: "TOP", team: "GIA", year: 2016, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 90, tmf: 90, frm: 93, cmp: 89, map: 87, ldr: 87 } },
    { id: 10516, name: "Maxlore", role: "JNG", team: "GIA", year: 2016, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 91, frm: 84, cmp: 89, map: 91, ldr: 86 } },
    { id: 10517, name: "Night", role: "MID", team: "GIA", year: 2016, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 94, tmf: 91, frm: 89, cmp: 91, map: 88, ldr: 89 } },
    { id: 10518, name: "S0NSTAR", role: "ADC", team: "GIA", year: 2016, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 91, tmf: 85, frm: 89, cmp: 88, map: 82, ldr: 83 } },
    { id: 10519, name: "Hustlin", role: "SUP", team: "GIA", year: 2016, rating: 90, quality: "Diamond", region: "LEC", stats: { mec: 83, tmf: 92, frm: 90, cmp: 94, map: 94, ldr: 96 } },
    // H2k-Gaming
    { id: 10520, name: "Odoamne", role: "TOP", team: "H2K", year: 2016, rating: 90, quality: "Diamond", region: "LEC", stats: { mec: 93, tmf: 88, frm: 95, cmp: 89, map: 86, ldr: 87 } },
    { id: 10521, name: "Jankos", role: "JNG", team: "H2K", year: 2016, rating: 91, quality: "Diamond", region: "LEC", stats: { mec: 91, tmf: 93, frm: 86, cmp: 90, map: 94, ldr: 94 } },
    { id: 10522, name: "Ryu", role: "MID", team: "H2K", year: 2016, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 89, frm: 88, cmp: 88, map: 86, ldr: 87 } },
    { id: 10523, name: "FORG1VEN", role: "ADC", team: "H2K", year: 2016, rating: 91, quality: "Diamond", region: "LEC", stats: { mec: 95, tmf: 90, frm: 96, cmp: 88, map: 86, ldr: 87 } },
    { id: 10524, name: "Vander", role: "SUP", team: "H2K", year: 2016, rating: 89, quality: "Platinum", region: "LEC", stats: { mec: 79, tmf: 91, frm: 85, cmp: 90, map: 93, ldr: 94 } },
    // Origen
    { id: 10525, name: "sOAZ", role: "TOP", team: "OG", year: 2016, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 84, tmf: 81, frm: 86, cmp: 81, map: 81, ldr: 82 } },
    { id: 10526, name: "Amazing", role: "JNG", team: "OG", year: 2016, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 82, tmf: 85, frm: 80, cmp: 83, map: 88, ldr: 85 } },
    { id: 10527, name: "PowerOfEvil", role: "MID", team: "OG", year: 2016, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 87, tmf: 81, frm: 82, cmp: 82, map: 83, ldr: 81 } },
    { id: 10528, name: "xPeke", role: "ADC", team: "OG", year: 2016, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 85, tmf: 79, frm: 84, cmp: 79, map: 77, ldr: 76 } },
    { id: 10529, name: "Hybrid", role: "SUP", team: "OG", year: 2016, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 73, tmf: 82, frm: 80, cmp: 86, map: 90, ldr: 87 } },
    // Splyce
    { id: 10530, name: "Wunder", role: "TOP", team: "SPY", year: 2016, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 91, tmf: 88, frm: 90, cmp: 90, map: 85, ldr: 85 } },
    { id: 10531, name: "Trashy", role: "JNG", team: "SPY", year: 2016, rating: 92, quality: "Diamond", region: "LEC", stats: { mec: 91, tmf: 94, frm: 91, cmp: 93, map: 95, ldr: 92 } },
    { id: 10532, name: "Sencux", role: "MID", team: "SPY", year: 2016, rating: 91, quality: "Diamond", region: "LEC", stats: { mec: 96, tmf: 93, frm: 89, cmp: 93, map: 89, ldr: 90 } },
    { id: 10533, name: "Kobbe", role: "ADC", team: "SPY", year: 2016, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 93, tmf: 86, frm: 93, cmp: 88, map: 82, ldr: 85 } },
    { id: 10534, name: "Mikyx", role: "SUP", team: "SPY", year: 2016, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 80, tmf: 89, frm: 83, cmp: 90, map: 92, ldr: 93 } },
    // Team ROCCAT
    { id: 10535, name: "Parang", role: "TOP", team: "ROC", year: 2016, rating: 81, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 82, frm: 84, cmp: 80, map: 76, ldr: 79 } },
    { id: 10536, name: "Airwaks", role: "JNG", team: "ROC", year: 2016, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 82, tmf: 86, frm: 77, cmp: 83, map: 86, ldr: 82 } },
    { id: 10537, name: "Betsy", role: "MID", team: "ROC", year: 2016, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 86, tmf: 81, frm: 82, cmp: 85, map: 80, ldr: 82 } },
    { id: 10538, name: "Steeelback", role: "ADC", team: "ROC", year: 2016, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 90, tmf: 84, frm: 86, cmp: 85, map: 82, ldr: 82 } },
    { id: 10539, name: "Raise", role: "SUP", team: "ROC", year: 2016, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 75, tmf: 83, frm: 82, cmp: 83, map: 85, ldr: 88 } },
    // Team Vitality
    { id: 10540, name: "Cabochard", role: "TOP", team: "VIT", year: 2016, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 86, frm: 89, cmp: 86, map: 86, ldr: 85 } },
    { id: 10541, name: "Shook", role: "JNG", team: "VIT", year: 2016, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 84, tmf: 88, frm: 82, cmp: 86, map: 89, ldr: 84 } },
    { id: 10542, name: "Nukeduck", role: "MID", team: "VIT", year: 2016, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 89, frm: 87, cmp: 86, map: 86, ldr: 82 } },
    { id: 10543, name: "Police", role: "ADC", team: "VIT", year: 2016, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 92, tmf: 88, frm: 92, cmp: 83, map: 81, ldr: 86 } },
    { id: 10544, name: "KaSing", role: "SUP", team: "VIT", year: 2016, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 76, tmf: 85, frm: 82, cmp: 91, map: 93, ldr: 89 } },
    // Unicorns of Love
    { id: 10545, name: "Vizicsacsi", role: "TOP", team: "UOL", year: 2016, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 83, tmf: 82, frm: 87, cmp: 81, map: 81, ldr: 81 } },
    { id: 10546, name: "Move", role: "JNG", team: "UOL", year: 2016, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 84, tmf: 89, frm: 81, cmp: 84, map: 89, ldr: 85 } },
    { id: 10547, name: "Exileh", role: "MID", team: "UOL", year: 2016, rating: 83, quality: "Gold", region: "LEC", stats: { mec: 87, tmf: 85, frm: 82, cmp: 85, map: 85, ldr: 79 } },
    { id: 10548, name: "Veritas", role: "ADC", team: "UOL", year: 2016, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 83, frm: 89, cmp: 83, map: 79, ldr: 80 } },
    { id: 10549, name: "Hylissang", role: "SUP", team: "UOL", year: 2016, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 75, tmf: 86, frm: 80, cmp: 85, map: 90, ldr: 87 } },

    // --- 2016 LCK COACHES ---
    { id: 10850, name: "kkOma", role: "COACH", team: "SKT", year: 2016, rating: 95, quality: "Master", region: "LCK", stats: { mec: 25, tmf: 95, frm: 96, cmp: 95, map: 97, ldr: 98 } },
    { id: 10851, name: "NoFe", role: "COACH", team: "ROX", year: 2016, rating: 93, quality: "Diamond", region: "LCK", stats: { mec: 28, tmf: 93, frm: 92, cmp: 93, map: 95, ldr: 96 } },
    { id: 10852, name: "Lee Ji-hoon", role: "COACH", team: "KT", year: 2016, rating: 88, quality: "Platinum", region: "LCK", stats: { mec: 24, tmf: 87, frm: 88, cmp: 87, map: 90, ldr: 91 } },
    { id: 10853, name: "Edgar", role: "COACH", team: "SSG", year: 2016, rating: 90, quality: "Diamond", region: "LCK", stats: { mec: 26, tmf: 90, frm: 91, cmp: 89, map: 92, ldr: 93 } },
    { id: 10854, name: "OnAir", role: "COACH", team: "AF", year: 2016, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 23, tmf: 84, frm: 85, cmp: 84, map: 87, ldr: 88 } },
    { id: 10855, name: "Reach", role: "COACH", team: "CJ", year: 2016, rating: 82, quality: "Gold", region: "LCK", stats: { mec: 22, tmf: 81, frm: 82, cmp: 81, map: 84, ldr: 85 } },
    { id: 10856, name: "Kim Ga-ram", role: "COACH", team: "ESC", year: 2016, rating: 80, quality: "Gold", region: "LCK", stats: { mec: 22, tmf: 79, frm: 80, cmp: 79, map: 82, ldr: 83 } },
    { id: 10857, name: "Han Sang-yong", role: "COACH", team: "JAG", year: 2016, rating: 80, quality: "Gold", region: "LCK", stats: { mec: 23, tmf: 79, frm: 80, cmp: 79, map: 82, ldr: 83 } },
    { id: 10858, name: "Hirai", role: "COACH", team: "LZ", year: 2016, rating: 82, quality: "Gold", region: "LCK", stats: { mec: 24, tmf: 81, frm: 82, cmp: 81, map: 84, ldr: 85 } },
    { id: 10859, name: "Hell", role: "COACH", team: "MVP2016", year: 2016, rating: 81, quality: "Gold", region: "LCK", stats: { mec: 22, tmf: 80, frm: 81, cmp: 80, map: 83, ldr: 84 } },

    // --- 2016 LPL COACHES ---
    { id: 10860, name: "Aaron", role: "COACH", team: "EDG", year: 2016, rating: 93, quality: "Diamond", region: "LPL", stats: { mec: 27, tmf: 93, frm: 92, cmp: 93, map: 95, ldr: 96 } },
    { id: 10861, name: "Firefox", role: "COACH", team: "RNG", year: 2016, rating: 91, quality: "Diamond", region: "LPL", stats: { mec: 25, tmf: 90, frm: 91, cmp: 90, map: 93, ldr: 94 } },
    { id: 10862, name: "U4", role: "COACH", team: "Snake", year: 2016, rating: 84, quality: "Gold", region: "LPL", stats: { mec: 24, tmf: 83, frm: 84, cmp: 83, map: 86, ldr: 87 } },
    { id: 10863, name: "Homme", role: "COACH", team: "WE", year: 2016, rating: 86, quality: "Platinum", region: "LPL", stats: { mec: 25, tmf: 85, frm: 86, cmp: 85, map: 88, ldr: 89 } },
    { id: 10864, name: "San", role: "COACH", team: "OMG", year: 2016, rating: 82, quality: "Gold", region: "LPL", stats: { mec: 23, tmf: 81, frm: 82, cmp: 81, map: 84, ldr: 85 } },
    { id: 10865, name: "Chris", role: "COACH", team: "IG", year: 2016, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 24, tmf: 82, frm: 83, cmp: 82, map: 85, ldr: 86 } },
    { id: 10866, name: "Homme2", role: "COACH", team: "LGD", year: 2016, rating: 81, quality: "Gold", region: "LPL", stats: { mec: 22, tmf: 80, frm: 81, cmp: 80, map: 83, ldr: 84 } },
    { id: 10867, name: "Heart", role: "COACH", team: "VG", year: 2016, rating: 80, quality: "Gold", region: "LPL", stats: { mec: 23, tmf: 79, frm: 80, cmp: 79, map: 82, ldr: 83 } },
    { id: 10868, name: "Dan", role: "COACH", team: "NB", year: 2016, rating: 78, quality: "Silver", region: "LPL", stats: { mec: 22, tmf: 77, frm: 78, cmp: 77, map: 80, ldr: 81 } },
    { id: 10869, name: "Baiyu", role: "COACH", team: "GT", year: 2016, rating: 78, quality: "Silver", region: "LPL", stats: { mec: 22, tmf: 77, frm: 78, cmp: 77, map: 80, ldr: 81 } },
    { id: 10870, name: "Maokai", role: "COACH", team: "IM2016", year: 2016, rating: 83, quality: "Gold", region: "LPL", stats: { mec: 24, tmf: 82, frm: 83, cmp: 82, map: 85, ldr: 86 } },
    { id: 10871, name: "JuFeng", role: "COACH", team: "SAT", year: 2016, rating: 78, quality: "Silver", region: "LPL", stats: { mec: 22, tmf: 77, frm: 78, cmp: 77, map: 80, ldr: 81 } },

    // --- 2016 EU LCS COACHES ---
    { id: 10872, name: "YoungBuck", role: "COACH", team: "G2", year: 2016, rating: 91, quality: "Diamond", region: "LEC", stats: { mec: 30, tmf: 90, frm: 91, cmp: 90, map: 93, ldr: 94 } },
    { id: 10873, name: "Pr0lly", role: "COACH", team: "H2K", year: 2016, rating: 90, quality: "Diamond", region: "LEC", stats: { mec: 28, tmf: 89, frm: 90, cmp: 89, map: 92, ldr: 93 } },
    { id: 10874, name: "Deilor", role: "COACH", team: "FNC", year: 2016, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 26, tmf: 85, frm: 86, cmp: 85, map: 88, ldr: 89 } },
    { id: 10875, name: "YamatoCannon", role: "COACH", team: "SPY", year: 2016, rating: 88, quality: "Platinum", region: "LEC", stats: { mec: 27, tmf: 87, frm: 88, cmp: 87, map: 90, ldr: 91 } },
    { id: 10876, name: "Sheepy", role: "COACH", team: "UOL", year: 2016, rating: 84, quality: "Gold", region: "LEC", stats: { mec: 24, tmf: 83, frm: 84, cmp: 83, map: 86, ldr: 87 } },
    { id: 10877, name: "Shaunz", role: "COACH", team: "VIT", year: 2016, rating: 82, quality: "Gold", region: "LEC", stats: { mec: 23, tmf: 81, frm: 82, cmp: 81, map: 84, ldr: 85 } },
    { id: 10878, name: "Peke", role: "COACH", team: "OG", year: 2016, rating: 80, quality: "Gold", region: "LEC", stats: { mec: 35, tmf: 79, frm: 80, cmp: 79, map: 82, ldr: 83 } },
    { id: 10879, name: "Nelson", role: "COACH", team: "GIA", year: 2016, rating: 79, quality: "Silver", region: "LEC", stats: { mec: 23, tmf: 78, frm: 79, cmp: 78, map: 81, ldr: 82 } },
    { id: 10880, name: "Fredy", role: "COACH", team: "ROC", year: 2016, rating: 79, quality: "Silver", region: "LEC", stats: { mec: 25, tmf: 78, frm: 79, cmp: 78, map: 81, ldr: 82 } },
    { id: 10881, name: "Nyph", role: "COACH", team: "S04", year: 2016, rating: 80, quality: "Gold", region: "LEC", stats: { mec: 30, tmf: 79, frm: 80, cmp: 79, map: 82, ldr: 83 } },
    // LCS 2016
    { id: 10882, name: "Hauntzer",   role: "TOP",   team: "TSM", year: 2016, rating: 83, quality: "Platinum", region: "LCS", stats: { mec: 84, tmf: 82, frm: 83, cmp: 83, map: 80, ldr: 81 } },
    { id: 10883, name: "Svenskeren", role: "JNG",   team: "TSM", year: 2016, rating: 84, quality: "Platinum", region: "LCS", stats: { mec: 83, tmf: 85, frm: 85, cmp: 85, map: 84, ldr: 82 } },
    { id: 10884, name: "Bjergsen",   role: "MID",   team: "TSM", year: 2016, rating: 91, quality: "Master",   region: "LCS", stats: { mec: 93, tmf: 90, frm: 92, cmp: 91, map: 89, ldr: 87 } },
    { id: 10885, name: "Doublelift", role: "ADC",   team: "TSM", year: 2016, rating: 90, quality: "Master",   region: "LCS", stats: { mec: 92, tmf: 89, frm: 90, cmp: 89, map: 87, ldr: 86 } },
    { id: 10886, name: "Biofrost",   role: "SUP",   team: "TSM", year: 2016, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 72, tmf: 87, frm: 87, cmp: 88, map: 86, ldr: 89 } },
    { id: 10887, name: "Parth",      role: "COACH", team: "TSM", year: 2016, rating: 87, quality: "Diamond",  region: "LCS", stats: { mec: 26, tmf: 88, frm: 87, cmp: 88, map: 89, ldr: 91 } },
    { id: 10888, name: "Impact",     role: "TOP",   team: "C9",  year: 2016, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 83, frm: 82, cmp: 82, map: 82, ldr: 81 } },
    { id: 10889, name: "Meteos",     role: "JNG",   team: "C9",  year: 2016, rating: 86, quality: "Diamond",  region: "LCS", stats: { mec: 84, tmf: 87, frm: 88, cmp: 89, map: 87, ldr: 83 } },
    { id: 10890, name: "Jensen",     role: "MID",   team: "C9",  year: 2016, rating: 89, quality: "Diamond",  region: "LCS", stats: { mec: 93, tmf: 87, frm: 88, cmp: 87, map: 86, ldr: 86 } },
    { id: 10891, name: "Sneaky",     role: "ADC",   team: "C9",  year: 2016, rating: 88, quality: "Diamond",  region: "LCS", stats: { mec: 90, tmf: 88, frm: 89, cmp: 89, map: 87, ldr: 85 } },
    { id: 10892, name: "Smoothie",   role: "SUP",   team: "C9",  year: 2016, rating: 83, quality: "Platinum", region: "LCS", stats: { mec: 70, tmf: 85, frm: 84, cmp: 85, map: 85, ldr: 88 } },
    { id: 10893, name: "Huni",       role: "TOP",   team: "IMT", year: 2016, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 88, tmf: 84, frm: 78, cmp: 76, map: 82, ldr: 84 } },
    { id: 10894, name: "Reignover",  role: "JNG",   team: "IMT", year: 2016, rating: 87, quality: "Diamond",  region: "LCS", stats: { mec: 84, tmf: 89, frm: 86, cmp: 86, map: 88, ldr: 84 } },
    { id: 10895, name: "Pobelter",   role: "MID",   team: "IMT", year: 2016, rating: 86, quality: "Diamond",  region: "LCS", stats: { mec: 89, tmf: 90, frm: 85, cmp: 85, map: 87, ldr: 84 } },
    { id: 10896, name: "WildTurtle", role: "ADC",   team: "IMT", year: 2016, rating: 83, quality: "Platinum", region: "LCS", stats: { mec: 85, tmf: 83, frm: 83, cmp: 83, map: 82, ldr: 84 } },
    { id: 10897, name: "Adrian",     role: "SUP",   team: "IMT", year: 2016, rating: 83, quality: "Platinum", region: "LCS", stats: { mec: 72, tmf: 86, frm: 84, cmp: 85, map: 85, ldr: 87 } },
    { id: 10898, name: "Darshan",    role: "TOP",   team: "CLG", year: 2016, rating: 79, quality: "Gold",     region: "LCS", stats: { mec: 80, tmf: 78, frm: 72, cmp: 70, map: 77, ldr: 81 } },
    { id: 10899, name: "Xmithie",    role: "JNG",   team: "CLG", year: 2016, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 81, tmf: 88, frm: 83, cmp: 83, map: 87, ldr: 84 } },
    { id: 10900, name: "Huhi",       role: "MID",   team: "CLG", year: 2016, rating: 79, quality: "Gold",     region: "LCS", stats: { mec: 85, tmf: 83, frm: 77, cmp: 76, map: 82, ldr: 82 } },
    { id: 10901, name: "Stixxay",    role: "ADC",   team: "CLG", year: 2016, rating: 78, quality: "Gold",     region: "LCS", stats: { mec: 83, tmf: 82, frm: 76, cmp: 76, map: 81, ldr: 83 } },
    { id: 10902, name: "Aphromoo",   role: "SUP",   team: "CLG", year: 2016, rating: 82, quality: "Gold",     region: "LCS", stats: { mec: 70, tmf: 84, frm: 80, cmp: 81, map: 83, ldr: 88 } },
    { id: 10903, name: "Lourlo",     role: "TOP",   team: "TL",  year: 2016, rating: 75, quality: "Gold",     region: "LCS", stats: { mec: 77, tmf: 77, frm: 74, cmp: 75, map: 76, ldr: 78 } },
    { id: 10904, name: "Dardoch",    role: "JNG",   team: "TL",  year: 2016, rating: 85, quality: "Platinum", region: "LCS", stats: { mec: 87, tmf: 90, frm: 80, cmp: 78, map: 87, ldr: 83 } },
    { id: 10905, name: "FeniX",      role: "MID",   team: "TL",  year: 2016, rating: 83, quality: "Platinum", region: "LCS", stats: { mec: 89, tmf: 85, frm: 82, cmp: 82, map: 83, ldr: 83 } },
    { id: 10906, name: "Fabbbyyy",   role: "ADC",   team: "TL",  year: 2016, rating: 78, quality: "Gold",     region: "LCS", stats: { mec: 81, tmf: 83, frm: 78, cmp: 79, map: 82, ldr: 79 } },
    { id: 10907, name: "Matt",       role: "SUP",   team: "TL",  year: 2016, rating: 78, quality: "Gold",     region: "LCS", stats: { mec: 73, tmf: 83, frm: 76, cmp: 77, map: 82, ldr: 82 } },
    { id: 10908, name: "Seraph",     role: "TOP",   team: "NV",  year: 2016, rating: 72, quality: "Silver",   region: "LCS", stats: { mec: 79, tmf: 79, frm: 68, cmp: 67, map: 77, ldr: 79 } },
    { id: 10909, name: "Procxin",    role: "JNG",   team: "NV",  year: 2016, rating: 77, quality: "Gold",     region: "LCS", stats: { mec: 81, tmf: 85, frm: 75, cmp: 75, map: 84, ldr: 79 } },
    { id: 10910, name: "ninja",      role: "MID",   team: "NV",  year: 2016, rating: 75, quality: "Gold",     region: "LCS", stats: { mec: 83, tmf: 82, frm: 72, cmp: 72, map: 80, ldr: 81 } },
    { id: 10911, name: "LOD",        role: "ADC",   team: "NV",  year: 2016, rating: 79, quality: "Gold",     region: "LCS", stats: { mec: 84, tmf: 83, frm: 79, cmp: 80, map: 82, ldr: 82 } },
    { id: 10912, name: "Hakuho",     role: "SUP",   team: "NV",  year: 2016, rating: 77, quality: "Gold",     region: "LCS", stats: { mec: 73, tmf: 83, frm: 76, cmp: 77, map: 82, ldr: 80 } },
    { id: 10913, name: "Ray",        role: "TOP",   team: "APX", year: 2016, rating: 79, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 84, frm: 74, cmp: 73, map: 82, ldr: 82 } },
    { id: 10914, name: "Shrimp",     role: "JNG",   team: "APX", year: 2016, rating: 76, quality: "Gold",     region: "LCS", stats: { mec: 79, tmf: 82, frm: 74, cmp: 75, map: 81, ldr: 78 } },
    { id: 10915, name: "Keane",      role: "MID",   team: "APX", year: 2016, rating: 82, quality: "Platinum", region: "LCS", stats: { mec: 88, tmf: 85, frm: 82, cmp: 83, map: 84, ldr: 82 } },
    { id: 10916, name: "Apollo",     role: "ADC",   team: "APX", year: 2016, rating: 78, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 83, frm: 78, cmp: 78, map: 82, ldr: 79 } },
    { id: 10917, name: "Xpecial",    role: "SUP",   team: "APX", year: 2016, rating: 77, quality: "Gold",     region: "LCS", stats: { mec: 68, tmf: 82, frm: 76, cmp: 77, map: 81, ldr: 83 } },
    { id: 10918, name: "Brandini",   role: "TOP",   team: "P1",  year: 2016, rating: 72, quality: "Silver",   region: "LCS", stats: { mec: 75, tmf: 78, frm: 73, cmp: 73, map: 77, ldr: 79 } },
    { id: 10919, name: "Inori",      role: "JNG",   team: "P1",  year: 2016, rating: 76, quality: "Gold",     region: "LCS", stats: { mec: 79, tmf: 84, frm: 75, cmp: 76, map: 83, ldr: 78 } },
    { id: 10920, name: "Pirean",     role: "MID",   team: "P1",  year: 2016, rating: 75, quality: "Gold",     region: "LCS", stats: { mec: 86, tmf: 82, frm: 70, cmp: 70, map: 80, ldr: 79 } },
    { id: 10921, name: "Mash",       role: "ADC",   team: "P1",  year: 2016, rating: 77, quality: "Gold",     region: "LCS", stats: { mec: 82, tmf: 84, frm: 75, cmp: 76, map: 82, ldr: 82 } },
    { id: 10922, name: "Gate",       role: "SUP",   team: "P1",  year: 2016, rating: 73, quality: "Silver",   region: "LCS", stats: { mec: 72, tmf: 83, frm: 69, cmp: 70, map: 81, ldr: 77 } },
    { id: 10923, name: "Quas",       role: "TOP",   team: "NRG", year: 2016, rating: 70, quality: "Silver",   region: "LCS", stats: { mec: 77, tmf: 77, frm: 65, cmp: 63, map: 74, ldr: 77 } },
    { id: 10924, name: "Santorin",   role: "JNG",   team: "NRG", year: 2016, rating: 82, quality: "Platinum", region: "LCS", stats: { mec: 81, tmf: 87, frm: 83, cmp: 84, map: 85, ldr: 79 } },
    { id: 10925, name: "GBM",        role: "MID",   team: "NRG", year: 2016, rating: 76, quality: "Gold",     region: "LCS", stats: { mec: 86, tmf: 81, frm: 70, cmp: 69, map: 78, ldr: 81 } },
    { id: 10926, name: "Ohq",        role: "ADC",   team: "NRG", year: 2016, rating: 73, quality: "Silver",   region: "LCS", stats: { mec: 79, tmf: 77, frm: 71, cmp: 72, map: 76, ldr: 80 } },
    { id: 10927, name: "KiWiKiD",    role: "SUP",   team: "NRG", year: 2016, rating: 72, quality: "Silver",   region: "LCS", stats: { mec: 73, tmf: 81, frm: 69, cmp: 70, map: 80, ldr: 78 } },
    { id: 10928, name: "kfo",        role: "TOP",   team: "FOX", year: 2016, rating: 63, quality: "Silver",   region: "LCS", stats: { mec: 73, tmf: 67, frm: 53, cmp: 52, map: 62, ldr: 76 } },
    { id: 10929, name: "Hard",       role: "JNG",   team: "FOX", year: 2016, rating: 64, quality: "Silver",   region: "LCS", stats: { mec: 73, tmf: 72, frm: 59, cmp: 60, map: 68, ldr: 72 } },
    { id: 10930, name: "Froggen",    role: "MID",   team: "FOX", year: 2016, rating: 82, quality: "Platinum", region: "LCS", stats: { mec: 91, tmf: 82, frm: 75, cmp: 74, map: 81, ldr: 83 } },
    { id: 10931, name: "KEITH",      role: "ADC",   team: "FOX", year: 2016, rating: 68, quality: "Silver",   region: "LCS", stats: { mec: 79, tmf: 74, frm: 63, cmp: 62, map: 72, ldr: 78 } },
    { id: 10932, name: "BIG",        role: "SUP",   team: "FOX", year: 2016, rating: 64, quality: "Silver",   region: "LCS", stats: { mec: 68, tmf: 77, frm: 62, cmp: 63, map: 76, ldr: 72 } },
    // LMS 2015
    { id: 10933, name: "Ziv",       role: "TOP",   team: "ahq", year: 2015, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 85, tmf: 83, frm: 86, cmp: 87, map: 83, ldr: 83 } },
    { id: 10934, name: "Mountain",  role: "JNG",   team: "ahq", year: 2015, rating: 82, quality: "Platinum", region: "LCP", stats: { mec: 79, tmf: 84, frm: 83, cmp: 84, map: 84, ldr: 80 } },
    { id: 10935, name: "westdoor",  role: "MID",   team: "ahq", year: 2015, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 87, tmf: 80, frm: 87, cmp: 88, map: 79, ldr: 87 } },
    { id: 10936, name: "AN",        role: "ADC",   team: "ahq", year: 2015, rating: 84, quality: "Platinum", region: "LCP", stats: { mec: 88, tmf: 83, frm: 83, cmp: 83, map: 82, ldr: 84 } },
    { id: 10937, name: "Albis",     role: "SUP",   team: "ahq", year: 2015, rating: 80, quality: "Gold",     region: "LCP", stats: { mec: 70, tmf: 83, frm: 80, cmp: 80, map: 82, ldr: 84 } },
    { id: 10938, name: "Stanley",   role: "TOP",   team: "HKE", year: 2015, rating: 77, quality: "Gold",     region: "LCP", stats: { mec: 80, tmf: 77, frm: 78, cmp: 79, map: 77, ldr: 79 } },
    { id: 10939, name: "DinTer",    role: "JNG",   team: "HKE", year: 2015, rating: 80, quality: "Gold",     region: "LCP", stats: { mec: 78, tmf: 84, frm: 80, cmp: 80, map: 83, ldr: 78 } },
    { id: 10940, name: "Toyz",      role: "MID",   team: "HKE", year: 2015, rating: 84, quality: "Platinum", region: "LCP", stats: { mec: 90, tmf: 82, frm: 77, cmp: 77, map: 80, ldr: 86 } },
    { id: 10941, name: "Raison",    role: "ADC",   team: "HKE", year: 2015, rating: 80, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 85, frm: 79, cmp: 79, map: 82, ldr: 83 } },
    { id: 10942, name: "Olleh",     role: "SUP",   team: "HKE", year: 2015, rating: 83, quality: "Platinum", region: "LCP", stats: { mec: 72, tmf: 88, frm: 79, cmp: 80, map: 86, ldr: 85 } },
    { id: 10943, name: "Steak",     role: "TOP",   team: "FW",  year: 2015, rating: 77, quality: "Gold",     region: "LCP", stats: { mec: 78, tmf: 80, frm: 78, cmp: 78, map: 79, ldr: 77 } },
    { id: 10944, name: "Karsa",     role: "JNG",   team: "FW",  year: 2015, rating: 87, quality: "Diamond",  region: "LCP", stats: { mec: 84, tmf: 86, frm: 86, cmp: 86, map: 87, ldr: 83 } },
    { id: 10945, name: "Maple",     role: "MID",   team: "FW",  year: 2015, rating: 87, quality: "Diamond",  region: "LCP", stats: { mec: 91, tmf: 82, frm: 87, cmp: 88, map: 81, ldr: 86 } },
    { id: 10946, name: "NL",        role: "ADC",   team: "FW",  year: 2015, rating: 88, quality: "Diamond",  region: "LCP", stats: { mec: 89, tmf: 86, frm: 91, cmp: 90, map: 84, ldr: 86 } },
    { id: 10947, name: "SwordArt",  role: "SUP",   team: "FW",  year: 2015, rating: 88, quality: "Diamond",  region: "LCP", stats: { mec: 72, tmf: 89, frm: 91, cmp: 92, map: 88, ldr: 89 } },
    { id: 10948, name: "LOFS",      role: "TOP",   team: "MSE", year: 2015, rating: 78, quality: "Gold",     region: "LCP", stats: { mec: 81, tmf: 82, frm: 78, cmp: 78, map: 79, ldr: 80 } },
    { id: 10949, name: "Empt2",     role: "JNG",   team: "MSE", year: 2015, rating: 78, quality: "Gold",     region: "LCP", stats: { mec: 79, tmf: 85, frm: 78, cmp: 79, map: 83, ldr: 77 } },
    { id: 10950, name: "caNdy",     role: "MID",   team: "MSE", year: 2015, rating: 75, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 80, frm: 74, cmp: 74, map: 79, ldr: 80 } },
    { id: 10951, name: "Stitch",    role: "ADC",   team: "MSE", year: 2015, rating: 77, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 81, frm: 77, cmp: 77, map: 80, ldr: 82 } },
    { id: 10952, name: "Chunx",     role: "SUP",   team: "MSE", year: 2015, rating: 73, quality: "Silver",   region: "LCP", stats: { mec: 70, tmf: 81, frm: 71, cmp: 72, map: 79, ldr: 76 } },
    { id: 10953, name: "Lilballz",  role: "COACH", team: "MSE", year: 2015, rating: 79, quality: "Gold",     region: "LCP", stats: { mec: 20, tmf: 79, frm: 79, cmp: 78, map: 80, ldr: 83 } },
    { id: 10954, name: "Morning",   role: "TOP",   team: "TPA", year: 2015, rating: 73, quality: "Silver",   region: "LCP", stats: { mec: 79, tmf: 77, frm: 72, cmp: 72, map: 76, ldr: 79 } },
    { id: 10955, name: "REFRA1N",   role: "JNG",   team: "TPA", year: 2015, rating: 73, quality: "Silver",   region: "LCP", stats: { mec: 76, tmf: 82, frm: 73, cmp: 73, map: 80, ldr: 72 } },
    { id: 10956, name: "Chawy",     role: "MID",   team: "TPA", year: 2015, rating: 80, quality: "Platinum", region: "LCP", stats: { mec: 91, tmf: 86, frm: 77, cmp: 76, map: 83, ldr: 85 } },
    { id: 10957, name: "Lupin",     role: "ADC",   team: "TPA", year: 2015, rating: 77, quality: "Gold",     region: "LCP", stats: { mec: 83, tmf: 83, frm: 75, cmp: 75, map: 81, ldr: 82 } },
    { id: 10958, name: "Jay",       role: "SUP",   team: "TPA", year: 2015, rating: 77, quality: "Gold",     region: "LCP", stats: { mec: 70, tmf: 85, frm: 78, cmp: 79, map: 84, ldr: 77 } },
    { id: 10959, name: "BoBo",      role: "TOP",   team: "MAE", year: 2015, rating: 67, quality: "Silver",   region: "LCP", stats: { mec: 78, tmf: 74, frm: 62, cmp: 63, map: 72, ldr: 77 } },
    { id: 10960, name: "Fiesta",    role: "JNG",   team: "MAE", year: 2015, rating: 70, quality: "Silver",   region: "LCP", stats: { mec: 77, tmf: 80, frm: 70, cmp: 71, map: 79, ldr: 73 } },
    { id: 10961, name: "Apex",      role: "MID",   team: "MAE", year: 2015, rating: 69, quality: "Silver",   region: "LCP", stats: { mec: 85, tmf: 79, frm: 62, cmp: 62, map: 77, ldr: 81 } },
    { id: 10962, name: "Dee",       role: "ADC",   team: "MAE", year: 2015, rating: 70, quality: "Silver",   region: "LCP", stats: { mec: 80, tmf: 78, frm: 67, cmp: 67, map: 76, ldr: 80 } },
    { id: 10963, name: "Dreamer",   role: "SUP",   team: "MAE", year: 2015, rating: 74, quality: "Silver",   region: "LCP", stats: { mec: 71, tmf: 84, frm: 73, cmp: 73, map: 82, ldr: 76 } },
    { id: 10964, name: "MapleSnow", role: "TOP",   team: "AS",  year: 2015, rating: 65, quality: "Silver",   region: "LCP", stats: { mec: 79, tmf: 77, frm: 58, cmp: 58, map: 75, ldr: 76 } },
    { id: 10965, name: "Zonda",     role: "JNG",   team: "AS",  year: 2015, rating: 68, quality: "Silver",   region: "LCP", stats: { mec: 74, tmf: 80, frm: 65, cmp: 66, map: 78, ldr: 73 } },
    { id: 10966, name: "Achie",     role: "MID",   team: "AS",  year: 2015, rating: 71, quality: "Silver",   region: "LCP", stats: { mec: 90, tmf: 79, frm: 63, cmp: 63, map: 77, ldr: 80 } },
    { id: 10967, name: "BeBe",      role: "ADC",   team: "AS",  year: 2015, rating: 70, quality: "Silver",   region: "LCP", stats: { mec: 79, tmf: 79, frm: 67, cmp: 68, map: 77, ldr: 81 } },
    { id: 10968, name: "Weiiii",    role: "SUP",   team: "AS",  year: 2015, rating: 70, quality: "Silver",   region: "LCP", stats: { mec: 66, tmf: 82, frm: 68, cmp: 69, map: 80, ldr: 73 } },
    { id: 10969, name: "Lat",       role: "TOP",   team: "LGS", year: 2015, rating: 62, quality: "Silver",   region: "LCP", stats: { mec: 77, tmf: 72, frm: 55, cmp: 56, map: 69, ldr: 76 } },
    { id: 10970, name: "YO",        role: "JNG",   team: "LGS", year: 2015, rating: 66, quality: "Silver",   region: "LCP", stats: { mec: 73, tmf: 80, frm: 62, cmp: 63, map: 78, ldr: 71 } },
    { id: 10971, name: "Breaker",   role: "MID",   team: "LGS", year: 2015, rating: 64, quality: "Silver",   region: "LCP", stats: { mec: 81, tmf: 77, frm: 56, cmp: 57, map: 75, ldr: 79 } },
    { id: 10972, name: "RD",        role: "ADC",   team: "LGS", year: 2015, rating: 64, quality: "Silver",   region: "LCP", stats: { mec: 82, tmf: 80, frm: 55, cmp: 56, map: 77, ldr: 79 } },
    { id: 10973, name: "Ysera",     role: "SUP",   team: "LGS", year: 2015, rating: 63, quality: "Silver",   region: "LCP", stats: { mec: 67, tmf: 81, frm: 55, cmp: 56, map: 79, ldr: 68 } },
    // LMS 2016
    { id: 10974, name: "MMD",       role: "TOP",   team: "FW",  year: 2016, rating: 83, quality: "Platinum", region: "LCP", stats: { mec: 83, tmf: 77, frm: 87, cmp: 88, map: 76, ldr: 84 } },
    { id: 10975, name: "Karsa",     role: "JNG",   team: "FW",  year: 2016, rating: 90, quality: "Master",   region: "LCP", stats: { mec: 87, tmf: 92, frm: 88, cmp: 88, map: 90, ldr: 86 } },
    { id: 10976, name: "Maple",     role: "MID",   team: "FW",  year: 2016, rating: 91, quality: "Master",   region: "LCP", stats: { mec: 93, tmf: 90, frm: 92, cmp: 92, map: 89, ldr: 86 } },
    { id: 10977, name: "NL",        role: "ADC",   team: "FW",  year: 2016, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 88, tmf: 83, frm: 82, cmp: 82, map: 82, ldr: 85 } },
    { id: 10978, name: "SwordArt",  role: "SUP",   team: "FW",  year: 2016, rating: 89, quality: "Diamond",  region: "LCP", stats: { mec: 70, tmf: 89, frm: 90, cmp: 91, map: 89, ldr: 91 } },
    { id: 10979, name: "Morning",   role: "TOP",   team: "JT",  year: 2016, rating: 76, quality: "Gold",     region: "LCP", stats: { mec: 78, tmf: 79, frm: 74, cmp: 74, map: 77, ldr: 79 } },
    { id: 10980, name: "REFRA1N",   role: "JNG",   team: "JT",  year: 2016, rating: 73, quality: "Silver",   region: "LCP", stats: { mec: 74, tmf: 79, frm: 67, cmp: 67, map: 77, ldr: 74 } },
    { id: 10981, name: "FoFo",      role: "MID",   team: "JT",  year: 2016, rating: 83, quality: "Platinum", region: "LCP", stats: { mec: 84, tmf: 83, frm: 80, cmp: 79, map: 82, ldr: 82 } },
    { id: 10982, name: "BeBe",      role: "ADC",   team: "JT",  year: 2016, rating: 84, quality: "Platinum", region: "LCP", stats: { mec: 87, tmf: 84, frm: 81, cmp: 81, map: 83, ldr: 86 } },
    { id: 10983, name: "Jay",       role: "SUP",   team: "JT",  year: 2016, rating: 77, quality: "Gold",     region: "LCP", stats: { mec: 72, tmf: 83, frm: 76, cmp: 76, map: 81, ldr: 79 } },
    { id: 10984, name: "Ziv",       role: "TOP",   team: "ahq", year: 2016, rating: 88, quality: "Diamond",  region: "LCP", stats: { mec: 90, tmf: 84, frm: 88, cmp: 88, map: 83, ldr: 86 } },
    { id: 10985, name: "Mountain",  role: "JNG",   team: "ahq", year: 2016, rating: 82, quality: "Platinum", region: "LCP", stats: { mec: 80, tmf: 83, frm: 82, cmp: 82, map: 83, ldr: 81 } },
    { id: 10986, name: "Westdoor",  role: "MID",   team: "ahq", year: 2016, rating: 79, quality: "Gold",     region: "LCP", stats: { mec: 82, tmf: 80, frm: 76, cmp: 76, map: 78, ldr: 83 } },
    { id: 10987, name: "AN",        role: "ADC",   team: "ahq", year: 2016, rating: 85, quality: "Platinum", region: "LCP", stats: { mec: 88, tmf: 84, frm: 83, cmp: 83, map: 82, ldr: 85 } },
    { id: 10988, name: "Albis",     role: "SUP",   team: "ahq", year: 2016, rating: 81, quality: "Platinum", region: "LCP", stats: { mec: 71, tmf: 84, frm: 81, cmp: 81, map: 82, ldr: 85 } },
    { id: 10989, name: "MapleSnow", role: "TOP",   team: "HKE", year: 2016, rating: 68, quality: "Silver",   region: "LCP", stats: { mec: 78, tmf: 76, frm: 61, cmp: 61, map: 73, ldr: 78 } },
    { id: 10990, name: "DinTer",    role: "JNG",   team: "HKE", year: 2016, rating: 66, quality: "Silver",   region: "LCP", stats: { mec: 77, tmf: 72, frm: 59, cmp: 59, map: 70, ldr: 74 } },
    { id: 10991, name: "Gear",      role: "MID",   team: "HKE", year: 2016, rating: 75, quality: "Gold",     region: "LCP", stats: { mec: 82, tmf: 82, frm: 72, cmp: 72, map: 80, ldr: 83 } },
    { id: 10992, name: "Raison",    role: "ADC",   team: "HKE", year: 2016, rating: 73, quality: "Silver",   region: "LCP", stats: { mec: 80, tmf: 73, frm: 67, cmp: 67, map: 71, ldr: 79 } },
    { id: 10993, name: "Olleh",     role: "SUP",   team: "HKE", year: 2016, rating: 77, quality: "Gold",     region: "LCP", stats: { mec: 68, tmf: 78, frm: 72, cmp: 73, map: 77, ldr: 82 } },
    { id: 10994, name: "Ninuo",     role: "TOP",   team: "MSE", year: 2016, rating: 67, quality: "Silver",   region: "LCP", stats: { mec: 78, tmf: 77, frm: 62, cmp: 63, map: 74, ldr: 77 } },
    { id: 10995, name: "Wulala",    role: "JNG",   team: "MSE", year: 2016, rating: 67, quality: "Silver",   region: "LCP", stats: { mec: 73, tmf: 79, frm: 62, cmp: 63, map: 77, ldr: 73 } },
    { id: 10996, name: "M1ssion",   role: "MID",   team: "MSE", year: 2016, rating: 70, quality: "Silver",   region: "LCP", stats: { mec: 82, tmf: 79, frm: 72, cmp: 72, map: 77, ldr: 78 } },
    { id: 10997, name: "CorGi",     role: "ADC",   team: "MSE", year: 2016, rating: 69, quality: "Silver",   region: "LCP", stats: { mec: 81, tmf: 79, frm: 68, cmp: 68, map: 77, ldr: 79 } },
    { id: 10998, name: "Kaiwing",   role: "SUP",   team: "MSE", year: 2016, rating: 76, quality: "Gold",     region: "LCP", stats: { mec: 70, tmf: 82, frm: 75, cmp: 76, map: 82, ldr: 79 } },
    { id: 10999, name: "Lilballz",  role: "COACH", team: "MSE", year: 2016, rating: 79, quality: "Gold",     region: "LCP", stats: { mec: 20, tmf: 79, frm: 79, cmp: 78, map: 80, ldr: 83 } },
    { id: 11000, name: "BoBo",      role: "TOP",   team: "MAE", year: 2016, rating: 65, quality: "Silver",   region: "LCP", stats: { mec: 78, tmf: 74, frm: 62, cmp: 63, map: 72, ldr: 77 } },
    { id: 11001, name: "Taizan",    role: "JNG",   team: "MAE", year: 2016, rating: 68, quality: "Silver",   region: "LCP", stats: { mec: 76, tmf: 78, frm: 63, cmp: 64, map: 76, ldr: 73 } },
    { id: 11002, name: "Apex",      role: "MID",   team: "MAE", year: 2016, rating: 67, quality: "Silver",   region: "LCP", stats: { mec: 85, tmf: 82, frm: 58, cmp: 58, map: 80, ldr: 80 } },
    { id: 11003, name: "Dee",       role: "ADC",   team: "MAE", year: 2016, rating: 70, quality: "Silver",   region: "LCP", stats: { mec: 82, tmf: 79, frm: 66, cmp: 66, map: 78, ldr: 80 } },
    { id: 11004, name: "Dreamer",   role: "SUP",   team: "MAE", year: 2016, rating: 68, quality: "Silver",   region: "LCP", stats: { mec: 66, tmf: 76, frm: 64, cmp: 65, map: 73, ldr: 73 } },
    { id: 11005, name: "Nexus",     role: "TOP",   team: "XG",  year: 2016, rating: 62, quality: "Silver",   region: "LCP", stats: { mec: 73, tmf: 72, frm: 54, cmp: 55, map: 67, ldr: 72 } },
    { id: 11006, name: "Yo",        role: "JNG",   team: "XG",  year: 2016, rating: 63, quality: "Silver",   region: "LCP", stats: { mec: 72, tmf: 76, frm: 58, cmp: 59, map: 74, ldr: 67 } },
    { id: 11007, name: "SuwaKo",    role: "MID",   team: "XG",  year: 2016, rating: 65, quality: "Silver",   region: "LCP", stats: { mec: 79, tmf: 74, frm: 59, cmp: 60, map: 73, ldr: 73 } },
    { id: 11008, name: "LBB",       role: "ADC",   team: "XG",  year: 2016, rating: 62, quality: "Silver",   region: "LCP", stats: { mec: 76, tmf: 71, frm: 53, cmp: 54, map: 70, ldr: 73 } },
    { id: 11009, name: "Suki",      role: "SUP",   team: "XG",  year: 2016, rating: 61, quality: "Silver",   region: "LCP", stats: { mec: 62, tmf: 74, frm: 54, cmp: 55, map: 72, ldr: 67 } },
    { id: 11010, name: "Rins",      role: "TOP",   team: "Mist",year: 2016, rating: 60, quality: "Silver",   region: "LCP", stats: { mec: 71, tmf: 70, frm: 51, cmp: 52, map: 64, ldr: 70 } },
    { id: 11011, name: "K",         role: "JNG",   team: "Mist",year: 2016, rating: 60, quality: "Silver",   region: "LCP", stats: { mec: 70, tmf: 73, frm: 53, cmp: 53, map: 71, ldr: 64 } },
    { id: 11012, name: "Benny",     role: "MID",   team: "Mist",year: 2016, rating: 63, quality: "Silver",   region: "LCP", stats: { mec: 77, tmf: 72, frm: 54, cmp: 55, map: 71, ldr: 71 } },
    { id: 11013, name: "Breeze",    role: "ADC",   team: "Mist",year: 2016, rating: 61, quality: "Silver",   region: "LCP", stats: { mec: 74, tmf: 70, frm: 52, cmp: 53, map: 68, ldr: 72 } },
    { id: 11014, name: "Rain",      role: "SUP",   team: "Mist",year: 2016, rating: 60, quality: "Silver",   region: "LCP", stats: { mec: 61, tmf: 72, frm: 52, cmp: 53, map: 70, ldr: 65 } },
    // LCK 2013 (OGN Champions Summer 2013)
    { id: 11015, name: "Impact",      role: "TOP",   team: "SKT", year: 2013, rating: 84, quality: "Platinum", region: "LCK", stats: { mec: 86, tmf: 83, frm: 84, cmp: 84, map: 81, ldr: 82 } },
    { id: 11016, name: "Bengi",       role: "JNG",   team: "SKT", year: 2013, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 83, tmf: 88, frm: 88, cmp: 89, map: 89, ldr: 83 } },
    { id: 11017, name: "Faker",       role: "MID",   team: "SKT", year: 2013, rating: 95, quality: "Master",   region: "LCK", stats: { mec: 97, tmf: 93, frm: 95, cmp: 94, map: 92, ldr: 88 } },
    { id: 11018, name: "Piglet",      role: "ADC",   team: "SKT", year: 2013, rating: 89, quality: "Diamond",  region: "LCK", stats: { mec: 92, tmf: 88, frm: 89, cmp: 89, map: 87, ldr: 85 } },
    { id: 11019, name: "PoohManDu",   role: "SUP",   team: "SKT", year: 2013, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 72, tmf: 88, frm: 87, cmp: 88, map: 87, ldr: 89 } },
    { id: 11020, name: "kkOma",       role: "COACH", team: "SKT", year: 2013, rating: 90, quality: "Master",   region: "LCK", stats: { mec: 28, tmf: 91, frm: 90, cmp: 91, map: 92, ldr: 93 } },
    { id: 11021, name: "inSec",       role: "TOP",   team: "KT",  year: 2013, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 89, tmf: 85, frm: 88, cmp: 87, map: 83, ldr: 82 } },
    { id: 11022, name: "KaKAO",       role: "JNG",   team: "KT",  year: 2013, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 83, tmf: 89, frm: 86, cmp: 86, map: 88, ldr: 82 } },
    { id: 11023, name: "Ryu",         role: "MID",   team: "KT",  year: 2013, rating: 85, quality: "Platinum", region: "LCK", stats: { mec: 90, tmf: 84, frm: 86, cmp: 85, map: 83, ldr: 82 } },
    { id: 11024, name: "Score",       role: "ADC",   team: "KT",  year: 2013, rating: 84, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 83, frm: 85, cmp: 84, map: 82, ldr: 82 } },
    { id: 11025, name: "Mafa",        role: "SUP",   team: "KT",  year: 2013, rating: 80, quality: "Gold",     region: "LCK", stats: { mec: 72, tmf: 83, frm: 81, cmp: 81, map: 83, ldr: 82 } },
    { id: 11026, name: "Homme",       role: "TOP",   team: "MVP", year: 2013, rating: 79, quality: "Gold",     region: "LCK", stats: { mec: 82, tmf: 79, frm: 79, cmp: 79, map: 78, ldr: 80 } },
    { id: 11027, name: "DanDy",       role: "JNG",   team: "MVP", year: 2013, rating: 88, quality: "Diamond",  region: "LCK", stats: { mec: 85, tmf: 90, frm: 88, cmp: 88, map: 90, ldr: 85 } },
    { id: 11028, name: "dade",        role: "MID",   team: "MVP", year: 2013, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 90, tmf: 85, frm: 87, cmp: 86, map: 84, ldr: 84 } },
    { id: 11029, name: "imp",         role: "ADC",   team: "MVP", year: 2013, rating: 88, quality: "Diamond",  region: "LCK", stats: { mec: 91, tmf: 86, frm: 88, cmp: 87, map: 85, ldr: 85 } },
    { id: 11030, name: "Mata",        role: "SUP",   team: "MVP", year: 2013, rating: 90, quality: "Master",   region: "LCK", stats: { mec: 74, tmf: 92, frm: 89, cmp: 90, map: 91, ldr: 91 } },
    { id: 11031, name: "Shy",         role: "TOP",   team: "CJF", year: 2013, rating: 83, quality: "Platinum", region: "LCK", stats: { mec: 85, tmf: 82, frm: 83, cmp: 83, map: 80, ldr: 82 } },
    { id: 11032, name: "CloudTemplar",role: "JNG",   team: "CJF", year: 2013, rating: 81, quality: "Gold",     region: "LCK", stats: { mec: 80, tmf: 83, frm: 82, cmp: 82, map: 83, ldr: 79 } },
    { id: 11033, name: "RapidStar",   role: "MID",   team: "CJF", year: 2013, rating: 79, quality: "Gold",     region: "LCK", stats: { mec: 84, tmf: 80, frm: 79, cmp: 79, map: 78, ldr: 80 } },
    { id: 11034, name: "Space",       role: "ADC",   team: "CJF", year: 2013, rating: 77, quality: "Gold",     region: "LCK", stats: { mec: 81, tmf: 79, frm: 77, cmp: 77, map: 78, ldr: 80 } },
    { id: 11035, name: "MadLife",     role: "SUP",   team: "CJF", year: 2013, rating: 90, quality: "Master",   region: "LCK", stats: { mec: 78, tmf: 92, frm: 88, cmp: 89, map: 90, ldr: 88 } },
    { id: 11036, name: "Flame",       role: "TOP",   team: "CJB", year: 2013, rating: 87, quality: "Platinum", region: "LCK", stats: { mec: 91, tmf: 83, frm: 87, cmp: 86, map: 81, ldr: 85 } },
    { id: 11037, name: "Helios",      role: "JNG",   team: "CJB", year: 2013, rating: 80, quality: "Gold",     region: "LCK", stats: { mec: 80, tmf: 83, frm: 79, cmp: 79, map: 82, ldr: 79 } },
    { id: 11038, name: "Ambition",    role: "MID",   team: "CJB", year: 2013, rating: 84, quality: "Platinum", region: "LCK", stats: { mec: 89, tmf: 84, frm: 84, cmp: 83, map: 82, ldr: 84 } },
    { id: 11039, name: "CptJack",     role: "ADC",   team: "CJB", year: 2013, rating: 78, quality: "Gold",     region: "LCK", stats: { mec: 83, tmf: 79, frm: 78, cmp: 78, map: 77, ldr: 81 } },
    { id: 11040, name: "Lustboy",     role: "SUP",   team: "CJB", year: 2013, rating: 82, quality: "Platinum", region: "LCK", stats: { mec: 71, tmf: 84, frm: 82, cmp: 82, map: 84, ldr: 84 } },
    { id: 11041, name: "Save",        role: "TOP",   team: "NJS", year: 2013, rating: 82, quality: "Platinum", region: "LCK", stats: { mec: 86, tmf: 81, frm: 82, cmp: 82, map: 79, ldr: 80 } },
    { id: 11042, name: "NoFe",        role: "JNG",   team: "NJS", year: 2013, rating: 79, quality: "Gold",     region: "LCK", stats: { mec: 79, tmf: 83, frm: 79, cmp: 79, map: 82, ldr: 78 } },
    { id: 11043, name: "Ggoong",      role: "MID",   team: "NJS", year: 2013, rating: 78, quality: "Gold",     region: "LCK", stats: { mec: 84, tmf: 80, frm: 77, cmp: 77, map: 78, ldr: 81 } },
    { id: 11044, name: "Zefa",        role: "ADC",   team: "NJS", year: 2013, rating: 78, quality: "Gold",     region: "LCK", stats: { mec: 82, tmf: 79, frm: 77, cmp: 77, map: 78, ldr: 82 } },
    { id: 11045, name: "GorillA",     role: "SUP",   team: "NJS", year: 2013, rating: 82, quality: "Platinum", region: "LCK", stats: { mec: 72, tmf: 85, frm: 82, cmp: 82, map: 85, ldr: 84 } },
    { id: 11046, name: "NonameD",     role: "TOP",   team: "CTU", year: 2013, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 78, tmf: 75, frm: 68, cmp: 68, map: 73, ldr: 77 } },
    { id: 11047, name: "Raccoon",     role: "JNG",   team: "CTU", year: 2013, rating: 69, quality: "Silver",   region: "LCK", stats: { mec: 74, tmf: 78, frm: 65, cmp: 66, map: 77, ldr: 72 } },
    { id: 11048, name: "Mima",        role: "MID",   team: "CTU", year: 2013, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 81, tmf: 77, frm: 65, cmp: 65, map: 75, ldr: 79 } },
    { id: 11049, name: "Riris",       role: "ADC",   team: "CTU", year: 2013, rating: 68, quality: "Silver",   region: "LCK", stats: { mec: 79, tmf: 75, frm: 64, cmp: 64, map: 73, ldr: 78 } },
    { id: 11050, name: "Wolf",        role: "SUP",   team: "CTU", year: 2013, rating: 74, quality: "Silver",   region: "LCK", stats: { mec: 70, tmf: 81, frm: 73, cmp: 73, map: 80, ldr: 76 } },
    { id: 11051, name: "Miso",        role: "TOP",   team: "JAF", year: 2013, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 78, tmf: 76, frm: 67, cmp: 67, map: 73, ldr: 77 } },
    { id: 11052, name: "Reapered",    role: "JNG",   team: "JAF", year: 2013, rating: 75, quality: "Gold",     region: "LCK", stats: { mec: 79, tmf: 80, frm: 74, cmp: 74, map: 79, ldr: 77 } },
    { id: 11053, name: "Raven",       role: "MID",   team: "JAF", year: 2013, rating: 71, quality: "Silver",   region: "LCK", stats: { mec: 82, tmf: 77, frm: 68, cmp: 68, map: 75, ldr: 79 } },
    { id: 11054, name: "Roar",        role: "ADC",   team: "JAF", year: 2013, rating: 68, quality: "Silver",   region: "LCK", stats: { mec: 79, tmf: 75, frm: 64, cmp: 64, map: 73, ldr: 78 } },
    { id: 11055, name: "StarLast",    role: "SUP",   team: "JAF", year: 2013, rating: 68, quality: "Silver",   region: "LCK", stats: { mec: 68, tmf: 79, frm: 65, cmp: 65, map: 77, ldr: 72 } },
    { id: 11056, name: "Expession",   role: "TOP",   team: "NJB", year: 2013, rating: 75, quality: "Gold",     region: "LCK", stats: { mec: 80, tmf: 76, frm: 74, cmp: 74, map: 74, ldr: 79 } },
    { id: 11057, name: "Watch",       role: "JNG",   team: "NJB", year: 2013, rating: 76, quality: "Gold",     region: "LCK", stats: { mec: 77, tmf: 81, frm: 75, cmp: 75, map: 80, ldr: 77 } },
    { id: 11058, name: "SSONG",       role: "MID",   team: "NJB", year: 2013, rating: 74, quality: "Silver",   region: "LCK", stats: { mec: 82, tmf: 78, frm: 72, cmp: 72, map: 76, ldr: 80 } },
    { id: 11059, name: "PraY",        role: "ADC",   team: "NJB", year: 2013, rating: 86, quality: "Platinum", region: "LCK", stats: { mec: 89, tmf: 84, frm: 87, cmp: 87, map: 83, ldr: 85 } },
    { id: 11060, name: "Cain",        role: "SUP",   team: "NJB", year: 2013, rating: 77, quality: "Gold",     region: "LCK", stats: { mec: 70, tmf: 82, frm: 77, cmp: 77, map: 82, ldr: 79 } },
    // EU LCS Summer 2013
    { id: 11061, name: "sOAZ",        role: "TOP",   team: "FNC", year: 2013, rating: 83, quality: "Platinum", region: "LEC", stats: { mec: 86, tmf: 82, frm: 83, cmp: 83, map: 81, ldr: 82 } },
    { id: 11062, name: "Cyanide",     role: "JNG",   team: "FNC", year: 2013, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 80, tmf: 83, frm: 80, cmp: 80, map: 83, ldr: 79 } },
    { id: 11063, name: "xPeke",       role: "MID",   team: "FNC", year: 2013, rating: 88, quality: "Diamond",  region: "LEC", stats: { mec: 92, tmf: 86, frm: 88, cmp: 87, map: 85, ldr: 86 } },
    { id: 11064, name: "puszu",       role: "ADC",   team: "FNC", year: 2013, rating: 76, quality: "Gold",     region: "LEC", stats: { mec: 82, tmf: 78, frm: 75, cmp: 75, map: 77, ldr: 80 } },
    { id: 11065, name: "YellOwStaR",  role: "SUP",   team: "FNC", year: 2013, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 72, tmf: 87, frm: 85, cmp: 85, map: 87, ldr: 88 } },
    { id: 11066, name: "Zorozero",    role: "TOP",   team: "LD",  year: 2013, rating: 77, quality: "Gold",     region: "LEC", stats: { mec: 81, tmf: 78, frm: 77, cmp: 77, map: 76, ldr: 79 } },
    { id: 11067, name: "dexter",      role: "JNG",   team: "LD",  year: 2013, rating: 79, quality: "Gold",     region: "LEC", stats: { mec: 79, tmf: 83, frm: 78, cmp: 78, map: 83, ldr: 79 } },
    { id: 11068, name: "Nukeduck",    role: "MID",   team: "LD",  year: 2013, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 92, tmf: 84, frm: 86, cmp: 83, map: 83, ldr: 85 } },
    { id: 11069, name: "Tabzz",       role: "ADC",   team: "LD",  year: 2013, rating: 78, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 79, frm: 77, cmp: 77, map: 78, ldr: 82 } },
    { id: 11070, name: "Mithy",       role: "SUP",   team: "LD",  year: 2013, rating: 81, quality: "Gold",     region: "LEC", stats: { mec: 71, tmf: 84, frm: 81, cmp: 81, map: 84, ldr: 83 } },
    { id: 11071, name: "Darien",      role: "TOP",   team: "GMB", year: 2013, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 87, tmf: 79, frm: 77, cmp: 75, map: 77, ldr: 83 } },
    { id: 11072, name: "Diamondprox", role: "JNG",   team: "GMB", year: 2013, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 84, tmf: 88, frm: 86, cmp: 86, map: 88, ldr: 84 } },
    { id: 11073, name: "Alex Ich",    role: "MID",   team: "GMB", year: 2013, rating: 88, quality: "Diamond",  region: "LEC", stats: { mec: 92, tmf: 87, frm: 88, cmp: 87, map: 86, ldr: 86 } },
    { id: 11074, name: "Genja",       role: "ADC",   team: "GMB", year: 2013, rating: 81, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 81, frm: 81, cmp: 81, map: 80, ldr: 83 } },
    { id: 11075, name: "Voidle",      role: "SUP",   team: "GMB", year: 2013, rating: 72, quality: "Silver",   region: "LEC", stats: { mec: 68, tmf: 79, frm: 71, cmp: 71, map: 78, ldr: 75 } },
    { id: 11076, name: "Wickd",       role: "TOP",   team: "EG",  year: 2013, rating: 79, quality: "Gold",     region: "LEC", stats: { mec: 83, tmf: 79, frm: 79, cmp: 79, map: 77, ldr: 80 } },
    { id: 11077, name: "Snoopeh",     role: "JNG",   team: "EG",  year: 2013, rating: 77, quality: "Gold",     region: "LEC", stats: { mec: 79, tmf: 81, frm: 76, cmp: 76, map: 80, ldr: 78 } },
    { id: 11078, name: "Froggen",     role: "MID",   team: "EG",  year: 2013, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 91, tmf: 83, frm: 85, cmp: 84, map: 82, ldr: 84 } },
    { id: 11079, name: "yellowpete",  role: "ADC",   team: "EG",  year: 2013, rating: 77, quality: "Gold",     region: "LEC", stats: { mec: 82, tmf: 78, frm: 77, cmp: 77, map: 77, ldr: 80 } },
    { id: 11080, name: "Krepo",       role: "SUP",   team: "EG",  year: 2013, rating: 78, quality: "Gold",     region: "LEC", stats: { mec: 70, tmf: 82, frm: 77, cmp: 77, map: 81, ldr: 81 } },
    { id: 11081, name: "Kerp",        role: "TOP",   team: "ALT", year: 2013, rating: 69, quality: "Silver",   region: "LEC", stats: { mec: 78, tmf: 74, frm: 66, cmp: 66, map: 72, ldr: 77 } },
    { id: 11082, name: "Araneae",     role: "JNG",   team: "ALT", year: 2013, rating: 70, quality: "Silver",   region: "LEC", stats: { mec: 75, tmf: 78, frm: 68, cmp: 68, map: 77, ldr: 73 } },
    { id: 11083, name: "ForellenLord",role: "MID",   team: "ALT", year: 2013, rating: 71, quality: "Silver",   region: "LEC", stats: { mec: 83, tmf: 77, frm: 68, cmp: 68, map: 75, ldr: 79 } },
    { id: 11084, name: "Creaton",     role: "ADC",   team: "ALT", year: 2013, rating: 68, quality: "Silver",   region: "LEC", stats: { mec: 79, tmf: 74, frm: 65, cmp: 65, map: 73, ldr: 78 } },
    { id: 11085, name: "Jree",        role: "SUP",   team: "ALT", year: 2013, rating: 69, quality: "Silver",   region: "LEC", stats: { mec: 66, tmf: 78, frm: 67, cmp: 68, map: 77, ldr: 72 } },
    { id: 11086, name: "Mimer",       role: "TOP",   team: "NIP", year: 2013, rating: 70, quality: "Silver",   region: "LEC", stats: { mec: 78, tmf: 75, frm: 68, cmp: 68, map: 73, ldr: 77 } },
    { id: 11087, name: "Malunoo",     role: "JNG",   team: "NIP", year: 2013, rating: 70, quality: "Silver",   region: "LEC", stats: { mec: 75, tmf: 79, frm: 68, cmp: 68, map: 77, ldr: 73 } },
    { id: 11088, name: "Bjergsen",    role: "MID",   team: "NIP", year: 2013, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 93, tmf: 84, frm: 87, cmp: 86, map: 83, ldr: 84 } },
    { id: 11089, name: "Freeze",      role: "ADC",   team: "NIP", year: 2013, rating: 78, quality: "Gold",     region: "LEC", stats: { mec: 84, tmf: 79, frm: 77, cmp: 77, map: 77, ldr: 81 } },
    { id: 11090, name: "Deficio",     role: "SUP",   team: "NIP", year: 2013, rating: 72, quality: "Silver",   region: "LEC", stats: { mec: 68, tmf: 79, frm: 71, cmp: 71, map: 78, ldr: 75 } },
    { id: 11091, name: "Kev1n",       role: "TOP",   team: "SKG", year: 2013, rating: 73, quality: "Silver",   region: "LEC", stats: { mec: 80, tmf: 76, frm: 71, cmp: 71, map: 73, ldr: 79 } },
    { id: 11092, name: "hyrqBot",     role: "JNG",   team: "SKG", year: 2013, rating: 70, quality: "Silver",   region: "LEC", stats: { mec: 75, tmf: 78, frm: 67, cmp: 67, map: 77, ldr: 73 } },
    { id: 11093, name: "ocelote",     role: "MID",   team: "SKG", year: 2013, rating: 77, quality: "Gold",     region: "LEC", stats: { mec: 86, tmf: 79, frm: 74, cmp: 73, map: 77, ldr: 82 } },
    { id: 11094, name: "CandyPanda",  role: "ADC",   team: "SKG", year: 2013, rating: 73, quality: "Silver",   region: "LEC", stats: { mec: 80, tmf: 75, frm: 71, cmp: 71, map: 74, ldr: 80 } },
    { id: 11095, name: "Nyph",        role: "SUP",   team: "SKG", year: 2013, rating: 75, quality: "Gold",     region: "LEC", stats: { mec: 68, tmf: 80, frm: 74, cmp: 74, map: 79, ldr: 78 } },
    { id: 11096, name: "Kubon",       role: "TOP",   team: "MYM", year: 2013, rating: 61, quality: "Silver",   region: "LEC", stats: { mec: 74, tmf: 68, frm: 54, cmp: 54, map: 65, ldr: 74 } },
    { id: 11097, name: "Mokatte",     role: "JNG",   team: "MYM", year: 2013, rating: 61, quality: "Silver",   region: "LEC", stats: { mec: 71, tmf: 73, frm: 55, cmp: 55, map: 71, ldr: 68 } },
    { id: 11098, name: "Czaru",       role: "MID",   team: "MYM", year: 2013, rating: 63, quality: "Silver",   region: "LEC", stats: { mec: 79, tmf: 72, frm: 56, cmp: 56, map: 70, ldr: 77 } },
    { id: 11099, name: "Makler",      role: "ADC",   team: "MYM", year: 2013, rating: 62, quality: "Silver",   region: "LEC", stats: { mec: 77, tmf: 70, frm: 55, cmp: 55, map: 68, ldr: 76 } },
    { id: 11100, name: "Libik",       role: "SUP",   team: "MYM", year: 2013, rating: 62, quality: "Silver",   region: "LEC", stats: { mec: 63, tmf: 74, frm: 56, cmp: 57, map: 72, ldr: 67 } },
    // LPL Summer 2013
    { id: 11101, name: "Canines",     role: "TOP",   team: "PE",  year: 2013, rating: 77, quality: "Gold",     region: "LPL", stats: { mec: 81, tmf: 78, frm: 76, cmp: 76, map: 76, ldr: 81 } },
    { id: 11102, name: "Jing",        role: "JNG",   team: "PE",  year: 2013, rating: 77, quality: "Gold",     region: "LPL", stats: { mec: 78, tmf: 82, frm: 76, cmp: 76, map: 81, ldr: 78 } },
    { id: 11103, name: "JoJo",        role: "MID",   team: "PE",  year: 2013, rating: 79, quality: "Gold",     region: "LPL", stats: { mec: 86, tmf: 81, frm: 78, cmp: 78, map: 79, ldr: 82 } },
    { id: 11104, name: "NaMei",       role: "ADC",   team: "PE",  year: 2013, rating: 88, quality: "Diamond",  region: "LPL", stats: { mec: 92, tmf: 85, frm: 89, cmp: 88, map: 84, ldr: 87 } },
    { id: 11105, name: "SicCa",       role: "SUP",   team: "PE",  year: 2013, rating: 75, quality: "Gold",     region: "LPL", stats: { mec: 69, tmf: 80, frm: 74, cmp: 74, map: 80, ldr: 78 } },
    { id: 11106, name: "Gogoing",     role: "TOP",   team: "OMG", year: 2013, rating: 83, quality: "Platinum", region: "LPL", stats: { mec: 87, tmf: 82, frm: 83, cmp: 82, map: 80, ldr: 84 } },
    { id: 11107, name: "LoveLin",     role: "JNG",   team: "OMG", year: 2013, rating: 82, quality: "Platinum", region: "LPL", stats: { mec: 81, tmf: 86, frm: 82, cmp: 82, map: 86, ldr: 80 } },
    { id: 11108, name: "Cool",        role: "MID",   team: "OMG", year: 2013, rating: 84, quality: "Platinum", region: "LPL", stats: { mec: 89, tmf: 84, frm: 84, cmp: 83, map: 82, ldr: 84 } },
    { id: 11109, name: "san",         role: "ADC",   team: "OMG", year: 2013, rating: 81, quality: "Gold",     region: "LPL", stats: { mec: 86, tmf: 82, frm: 81, cmp: 81, map: 80, ldr: 83 } },
    { id: 11110, name: "bigpomelo",   role: "SUP",   team: "OMG", year: 2013, rating: 76, quality: "Gold",     region: "LPL", stats: { mec: 70, tmf: 82, frm: 75, cmp: 75, map: 81, ldr: 79 } },
    { id: 11111, name: "CaoMei",      role: "TOP",   team: "WE",  year: 2013, rating: 78, quality: "Gold",     region: "LPL", stats: { mec: 82, tmf: 79, frm: 78, cmp: 78, map: 77, ldr: 80 } },
    { id: 11112, name: "Mann",        role: "JNG",   team: "WE",  year: 2013, rating: 76, quality: "Gold",     region: "LPL", stats: { mec: 77, tmf: 81, frm: 75, cmp: 75, map: 80, ldr: 77 } },
    { id: 11113, name: "Misaya",      role: "MID",   team: "WE",  year: 2013, rating: 84, quality: "Platinum", region: "LPL", stats: { mec: 91, tmf: 83, frm: 84, cmp: 83, map: 81, ldr: 85 } },
    { id: 11114, name: "Wx",          role: "ADC",   team: "WE",  year: 2013, rating: 76, quality: "Gold",     region: "LPL", stats: { mec: 82, tmf: 78, frm: 75, cmp: 75, map: 77, ldr: 80 } },
    { id: 11115, name: "FZZF",        role: "SUP",   team: "WE",  year: 2013, rating: 74, quality: "Silver",   region: "LPL", stats: { mec: 68, tmf: 80, frm: 73, cmp: 73, map: 79, ldr: 77 } },
    { id: 11116, name: "Godlike",     role: "TOP",   team: "RC",  year: 2013, rating: 78, quality: "Gold",     region: "LPL", stats: { mec: 82, tmf: 79, frm: 78, cmp: 78, map: 77, ldr: 80 } },
    { id: 11117, name: "Lucky",       role: "JNG",   team: "RC",  year: 2013, rating: 77, quality: "Gold",     region: "LPL", stats: { mec: 78, tmf: 82, frm: 76, cmp: 76, map: 81, ldr: 78 } },
    { id: 11118, name: "Wh1t3zZ",     role: "MID",   team: "RC",  year: 2013, rating: 79, quality: "Gold",     region: "LPL", stats: { mec: 86, tmf: 80, frm: 79, cmp: 79, map: 78, ldr: 82 } },
    { id: 11119, name: "Uzi",         role: "ADC",   team: "RC",  year: 2013, rating: 89, quality: "Diamond",  region: "LPL", stats: { mec: 94, tmf: 86, frm: 88, cmp: 87, map: 84, ldr: 87 } },
    { id: 11120, name: "Tabe",        role: "SUP",   team: "RC",  year: 2013, rating: 79, quality: "Gold",     region: "LPL", stats: { mec: 71, tmf: 84, frm: 79, cmp: 79, map: 83, ldr: 82 } },
    { id: 11121, name: "PDD",         role: "TOP",   team: "IG",  year: 2013, rating: 76, quality: "Gold",     region: "LPL", stats: { mec: 81, tmf: 77, frm: 76, cmp: 76, map: 74, ldr: 80 } },
    { id: 11122, name: "illuSioN",    role: "JNG",   team: "IG",  year: 2013, rating: 73, quality: "Silver",   region: "LPL", stats: { mec: 74, tmf: 79, frm: 72, cmp: 72, map: 78, ldr: 75 } },
    { id: 11123, name: "Zz1tai",      role: "MID",   team: "IG",  year: 2013, rating: 76, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 79, frm: 75, cmp: 74, map: 77, ldr: 81 } },
    { id: 11124, name: "Kid",         role: "ADC",   team: "IG",  year: 2013, rating: 73, quality: "Silver",   region: "LPL", stats: { mec: 80, tmf: 75, frm: 71, cmp: 71, map: 73, ldr: 78 } },
    { id: 11125, name: "XiaoXiao",    role: "SUP",   team: "IG",  year: 2013, rating: 71, quality: "Silver",   region: "LPL", stats: { mec: 65, tmf: 78, frm: 69, cmp: 70, map: 77, ldr: 74 } },
    { id: 11126, name: "Dreams",      role: "TOP",   team: "LMQ", year: 2013, rating: 72, quality: "Silver",   region: "LPL", stats: { mec: 78, tmf: 74, frm: 70, cmp: 70, map: 72, ldr: 78 } },
    { id: 11127, name: "NoName",      role: "JNG",   team: "LMQ", year: 2013, rating: 70, quality: "Silver",   region: "LPL", stats: { mec: 72, tmf: 77, frm: 68, cmp: 68, map: 76, ldr: 73 } },
    { id: 11128, name: "XiaoWeiXiao", role: "MID",   team: "LMQ", year: 2013, rating: 77, quality: "Gold",     region: "LPL", stats: { mec: 86, tmf: 78, frm: 76, cmp: 75, map: 77, ldr: 82 } },
    { id: 11129, name: "Avenger",     role: "ADC",   team: "LMQ", year: 2013, rating: 71, quality: "Silver",   region: "LPL", stats: { mec: 78, tmf: 74, frm: 69, cmp: 69, map: 73, ldr: 78 } },
    { id: 11130, name: "Mor",         role: "SUP",   team: "LMQ", year: 2013, rating: 70, quality: "Silver",   region: "LPL", stats: { mec: 65, tmf: 78, frm: 69, cmp: 69, map: 77, ldr: 72 } },
    { id: 11131, name: "Otto",        role: "TOP",   team: "YG",  year: 2013, rating: 64, quality: "Silver",   region: "LPL", stats: { mec: 75, tmf: 71, frm: 59, cmp: 59, map: 68, ldr: 76 } },
    { id: 11132, name: "Syz",         role: "JNG",   team: "YG",  year: 2013, rating: 63, quality: "Silver",   region: "LPL", stats: { mec: 70, tmf: 75, frm: 58, cmp: 58, map: 73, ldr: 68 } },
    { id: 11133, name: "YanSir",      role: "MID",   team: "YG",  year: 2013, rating: 65, quality: "Silver",   region: "LPL", stats: { mec: 78, tmf: 73, frm: 60, cmp: 60, map: 71, ldr: 77 } },
    { id: 11134, name: "Dragon",      role: "ADC",   team: "YG",  year: 2013, rating: 63, quality: "Silver",   region: "LPL", stats: { mec: 75, tmf: 71, frm: 58, cmp: 58, map: 69, ldr: 75 } },
    { id: 11135, name: "lovecryboy",  role: "SUP",   team: "YG",  year: 2013, rating: 63, quality: "Silver",   region: "LPL", stats: { mec: 63, tmf: 76, frm: 59, cmp: 59, map: 74, ldr: 67 } },
    { id: 11136, name: "LaoPi",       role: "TOP",   team: "EP",  year: 2013, rating: 60, quality: "Silver",   region: "LPL", stats: { mec: 72, tmf: 67, frm: 52, cmp: 53, map: 63, ldr: 73 } },
    { id: 11137, name: "BuPingS",     role: "JNG",   team: "EP",  year: 2013, rating: 61, quality: "Silver",   region: "LPL", stats: { mec: 69, tmf: 73, frm: 55, cmp: 55, map: 71, ldr: 67 } },
    { id: 11138, name: "SuperCatt",   role: "MID",   team: "EP",  year: 2013, rating: 62, quality: "Silver",   region: "LPL", stats: { mec: 77, tmf: 71, frm: 54, cmp: 54, map: 69, ldr: 76 } },
    { id: 11139, name: "kane4357",    role: "ADC",   team: "EP",  year: 2013, rating: 60, quality: "Silver",   region: "LPL", stats: { mec: 74, tmf: 68, frm: 52, cmp: 52, map: 66, ldr: 74 } },
    { id: 11140, name: "DomhoXz",     role: "SUP",   team: "EP",  year: 2013, rating: 60, quality: "Silver",   region: "LPL", stats: { mec: 60, tmf: 73, frm: 53, cmp: 53, map: 71, ldr: 64 } },

    // LCK 2011 — OGN Champions / Season 1 Worlds qualifiers
    { id: 11141, name: "Woong",        role: "TOP",   team: "MiGF", year: 2011, rating: 77, quality: "Gold",     region: "LCK", stats: { mec: 84, tmf: 76, frm: 74, cmp: 74, map: 75, ldr: 82 } },
    { id: 11142, name: "CloudTemplar", role: "JNG",   team: "MiGF", year: 2011, rating: 78, quality: "Gold",     region: "LCK", stats: { mec: 80, tmf: 83, frm: 75, cmp: 75, map: 82, ldr: 78 } },
    { id: 11143, name: "RapidStar",    role: "MID",   team: "MiGF", year: 2011, rating: 76, quality: "Gold",     region: "LCK", stats: { mec: 84, tmf: 78, frm: 73, cmp: 73, map: 76, ldr: 79 } },
    { id: 11144, name: "Locodoco",     role: "ADC",   team: "MiGF", year: 2011, rating: 72, quality: "Silver",   region: "LCK", stats: { mec: 79, tmf: 74, frm: 70, cmp: 70, map: 72, ldr: 78 } },
    { id: 11145, name: "MadLife",      role: "SUP",   team: "MiGF", year: 2011, rating: 84, quality: "Platinum", region: "LCK", stats: { mec: 74, tmf: 86, frm: 82, cmp: 83, map: 87, ldr: 80 } },
    { id: 11146, name: "MakNooN",      role: "TOP",   team: "NJE",  year: 2011, rating: 74, quality: "Silver",   region: "LCK", stats: { mec: 81, tmf: 73, frm: 71, cmp: 71, map: 72, ldr: 78 } },
    { id: 11147, name: "MOKUZA",       role: "JNG",   team: "NJE",  year: 2011, rating: 71, quality: "Silver",   region: "LCK", stats: { mec: 74, tmf: 77, frm: 68, cmp: 68, map: 76, ldr: 73 } },
    { id: 11148, name: "HooN",         role: "MID",   team: "NJE",  year: 2011, rating: 72, quality: "Silver",   region: "LCK", stats: { mec: 80, tmf: 74, frm: 69, cmp: 69, map: 73, ldr: 77 } },
    { id: 11149, name: "Hiro",         role: "ADC",   team: "NJE",  year: 2011, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 77, tmf: 72, frm: 67, cmp: 67, map: 70, ldr: 75 } },
    { id: 11150, name: "viNylCat",     role: "SUP",   team: "NJE",  year: 2011, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 66, tmf: 78, frm: 68, cmp: 68, map: 77, ldr: 69 } },
    { id: 11151, name: "Vitamin",      role: "TOP",   team: "ST",   year: 2011, rating: 68, quality: "Silver",   region: "LCK", stats: { mec: 75, tmf: 69, frm: 65, cmp: 65, map: 67, ldr: 73 } },
    { id: 11152, name: "kkOma",        role: "JNG",   team: "ST",   year: 2011, rating: 71, quality: "Silver",   region: "LCK", stats: { mec: 72, tmf: 77, frm: 68, cmp: 69, map: 76, ldr: 73 } },
    { id: 11153, name: "Ryu",          role: "MID",   team: "ST",   year: 2011, rating: 73, quality: "Silver",   region: "LCK", stats: { mec: 81, tmf: 74, frm: 70, cmp: 70, map: 73, ldr: 78 } },
    { id: 11154, name: "Score",        role: "ADC",   team: "ST",   year: 2011, rating: 72, quality: "Silver",   region: "LCK", stats: { mec: 79, tmf: 73, frm: 70, cmp: 70, map: 71, ldr: 77 } },
    { id: 11155, name: "MaFa",         role: "SUP",   team: "ST",   year: 2011, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 65, tmf: 78, frm: 68, cmp: 68, map: 76, ldr: 69 } },

    // LEC 2011 — Season 1 Worlds / EU regional
    { id: 11156, name: "xPeke",        role: "TOP",   team: "FNC",  year: 2011, rating: 82, quality: "Platinum", region: "LEC", stats: { mec: 87, tmf: 82, frm: 80, cmp: 80, map: 80, ldr: 84 } },
    { id: 11157, name: "Cyanide",      role: "JNG",   team: "FNC",  year: 2011, rating: 77, quality: "Gold",     region: "LEC", stats: { mec: 79, tmf: 82, frm: 74, cmp: 74, map: 81, ldr: 77 } },
    { id: 11158, name: "Shushei",      role: "MID",   team: "FNC",  year: 2011, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 87, tmf: 81, frm: 77, cmp: 78, map: 79, ldr: 82 } },
    { id: 11159, name: "Lamia",        role: "ADC",   team: "FNC",  year: 2011, rating: 72, quality: "Silver",   region: "LEC", stats: { mec: 79, tmf: 73, frm: 70, cmp: 70, map: 72, ldr: 77 } },
    { id: 11160, name: "Mellisan",     role: "SUP",   team: "FNC",  year: 2011, rating: 75, quality: "Gold",     region: "LEC", stats: { mec: 68, tmf: 80, frm: 73, cmp: 73, map: 79, ldr: 72 } },
    { id: 11161, name: "sOAZ",         role: "TOP",   team: "aAa",  year: 2011, rating: 79, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 79, frm: 77, cmp: 77, map: 77, ldr: 81 } },
    { id: 11162, name: "Linak",        role: "JNG",   team: "aAa",  year: 2011, rating: 76, quality: "Gold",     region: "LEC", stats: { mec: 78, tmf: 81, frm: 73, cmp: 73, map: 80, ldr: 76 } },
    { id: 11163, name: "MoMa",         role: "MID",   team: "aAa",  year: 2011, rating: 78, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 79, frm: 75, cmp: 76, map: 78, ldr: 81 } },
    { id: 11164, name: "YellOwStaR",   role: "ADC",   team: "aAa",  year: 2011, rating: 79, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 79, frm: 76, cmp: 76, map: 78, ldr: 82 } },
    { id: 11165, name: "kujaa",        role: "SUP",   team: "aAa",  year: 2011, rating: 73, quality: "Silver",   region: "LEC", stats: { mec: 68, tmf: 80, frm: 71, cmp: 71, map: 78, ldr: 70 } },
    { id: 11166, name: "kev1n",        role: "TOP",   team: "gmd",  year: 2011, rating: 70, quality: "Silver",   region: "LEC", stats: { mec: 77, tmf: 71, frm: 67, cmp: 67, map: 69, ldr: 74 } },
    { id: 11167, name: "Zylor",        role: "JNG",   team: "gmd",  year: 2011, rating: 68, quality: "Silver",   region: "LEC", stats: { mec: 70, tmf: 75, frm: 65, cmp: 65, map: 73, ldr: 70 } },
    { id: 11168, name: "Reyk",         role: "MID",   team: "gmd",  year: 2011, rating: 69, quality: "Silver",   region: "LEC", stats: { mec: 77, tmf: 70, frm: 65, cmp: 65, map: 69, ldr: 74 } },
    { id: 11169, name: "CandyPanda",   role: "ADC",   team: "gmd",  year: 2011, rating: 71, quality: "Silver",   region: "LEC", stats: { mec: 78, tmf: 72, frm: 68, cmp: 68, map: 71, ldr: 76 } },
    { id: 11170, name: "Nyph",         role: "SUP",   team: "gmd",  year: 2011, rating: 72, quality: "Silver",   region: "LEC", stats: { mec: 67, tmf: 79, frm: 70, cmp: 70, map: 77, ldr: 71 } },

    // LPL 2011 — Season 1 China regional / IEM
    { id: 11171, name: "YMS",          role: "TOP",   team: "WE",   year: 2011, rating: 73, quality: "Silver",   region: "LPL", stats: { mec: 80, tmf: 73, frm: 70, cmp: 70, map: 72, ldr: 78 } },
    { id: 11172, name: "YJTM",         role: "JNG",   team: "WE",   year: 2011, rating: 74, quality: "Silver",   region: "LPL", stats: { mec: 76, tmf: 80, frm: 71, cmp: 71, map: 79, ldr: 75 } },
    { id: 11173, name: "Misaya",       role: "MID",   team: "WE",   year: 2011, rating: 80, quality: "Gold",     region: "LPL", stats: { mec: 87, tmf: 81, frm: 77, cmp: 78, map: 79, ldr: 83 } },
    { id: 11174, name: "WeiXiao",      role: "ADC",   team: "WE",   year: 2011, rating: 81, quality: "Gold",     region: "LPL", stats: { mec: 88, tmf: 81, frm: 79, cmp: 78, map: 80, ldr: 84 } },
    { id: 11175, name: "if",           role: "SUP",   team: "WE",   year: 2011, rating: 71, quality: "Silver",   region: "LPL", stats: { mec: 65, tmf: 79, frm: 69, cmp: 69, map: 78, ldr: 70 } },
    { id: 11176, name: "XiaoXiao",     role: "TOP",   team: "IG",   year: 2011, rating: 68, quality: "Silver",   region: "LPL", stats: { mec: 75, tmf: 69, frm: 65, cmp: 65, map: 67, ldr: 72 } },
    { id: 11177, name: "illuSioN",     role: "JNG",   team: "IG",   year: 2011, rating: 70, quality: "Silver",   region: "LPL", stats: { mec: 72, tmf: 77, frm: 67, cmp: 67, map: 76, ldr: 72 } },
    { id: 11178, name: "Wh1t3zZ",      role: "MID",   team: "IG",   year: 2011, rating: 72, quality: "Silver",   region: "LPL", stats: { mec: 80, tmf: 73, frm: 69, cmp: 69, map: 72, ldr: 77 } },
    { id: 11179, name: "Tabe",         role: "ADC",   team: "IG",   year: 2011, rating: 73, quality: "Silver",   region: "LPL", stats: { mec: 79, tmf: 74, frm: 71, cmp: 71, map: 72, ldr: 78 } },
    { id: 11180, name: "Chris",        role: "SUP",   team: "IG",   year: 2011, rating: 66, quality: "Silver",   region: "LPL", stats: { mec: 62, tmf: 75, frm: 63, cmp: 63, map: 74, ldr: 66 } },

    // LCK 2012 — OGN Champions Summer 2012
    { id: 11181, name: "Shy",          role: "TOP",   team: "AZF",  year: 2012, rating: 84, quality: "Platinum", region: "LCK", stats: { mec: 90, tmf: 84, frm: 82, cmp: 82, map: 82, ldr: 86 } },
    { id: 11182, name: "CloudTemplar", role: "JNG",   team: "AZF",  year: 2012, rating: 82, quality: "Platinum", region: "LCK", stats: { mec: 84, tmf: 87, frm: 80, cmp: 80, map: 86, ldr: 82 } },
    { id: 11183, name: "RapidStar",    role: "MID",   team: "AZF",  year: 2012, rating: 81, quality: "Gold",     region: "LCK", stats: { mec: 88, tmf: 82, frm: 79, cmp: 79, map: 80, ldr: 83 } },
    { id: 11184, name: "Woong",        role: "ADC",   team: "AZF",  year: 2012, rating: 81, quality: "Gold",     region: "LCK", stats: { mec: 87, tmf: 81, frm: 79, cmp: 79, map: 80, ldr: 84 } },
    { id: 11185, name: "MadLife",      role: "SUP",   team: "AZF",  year: 2012, rating: 89, quality: "Diamond",  region: "LCK", stats: { mec: 77, tmf: 91, frm: 87, cmp: 88, map: 92, ldr: 84 } },
    { id: 11186, name: "MakNooN",      role: "TOP",   team: "NJS",  year: 2012, rating: 83, quality: "Platinum", region: "LCK", stats: { mec: 89, tmf: 83, frm: 81, cmp: 81, map: 81, ldr: 85 } },
    { id: 11187, name: "Watch",        role: "JNG",   team: "NJS",  year: 2012, rating: 79, quality: "Gold",     region: "LCK", stats: { mec: 81, tmf: 84, frm: 77, cmp: 77, map: 83, ldr: 79 } },
    { id: 11188, name: "SSONG",        role: "MID",   team: "NJS",  year: 2012, rating: 76, quality: "Gold",     region: "LCK", stats: { mec: 83, tmf: 77, frm: 73, cmp: 74, map: 76, ldr: 80 } },
    { id: 11189, name: "PraY",         role: "ADC",   team: "NJS",  year: 2012, rating: 84, quality: "Platinum", region: "LCK", stats: { mec: 90, tmf: 84, frm: 82, cmp: 82, map: 83, ldr: 86 } },
    { id: 11190, name: "Cain",         role: "SUP",   team: "NJS",  year: 2012, rating: 77, quality: "Gold",     region: "LCK", stats: { mec: 70, tmf: 83, frm: 75, cmp: 75, map: 82, ldr: 74 } },
    { id: 11191, name: "Reapered",     role: "TOP",   team: "AZB",  year: 2012, rating: 82, quality: "Platinum", region: "LCK", stats: { mec: 88, tmf: 82, frm: 80, cmp: 80, map: 80, ldr: 84 } },
    { id: 11192, name: "Helios",       role: "JNG",   team: "AZB",  year: 2012, rating: 79, quality: "Gold",     region: "LCK", stats: { mec: 81, tmf: 84, frm: 77, cmp: 77, map: 83, ldr: 79 } },
    { id: 11193, name: "Ambition",     role: "MID",   team: "AZB",  year: 2012, rating: 83, quality: "Platinum", region: "LCK", stats: { mec: 90, tmf: 83, frm: 81, cmp: 81, map: 82, ldr: 85 } },
    { id: 11194, name: "CptJack",      role: "ADC",   team: "AZB",  year: 2012, rating: 78, quality: "Gold",     region: "LCK", stats: { mec: 85, tmf: 78, frm: 76, cmp: 76, map: 77, ldr: 81 } },
    { id: 11195, name: "Lustboy",      role: "SUP",   team: "AZB",  year: 2012, rating: 80, quality: "Gold",     region: "LCK", stats: { mec: 73, tmf: 85, frm: 78, cmp: 78, map: 84, ldr: 76 } },
    { id: 11196, name: "Joker",        role: "TOP",   team: "ST",   year: 2012, rating: 72, quality: "Silver",   region: "LCK", stats: { mec: 79, tmf: 72, frm: 69, cmp: 69, map: 71, ldr: 76 } },
    { id: 11197, name: "Ryu",          role: "JNG",   team: "ST",   year: 2012, rating: 79, quality: "Gold",     region: "LCK", stats: { mec: 81, tmf: 84, frm: 77, cmp: 77, map: 83, ldr: 79 } },
    { id: 11198, name: "5cean",        role: "MID",   team: "ST",   year: 2012, rating: 74, quality: "Silver",   region: "LCK", stats: { mec: 82, tmf: 75, frm: 71, cmp: 71, map: 74, ldr: 79 } },
    { id: 11199, name: "Locodoco",     role: "ADC",   team: "ST",   year: 2012, rating: 75, quality: "Gold",     region: "LCK", stats: { mec: 82, tmf: 76, frm: 72, cmp: 72, map: 74, ldr: 80 } },
    { id: 11200, name: "MaFa",         role: "SUP",   team: "ST",   year: 2012, rating: 76, quality: "Gold",     region: "LCK", stats: { mec: 69, tmf: 81, frm: 74, cmp: 74, map: 80, ldr: 73 } },
    { id: 11201, name: "May",          role: "TOP",   team: "XST",  year: 2012, rating: 72, quality: "Silver",   region: "LCK", stats: { mec: 79, tmf: 72, frm: 69, cmp: 69, map: 71, ldr: 76 } },
    { id: 11202, name: "Nolja",        role: "JNG",   team: "XST",  year: 2012, rating: 71, quality: "Silver",   region: "LCK", stats: { mec: 73, tmf: 77, frm: 68, cmp: 68, map: 76, ldr: 73 } },
    { id: 11203, name: "ManyReason",   role: "MID",   team: "XST",  year: 2012, rating: 73, quality: "Silver",   region: "LCK", stats: { mec: 81, tmf: 74, frm: 70, cmp: 70, map: 73, ldr: 78 } },
    { id: 11204, name: "SBS",          role: "ADC",   team: "XST",  year: 2012, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 77, tmf: 71, frm: 67, cmp: 67, map: 70, ldr: 74 } },
    { id: 11205, name: "Impact",       role: "SUP",   team: "XST",  year: 2012, rating: 72, quality: "Silver",   region: "LCK", stats: { mec: 67, tmf: 79, frm: 70, cmp: 70, map: 78, ldr: 71 } },
    { id: 11206, name: "Expession",    role: "TOP",   team: "NJSh", year: 2012, rating: 74, quality: "Silver",   region: "LCK", stats: { mec: 81, tmf: 74, frm: 71, cmp: 71, map: 73, ldr: 78 } },
    { id: 11207, name: "MOKUZA",       role: "JNG",   team: "NJSh", year: 2012, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 72, tmf: 76, frm: 67, cmp: 67, map: 75, ldr: 73 } },
    { id: 11208, name: "HooN",         role: "MID",   team: "NJSh", year: 2012, rating: 71, quality: "Silver",   region: "LCK", stats: { mec: 79, tmf: 72, frm: 68, cmp: 68, map: 71, ldr: 76 } },
    { id: 11209, name: "Hiro",         role: "ADC",   team: "NJSh", year: 2012, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 77, tmf: 71, frm: 67, cmp: 67, map: 70, ldr: 74 } },
    { id: 11210, name: "viNylCat",     role: "SUP",   team: "NJSh", year: 2012, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 65, tmf: 78, frm: 67, cmp: 68, map: 76, ldr: 69 } },
    { id: 11211, name: "Cornsalad",    role: "TOP",   team: "IM",   year: 2012, rating: 69, quality: "Silver",   region: "LCK", stats: { mec: 76, tmf: 70, frm: 66, cmp: 66, map: 68, ldr: 73 } },
    { id: 11212, name: "Ring",         role: "JNG",   team: "IM",   year: 2012, rating: 68, quality: "Silver",   region: "LCK", stats: { mec: 70, tmf: 75, frm: 65, cmp: 65, map: 73, ldr: 70 } },
    { id: 11213, name: "MidKing",      role: "MID",   team: "IM",   year: 2012, rating: 70, quality: "Silver",   region: "LCK", stats: { mec: 78, tmf: 71, frm: 67, cmp: 67, map: 70, ldr: 75 } },
    { id: 11214, name: "Paragon",      role: "ADC",   team: "IM",   year: 2012, rating: 68, quality: "Silver",   region: "LCK", stats: { mec: 75, tmf: 69, frm: 65, cmp: 65, map: 68, ldr: 72 } },
    { id: 11215, name: "Lilac",        role: "SUP",   team: "IM",   year: 2012, rating: 69, quality: "Silver",   region: "LCK", stats: { mec: 64, tmf: 77, frm: 66, cmp: 67, map: 76, ldr: 68 } },

    // LEC 2012 — EU Season 2 Regional Finals / Season 2 Worlds
    { id: 11216, name: "Darien",       role: "TOP",   team: "M5",   year: 2012, rating: 81, quality: "Gold",     region: "LEC", stats: { mec: 87, tmf: 81, frm: 79, cmp: 79, map: 79, ldr: 83 } },
    { id: 11217, name: "Diamondprox",  role: "JNG",   team: "M5",   year: 2012, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 91, frm: 85, cmp: 85, map: 90, ldr: 86 } },
    { id: 11218, name: "Alex Ich",     role: "MID",   team: "M5",   year: 2012, rating: 87, quality: "Platinum", region: "LEC", stats: { mec: 93, tmf: 87, frm: 85, cmp: 85, map: 86, ldr: 89 } },
    { id: 11219, name: "Genja",        role: "ADC",   team: "M5",   year: 2012, rating: 82, quality: "Platinum", region: "LEC", stats: { mec: 89, tmf: 82, frm: 80, cmp: 80, map: 81, ldr: 85 } },
    { id: 11220, name: "Edward",       role: "SUP",   team: "M5",   year: 2012, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 76, tmf: 89, frm: 83, cmp: 84, map: 88, ldr: 80 } },
    { id: 11221, name: "Wickd",        role: "TOP",   team: "CLGE", year: 2012, rating: 79, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 79, frm: 77, cmp: 77, map: 77, ldr: 81 } },
    { id: 11222, name: "Snoopeh",      role: "JNG",   team: "CLGE", year: 2012, rating: 78, quality: "Gold",     region: "LEC", stats: { mec: 80, tmf: 83, frm: 76, cmp: 76, map: 82, ldr: 78 } },
    { id: 11223, name: "Froggen",      role: "MID",   team: "CLGE", year: 2012, rating: 85, quality: "Platinum", region: "LEC", stats: { mec: 92, tmf: 85, frm: 83, cmp: 83, map: 84, ldr: 87 } },
    { id: 11224, name: "Yellowpete",   role: "ADC",   team: "CLGE", year: 2012, rating: 78, quality: "Gold",     region: "LEC", stats: { mec: 85, tmf: 78, frm: 76, cmp: 76, map: 77, ldr: 80 } },
    { id: 11225, name: "Krepo",        role: "SUP",   team: "CLGE", year: 2012, rating: 79, quality: "Gold",     region: "LEC", stats: { mec: 72, tmf: 84, frm: 77, cmp: 77, map: 83, ldr: 75 } },
    { id: 11226, name: "Kev1n",        role: "TOP",   team: "SKG",  year: 2012, rating: 73, quality: "Silver",   region: "LEC", stats: { mec: 80, tmf: 73, frm: 70, cmp: 70, map: 72, ldr: 77 } },
    { id: 11227, name: "Araneae",      role: "JNG",   team: "SKG",  year: 2012, rating: 73, quality: "Silver",   region: "LEC", stats: { mec: 75, tmf: 79, frm: 70, cmp: 70, map: 78, ldr: 75 } },
    { id: 11228, name: "Ocelote",      role: "MID",   team: "SKG",  year: 2012, rating: 77, quality: "Gold",     region: "LEC", stats: { mec: 84, tmf: 78, frm: 74, cmp: 75, map: 77, ldr: 81 } },
    { id: 11229, name: "YellOwStaR",   role: "ADC",   team: "SKG",  year: 2012, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 87, tmf: 80, frm: 78, cmp: 78, map: 79, ldr: 83 } },
    { id: 11230, name: "Nyph",         role: "SUP",   team: "SKG",  year: 2012, rating: 76, quality: "Gold",     region: "LEC", stats: { mec: 69, tmf: 81, frm: 74, cmp: 74, map: 80, ldr: 73 } },
    { id: 11231, name: "sOAZ",         role: "TOP",   team: "FNC",  year: 2012, rating: 82, quality: "Platinum", region: "LEC", stats: { mec: 88, tmf: 82, frm: 80, cmp: 80, map: 80, ldr: 84 } },
    { id: 11232, name: "Cyanide",      role: "JNG",   team: "FNC",  year: 2012, rating: 79, quality: "Gold",     region: "LEC", stats: { mec: 81, tmf: 84, frm: 77, cmp: 77, map: 83, ldr: 79 } },
    { id: 11233, name: "xPeke",        role: "MID",   team: "FNC",  year: 2012, rating: 86, quality: "Platinum", region: "LEC", stats: { mec: 92, tmf: 86, frm: 84, cmp: 84, map: 85, ldr: 88 } },
    { id: 11234, name: "LaMiaZealot",  role: "ADC",   team: "FNC",  year: 2012, rating: 73, quality: "Silver",   region: "LEC", stats: { mec: 80, tmf: 74, frm: 70, cmp: 70, map: 73, ldr: 78 } },
    { id: 11235, name: "nRated",       role: "SUP",   team: "FNC",  year: 2012, rating: 80, quality: "Gold",     region: "LEC", stats: { mec: 73, tmf: 85, frm: 78, cmp: 78, map: 84, ldr: 76 } },
    { id: 11236, name: "Kikis",        role: "TOP",   team: "ELH",  year: 2012, rating: 72, quality: "Silver",   region: "LEC", stats: { mec: 79, tmf: 72, frm: 69, cmp: 69, map: 71, ldr: 76 } },
    { id: 11237, name: "Veggie",       role: "JNG",   team: "ELH",  year: 2012, rating: 70, quality: "Silver",   region: "LEC", stats: { mec: 72, tmf: 76, frm: 67, cmp: 67, map: 75, ldr: 72 } },
    { id: 11238, name: "Shushei",      role: "MID",   team: "ELH",  year: 2012, rating: 79, quality: "Gold",     region: "LEC", stats: { mec: 86, tmf: 80, frm: 77, cmp: 77, map: 78, ldr: 82 } },
    { id: 11239, name: "Vander",       role: "ADC",   team: "ELH",  year: 2012, rating: 73, quality: "Silver",   region: "LEC", stats: { mec: 80, tmf: 74, frm: 70, cmp: 70, map: 73, ldr: 78 } },
    { id: 11240, name: "Grom",         role: "SUP",   team: "ELH",  year: 2012, rating: 70, quality: "Silver",   region: "LEC", stats: { mec: 65, tmf: 78, frm: 67, cmp: 68, map: 76, ldr: 69 } },

    // LPL 2012 — Season 2 China Regional / Season 2 Worlds
    { id: 11241, name: "CaoMei",       role: "TOP",   team: "WE",   year: 2012, rating: 79, quality: "Gold",     region: "LPL", stats: { mec: 85, tmf: 79, frm: 77, cmp: 77, map: 77, ldr: 81 } },
    { id: 11242, name: "ClearLove",    role: "JNG",   team: "WE",   year: 2012, rating: 82, quality: "Platinum", region: "LPL", stats: { mec: 84, tmf: 87, frm: 80, cmp: 80, map: 86, ldr: 82 } },
    { id: 11243, name: "Misaya",       role: "MID",   team: "WE",   year: 2012, rating: 83, quality: "Platinum", region: "LPL", stats: { mec: 90, tmf: 83, frm: 81, cmp: 81, map: 82, ldr: 85 } },
    { id: 11244, name: "WeiXiao",      role: "ADC",   team: "WE",   year: 2012, rating: 87, quality: "Platinum", region: "LPL", stats: { mec: 93, tmf: 87, frm: 85, cmp: 85, map: 86, ldr: 89 } },
    { id: 11245, name: "FZZF",         role: "SUP",   team: "WE",   year: 2012, rating: 73, quality: "Silver",   region: "LPL", stats: { mec: 67, tmf: 80, frm: 71, cmp: 71, map: 79, ldr: 71 } },
    { id: 11246, name: "PDD",          role: "TOP",   team: "IG",   year: 2012, rating: 77, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 77, frm: 75, cmp: 75, map: 75, ldr: 80 } },
    { id: 11247, name: "illuSioN",     role: "JNG",   team: "IG",   year: 2012, rating: 73, quality: "Silver",   region: "LPL", stats: { mec: 75, tmf: 79, frm: 70, cmp: 70, map: 78, ldr: 75 } },
    { id: 11248, name: "Zz1tai",       role: "MID",   team: "IG",   year: 2012, rating: 76, quality: "Gold",     region: "LPL", stats: { mec: 83, tmf: 77, frm: 73, cmp: 74, map: 76, ldr: 80 } },
    { id: 11249, name: "Kid",          role: "ADC",   team: "IG",   year: 2012, rating: 73, quality: "Silver",   region: "LPL", stats: { mec: 80, tmf: 74, frm: 70, cmp: 70, map: 73, ldr: 78 } },
    { id: 11250, name: "XiaoXiao",     role: "SUP",   team: "IG",   year: 2012, rating: 71, quality: "Silver",   region: "LPL", stats: { mec: 66, tmf: 78, frm: 69, cmp: 69, map: 77, ldr: 70 } },
    { id: 11251, name: "Cool",         role: "TOP",   team: "Ark",  year: 2012, rating: 78, quality: "Gold",     region: "LPL", stats: { mec: 84, tmf: 78, frm: 76, cmp: 76, map: 76, ldr: 81 } },
    { id: 11252, name: "Bdmonster",    role: "JNG",   team: "Ark",  year: 2012, rating: 72, quality: "Silver",   region: "LPL", stats: { mec: 74, tmf: 78, frm: 69, cmp: 69, map: 77, ldr: 74 } },
    { id: 11253, name: "Wh1t3zZ",      role: "MID",   team: "Ark",  year: 2012, rating: 75, quality: "Gold",     region: "LPL", stats: { mec: 82, tmf: 76, frm: 72, cmp: 73, map: 75, ldr: 80 } },
    { id: 11254, name: "Crescent",     role: "ADC",   team: "Ark",  year: 2012, rating: 71, quality: "Silver",   region: "LPL", stats: { mec: 78, tmf: 72, frm: 68, cmp: 68, map: 71, ldr: 76 } },
    { id: 11255, name: "Tabe",         role: "SUP",   team: "Ark",  year: 2012, rating: 76, quality: "Gold",     region: "LPL", stats: { mec: 70, tmf: 81, frm: 74, cmp: 74, map: 80, ldr: 73 } },
    { id: 11256, name: "Senou",        role: "TOP",   team: "LGD",  year: 2012, rating: 72, quality: "Silver",   region: "LPL", stats: { mec: 79, tmf: 72, frm: 69, cmp: 69, map: 71, ldr: 76 } },
    { id: 11257, name: "Tyrant",       role: "JNG",   team: "LGD",  year: 2012, rating: 71, quality: "Silver",   region: "LPL", stats: { mec: 73, tmf: 77, frm: 68, cmp: 68, map: 76, ldr: 73 } },
    { id: 11258, name: "Zw",           role: "MID",   team: "LGD",  year: 2012, rating: 73, quality: "Silver",   region: "LPL", stats: { mec: 81, tmf: 74, frm: 70, cmp: 70, map: 73, ldr: 78 } },
    { id: 11259, name: "Victor",       role: "ADC",   team: "LGD",  year: 2012, rating: 72, quality: "Silver",   region: "LPL", stats: { mec: 79, tmf: 73, frm: 69, cmp: 69, map: 72, ldr: 77 } },
    { id: 11260, name: "Godlike",      role: "SUP",   team: "LGD",  year: 2012, rating: 71, quality: "Silver",   region: "LPL", stats: { mec: 66, tmf: 79, frm: 68, cmp: 69, map: 78, ldr: 70 } },
    { id: 11261, name: "MAX",          role: "TOP",   team: "EH",   year: 2012, rating: 70, quality: "Silver",   region: "LPL", stats: { mec: 77, tmf: 71, frm: 67, cmp: 67, map: 69, ldr: 74 } },
    { id: 11262, name: "Mor",          role: "JNG",   team: "EH",   year: 2012, rating: 72, quality: "Silver",   region: "LPL", stats: { mec: 74, tmf: 78, frm: 69, cmp: 69, map: 77, ldr: 74 } },
    { id: 11263, name: "MM",           role: "MID",   team: "EH",   year: 2012, rating: 71, quality: "Silver",   region: "LPL", stats: { mec: 79, tmf: 72, frm: 68, cmp: 68, map: 71, ldr: 76 } },
    { id: 11264, name: "Vasilii",      role: "ADC",   team: "EH",   year: 2012, rating: 73, quality: "Silver",   region: "LPL", stats: { mec: 80, tmf: 74, frm: 70, cmp: 70, map: 73, ldr: 78 } },
    { id: 11265, name: "Lucky",        role: "SUP",   team: "EH",   year: 2012, rating: 71, quality: "Silver",   region: "LPL", stats: { mec: 66, tmf: 79, frm: 68, cmp: 69, map: 78, ldr: 70 } },
];

window.playerDatabase = baseDatabase.map(p => {
    return { ...p, stats: p.stats ? p.stats : genStats(p.rating) };
});