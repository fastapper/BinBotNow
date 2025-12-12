// src/lib/bus.ts
type Handler = () => void;

class Bus {
  private map = new Map<string, Set<Handler>>();

  on(evt: string, fn: Handler) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt)!.add(fn);
    return () => this.off(evt, fn);
  }
  off(evt: string, fn: Handler) {
    this.map.get(evt)?.delete(fn);
  }
  emit(evt: string) {
    this.map.get(evt)?.forEach(fn => {
      try { fn(); } catch {}
    });
  }
}

export const bus = new Bus();

// Eventos comunes
export const EV_REFRESH_SOFT = 'refresh-soft';   // actualizar listas/indicadores livianos
export const EV_REFRESH_HARD = 'refresh-hard';   // recomputar todo (p. ej. tras CLOSE ALL)
