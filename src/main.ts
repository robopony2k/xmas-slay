const canvas = document.getElementById("scene") as HTMLCanvasElement | null;
const context = canvas?.getContext("2d");

if (!canvas || !context) {
  throw new Error("Canvas element or 2D context could not be initialized.");
}

const resizeCanvas = () => {
  const dpr = window.devicePixelRatio || 1;
  const { innerWidth, innerHeight } = window;

  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
};

const render = () => {
  context.clearRect(0, 0, canvas.width, canvas.height);
  requestAnimationFrame(render);
};

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
requestAnimationFrame(render);
