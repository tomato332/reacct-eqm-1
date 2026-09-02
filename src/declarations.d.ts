declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module 'https://esm.sh/maplibre-gl@3' {
  export interface MapOptions {
    container: HTMLElement | string;
    style?: any;
    center?: [number, number];
    zoom?: number;
    [key: string]: any;
  }

  export class Map {
    constructor(options: MapOptions);
    remove(): void;
    resize(): void;
    addSource(id: string, source: any): this;
    addLayer(layer: any): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  const maplibregl: {
    Map: typeof Map;
    [key: string]: any;
  };

  export default maplibregl;
}
