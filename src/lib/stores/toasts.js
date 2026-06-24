import { writable } from 'svelte/store';

export const toasts = writable([]);

let _id = 0;

export function showToast(message, type = 'info', duration = 3000) {
    const id = ++_id;
    toasts.update(t => [...t, { id, message, type }]);
    setTimeout(() => {
        toasts.update(t => t.filter(x => x.id !== id));
    }, duration);
}
