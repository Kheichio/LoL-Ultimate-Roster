export function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn(`Failed to save ${key}:`, e);
    }
}

export function loadFromStorage(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw !== null ? JSON.parse(raw) : null;
    } catch (e) {
        console.warn(`Failed to load ${key}:`, e);
        return null;
    }
}

export function clearStorage() {
    localStorage.clear();
}
