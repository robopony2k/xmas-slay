export interface Layer {
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, camera: Vector2): void;
  resize(width: number, height: number): void;
}

export interface Vector2 {
  x: number;
  y: number;
}

export const viewState = {
  worldWidth: 0,
  worldHeight: 0,
  offsetX: 0,
  offsetY: 0,
};

export abstract class BaseLayer implements Layer {
  protected width: number;
  protected height: number;
  protected readonly parallax: number;
  public enabled = true;

  constructor(width: number, height: number, parallax: number) {
    this.width = width;
    this.height = height;
    this.parallax = parallax;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.handleResize();
  }

  update(_dt: number): void {}

  protected handleResize(): void {}

  protected parallaxOffset(camera: Vector2): Vector2 {
    return {
      x: viewState.offsetX + camera.x * this.parallax,
      y: viewState.offsetY + camera.y * this.parallax,
    };
  }

  abstract draw(ctx: CanvasRenderingContext2D, camera: Vector2): void;
}
